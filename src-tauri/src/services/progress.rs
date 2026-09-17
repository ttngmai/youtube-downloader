const DOWNLOAD_SPAN: f64 = 95.0;

#[derive(Debug, Clone, PartialEq)]
pub enum LineEvent {
    Progress {
        percent: f64,
        downloaded_bytes: Option<u64>,
        total_bytes: Option<u64>,
        speed: Option<f64>,
        eta: Option<u64>,
    },
    Processing {
        message: &'static str,
    },
    Destination {
        path: String,
    },
}

/// Combines sequential yt-dlp file downloads (video then audio) into one 0–95% bar.
#[derive(Debug, Clone)]
pub struct ProgressAggregator {
    expected_files: u32,
    completed_files: u32,
    in_file: bool,
    current_file_percent: f64,
    finished_bytes: u64,
    current_total: Option<u64>,
    current_downloaded: u64,
}

impl ProgressAggregator {
    pub fn new(expected_files: u32) -> Self {
        Self {
            expected_files: expected_files.max(1),
            completed_files: 0,
            in_file: false,
            current_file_percent: 0.0,
            finished_bytes: 0,
            current_total: None,
            current_downloaded: 0,
        }
    }

    pub fn begin_file(&mut self) {
        if self.in_file && self.current_file_percent >= 99.0 {
            self.complete_current_file();
        } else if !self.in_file {
            self.in_file = true;
            self.reset_current_file();
        }
    }

    pub fn update(
        &mut self,
        percent: f64,
        downloaded_bytes: Option<u64>,
        total_bytes: Option<u64>,
    ) -> f64 {
        if !self.in_file {
            self.in_file = true;
        }

        self.current_file_percent = percent.clamp(0.0, 100.0);
        if let Some(total) = total_bytes.filter(|value| *value > 0) {
            self.current_total = Some(total);
            self.current_downloaded = downloaded_bytes.unwrap_or_else(|| {
                ((self.current_file_percent / 100.0) * total as f64).round().max(0.0) as u64
            });
        } else if let Some(downloaded) = downloaded_bytes {
            self.current_downloaded = downloaded;
        }

        self.overall_percent()
    }

    pub fn mark_processing(&mut self) -> f64 {
        DOWNLOAD_SPAN
    }

    fn complete_current_file(&mut self) {
        self.completed_files = self.completed_files.saturating_add(1);
        if let Some(total) = self.current_total {
            self.finished_bytes = self.finished_bytes.saturating_add(total);
        }
        self.reset_current_file();
    }

    fn reset_current_file(&mut self) {
        self.current_file_percent = 0.0;
        self.current_total = None;
        self.current_downloaded = 0;
    }

    fn overall_percent(&self) -> f64 {
        let parts = self.expected_files.max(self.completed_files + 1).max(1);
        let current = (self.current_file_percent / 100.0).clamp(0.0, 1.0);
        let equal_weight =
            ((self.completed_files as f64 + current) / parts as f64) * DOWNLOAD_SPAN;

        if let Some(current_total) = self.current_total {
            let downloaded = self.finished_bytes.saturating_add(self.current_downloaded);
            let total = self
                .finished_bytes
                .saturating_add(current_total.max(self.current_downloaded));
            if total > 0 && self.completed_files + 1 >= self.expected_files {
                let by_bytes = (downloaded as f64 / total as f64) * DOWNLOAD_SPAN;
                return by_bytes.max(equal_weight).clamp(0.0, DOWNLOAD_SPAN);
            }
        }

        equal_weight.clamp(0.0, DOWNLOAD_SPAN)
    }
}

pub fn interpret_line(line: &str) -> Vec<LineEvent> {
    let trimmed = line.trim().trim_matches('\r').trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut events = Vec::new();

    if let Some(path) = parse_destination(trimmed) {
        events.push(LineEvent::Destination { path });
    }

    if let Some(message) = processing_message(trimmed) {
        events.push(LineEvent::Processing { message });
    }

    if let Some(progress) = parse_download_percent(trimmed) {
        events.push(progress);
    }

    events
}

fn parse_download_percent(line: &str) -> Option<LineEvent> {
    let rest = line.strip_prefix("[download]")?.trim();
    if rest.starts_with("Destination:") {
        return None;
    }

    let percent_idx = rest.find('%')?;
    let percent: f64 = rest[..percent_idx]
        .split_whitespace()
        .last()?
        .parse()
        .ok()?;
    if !percent.is_finite() || percent < 0.0 {
        return None;
    }

    let after = rest[percent_idx + 1..].trim();
    let mut total_bytes = None;
    let mut speed = None;
    let mut eta = None;

    if let Some(of_idx) = after.find("of ") {
        let size_part = after[of_idx + 3..].trim().trim_start_matches('~').trim();
        if let Some((bytes, _)) = parse_size_token(size_part) {
            total_bytes = Some(bytes);
        }
    }

    if let Some(at_idx) = after.find("at ") {
        let speed_part = after[at_idx + 3..].trim();
        if let Some((bytes, _)) = parse_size_token(speed_part) {
            speed = Some(bytes as f64);
        }
    }

    if let Some(eta_idx) = after.find("ETA ") {
        let eta_part = after[eta_idx + 4..].trim();
        let token = eta_part.split_whitespace().next().unwrap_or("");
        eta = parse_hms(token);
    }

    let downloaded_bytes = total_bytes.map(|total| {
        ((percent / 100.0) * total as f64).round().max(0.0) as u64
    });

    Some(LineEvent::Progress {
        percent: percent.min(100.0),
        downloaded_bytes,
        total_bytes,
        speed,
        eta,
    })
}

fn parse_destination(line: &str) -> Option<String> {
    if let Some(path) = line.strip_prefix("[download] Destination: ") {
        return non_empty(path);
    }

    if let Some(path) = line.strip_prefix("[ExtractAudio] Destination: ") {
        return non_empty(path);
    }

    if let Some(rest) = line.strip_prefix("[Merger] Merging formats into ") {
        return non_empty(&unquote(rest));
    }

    if line.contains("[MoveFiles]") {
        if let Some(idx) = line.rfind(" to ") {
            return non_empty(&unquote(&line[idx + 4..]));
        }
    }

    None
}

fn processing_message(line: &str) -> Option<&'static str> {
    if line.starts_with("[Merger]") || line.starts_with("[VideoRemuxer]") {
        return Some("영상과 음성을 병합하고 있습니다.");
    }

    if line.starts_with("[ExtractAudio]") || line.starts_with("[VideoConvertor]") {
        return Some("오디오를 변환하고 있습니다.");
    }

    if line.starts_with("[Fixup") {
        return Some("파일을 정리하고 있습니다.");
    }

    None
}

fn parse_size_token(input: &str) -> Option<(u64, &str)> {
    let input = input.trim();
    let mut num_end = 0;
    for (index, ch) in input.char_indices() {
        if ch.is_ascii_digit() || ch == '.' {
            num_end = index + ch.len_utf8();
        } else {
            break;
        }
    }

    if num_end == 0 {
        return None;
    }

    let number: f64 = input[..num_end].parse().ok()?;
    if !number.is_finite() || number < 0.0 {
        return None;
    }

    let rest = input[num_end..].trim_start();
    let unit: String = rest.chars().take_while(|ch| ch.is_ascii_alphabetic()).collect();
    if unit.is_empty() {
        return None;
    }

    let multiplier = unit_to_bytes(&unit)?;
    let bytes = (number * multiplier as f64).round() as u64;
    Some((bytes, rest[unit.len()..].trim_start()))
}

fn unit_to_bytes(unit: &str) -> Option<u64> {
    Some(match unit.to_ascii_uppercase().as_str() {
        "B" => 1,
        "K" | "KIB" => 1024,
        "M" | "MIB" => 1024 * 1024,
        "G" | "GIB" => 1024 * 1024 * 1024,
        "T" | "TIB" => 1024u64.pow(4),
        "KB" => 1000,
        "MB" => 1_000_000,
        "GB" => 1_000_000_000,
        _ => return None,
    })
}

fn parse_hms(value: &str) -> Option<u64> {
    let parts: Vec<&str> = value.split(':').collect();
    match parts.as_slice() {
        [minutes, seconds] => {
            let minutes: u64 = minutes.parse().ok()?;
            let seconds: u64 = seconds.parse().ok()?;
            Some(minutes * 60 + seconds)
        }
        [hours, minutes, seconds] => {
            let hours: u64 = hours.parse().ok()?;
            let minutes: u64 = minutes.parse().ok()?;
            let seconds: u64 = seconds.parse().ok()?;
            Some(hours * 3600 + minutes * 60 + seconds)
        }
        _ => None,
    }
}

fn unquote(value: &str) -> String {
    value.trim().trim_matches('"').trim().to_string()
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_progress_line() {
        let events = interpret_line(
            "[download]  45.2% of  12.34MiB at    1.23MiB/s ETA 00:08",
        );
        match events.as_slice() {
            [LineEvent::Progress {
                percent,
                total_bytes,
                speed,
                eta,
                ..
            }] => {
                assert!((percent - 45.2).abs() < f64::EPSILON);
                assert_eq!(*total_bytes, Some((12.34_f64 * 1024.0 * 1024.0).round() as u64));
                assert!(speed.is_some());
                assert_eq!(*eta, Some(8));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_estimated_size_and_completion() {
        let estimated = interpret_line(
            "[download]  12.3% of ~ 4.56MiB at  123.45KiB/s ETA 00:32",
        );
        assert!(matches!(
            estimated.as_slice(),
            [LineEvent::Progress { percent, .. }] if (*percent - 12.3).abs() < f64::EPSILON
        ));

        let done = interpret_line("[download] 100% of 10.00MiB in 00:20 at 500.00KiB/s");
        assert!(matches!(
            done.as_slice(),
            [LineEvent::Progress { percent, eta: None, .. }] if (*percent - 100.0).abs() < f64::EPSILON
        ));
    }

    #[test]
    fn parses_destination_and_merger_lines() {
        let dest = interpret_line(r"[download] Destination: C:\Videos\Me at the zoo.mp4");
        assert_eq!(
            dest,
            vec![LineEvent::Destination {
                path: r"C:\Videos\Me at the zoo.mp4".to_string(),
            }]
        );

        let merged = interpret_line(r#"[Merger] Merging formats into "C:\Videos\Me at the zoo.mp4""#);
        assert!(
            merged
                .iter()
                .any(|event| matches!(event, LineEvent::Destination { .. }))
        );
        assert!(
            merged
                .iter()
                .any(|event| matches!(event, LineEvent::Processing { .. }))
        );
    }

    #[test]
    fn parses_progress_with_fragment_suffix() {
        let events = interpret_line(
            "[download]  62.4% of ~  80.00MiB at  2.00MiB/s ETA 00:15 (frag 40/64)",
        );
        assert!(matches!(
            events.as_slice(),
            [LineEvent::Progress { percent, .. }] if (*percent - 62.4).abs() < f64::EPSILON
        ));
    }

    #[test]
    fn combines_video_then_audio_into_overall_progress() {
        let mut progress = ProgressAggregator::new(2);

        progress.begin_file();
        let first_mid = progress.update(50.0, Some(40 * 1024 * 1024), Some(80 * 1024 * 1024));
        assert!((first_mid - 23.75).abs() < 0.01);

        let first_done = progress.update(100.0, Some(80 * 1024 * 1024), Some(80 * 1024 * 1024));
        assert!((first_done - 47.5).abs() < 0.01);

        progress.begin_file();
        let second_mid = progress.update(50.0, Some(10 * 1024 * 1024), Some(20 * 1024 * 1024));
        assert!(second_mid > first_done);
        assert!(second_mid < 95.0);

        let second_done = progress.update(100.0, Some(20 * 1024 * 1024), Some(20 * 1024 * 1024));
        assert!((second_done - 95.0).abs() < 0.01);
        assert_eq!(progress.mark_processing(), 95.0);
    }

    #[test]
    fn single_file_download_uses_full_download_span() {
        let mut progress = ProgressAggregator::new(1);
        progress.begin_file();
        let mid = progress.update(40.0, None, None);
        assert!((mid - 38.0).abs() < 0.01);
        let done = progress.update(100.0, None, None);
        assert!((done - 95.0).abs() < 0.01);
    }
}
