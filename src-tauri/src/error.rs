use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn invalid_url() -> Self {
        Self::new(
            "invalid_url",
            "올바른 YouTube URL이 아닙니다. youtube.com 또는 youtu.be 주소를 입력하세요.",
        )
    }

    pub fn ytdlp_missing() -> Self {
        Self::new(
            "ytdlp_missing",
            "yt-dlp를 찾을 수 없습니다. 애플리케이션 바이너리가 준비되어 있는지 확인하세요.",
        )
    }

    pub fn metadata_failed() -> Self {
        Self::new(
            "metadata_failed",
            "영상 정보를 불러오지 못했습니다. URL을 확인한 뒤 다시 시도하세요.",
        )
    }

    pub fn download_failed() -> Self {
        Self::new(
            "download_failed",
            "다운로드에 실패했습니다. 네트워크와 저장 폴더를 확인하세요.",
        )
    }

    pub fn cancelled() -> Self {
        Self::new("cancelled", "다운로드가 취소되었습니다.")
    }

    pub fn ffmpeg_missing() -> Self {
        Self::new(
            "ffmpeg",
            "ffmpeg를 찾을 수 없습니다. MP3 변환이나 고화질 영상 병합에 필요합니다.",
        )
    }

    pub fn already_downloading() -> Self {
        Self::new(
            "already_downloading",
            "이미 다운로드가 진행 중입니다.",
        )
    }

    pub fn update_busy() -> Self {
        Self::new(
            "update_busy",
            "다운로드가 끝난 뒤에 yt-dlp를 업데이트할 수 있습니다.",
        )
    }

    pub fn update_failed() -> Self {
        Self::new(
            "update_failed",
            "yt-dlp를 업데이트하지 못했습니다. 네트워크 상태를 확인하세요.",
        )
    }

    pub fn invalid_output_dir() -> Self {
        Self::new(
            "output_dir",
            "저장 폴더를 열 수 없습니다. 폴더가 있는지 확인하세요.",
        )
    }

    pub fn invalid_options() -> Self {
        Self::new("invalid_options", "다운로드 옵션이 올바르지 않습니다.")
    }

    pub fn from_download_stderr(stderr: &str) -> Self {
        Self::classify(stderr, true)
    }

    pub fn from_ytdlp_stderr(stderr: &str) -> Self {
        Self::classify(stderr, false)
    }

    fn classify(stderr: &str, is_download: bool) -> Self {
        let text = stderr.to_ascii_lowercase();
        let fallback = if is_download {
            Self::download_failed()
        } else {
            Self::metadata_failed()
        };
        let network_message = if is_download {
            "네트워크 오류로 다운로드하지 못했습니다."
        } else {
            "네트워크 오류로 영상 정보를 가져오지 못했습니다."
        };

        let classified = if contains_any(
            &text,
            &[
                "unsupported url",
                "is not a valid url",
                "invalid url",
                "not a valid url",
            ],
        ) {
            Self::invalid_url()
        } else if contains_any(
            &text,
            &[
                "private video",
                "login required",
                "sign in to confirm",
                "members-only",
                "members only",
            ],
        ) {
            Self::new(
                "private_video",
                "비공개 영상이거나 로그인이 필요한 영상입니다.",
            )
        } else if contains_any(
            &text,
            &[
                "ffmpeg not found",
                "ffmpeg is not installed",
                "ffmpeg isn't installed",
                "install ffmpeg",
                "merging of multiple formats",
                "ffmpeg exited",
                "ffmpeg conversion",
            ],
        ) {
            Self::new(
                "ffmpeg",
                "ffmpeg 실행 중 문제가 발생했습니다. ffmpeg가 설치되어 있는지 확인하세요.",
            )
        } else if is_format_unavailable(&text) {
            Self::new(
                "format_unavailable",
                "선택한 화질이나 포맷을 받을 수 없습니다. Best로 다시 시도하거나 ffmpeg 설치 여부를 확인하세요.",
            )
        } else if contains_any(
            &text,
            &[
                "the page needs to be reloaded",
                "please reload",
                "nsig extraction failed",
                "please update yt-dlp",
            ],
        ) {
            Self::new(
                "youtube_challenge",
                "YouTube가 다운로드를 일시적으로 막았습니다. 잠시 후 다시 시도하세요.",
            )
        } else if contains_any(
            &text,
            &["no space", "not enough space", "disk full", "not enough disk"],
        ) {
            Self::new("disk", "디스크 공간이 부족합니다.")
        } else if contains_any(
            &text,
            &[
                "not available in your country",
                "blocked it in your country",
                "geo-restricted",
                "geographic restriction",
            ],
        ) {
            Self::new(
                "geo_restricted",
                "이 영상은 현재 지역에서 시청할 수 없습니다.",
            )
        } else if is_video_missing(&text) {
            Self::new(
                "not_found",
                "영상을 찾을 수 없습니다. 삭제되었거나 잘못된 주소일 수 있습니다.",
            )
        } else if contains_any(
            &text,
            &[
                "unable to download webpage",
                "network is unreachable",
                "timed out",
                "timeout",
                "urlopen",
                "connection reset",
                "connection refused",
                "temporary failure",
                "http error 5",
            ],
        ) {
            Self::new("network", network_message)
        } else {
            log::error!("yt-dlp stderr: {stderr}");
            eprintln!("yt-dlp stderr: {stderr}");
            fallback
        };

        classified.with_detail(stderr)
    }

    fn with_detail(self, stderr: &str) -> Self {
        let Some(detail) = last_error_detail(stderr) else {
            return self;
        };

        if self.message.contains(&detail) {
            return self;
        }

        Self {
            message: format!("{}\n{detail}", self.message),
            ..self
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

fn is_format_unavailable(text: &str) -> bool {
    contains_any(
        text,
        &[
            "requested format is not available",
            "requested format isn't available",
            "format is not available",
            "only images are available",
            "requested format not available",
        ],
    )
}

fn is_video_missing(text: &str) -> bool {
    if is_format_unavailable(text) {
        return false;
    }

    contains_any(
        text,
        &[
            "video unavailable",
            "this video is unavailable",
            "this video is not available",
            "video does not exist",
            "removed by the uploader",
            "has been removed",
        ],
    )
}

fn last_error_detail(stderr: &str) -> Option<String> {
    stderr.lines().rev().find_map(|line| {
        let trimmed = line.trim();
        let lower = trimmed.to_ascii_lowercase();
        let index = lower.find("error:")?;
        let mut detail = trimmed[index + "error:".len()..].trim().to_string();
        if detail.is_empty() {
            return None;
        }

        if let Some(rest) = detail.strip_prefix('[') {
            if let Some(end) = rest.find(']') {
                let after = rest[end + 1..].trim().trim_start_matches(':').trim();
                if !after.is_empty() {
                    detail = after.to_string();
                }
            }
        }

        Some(truncate(&detail, 240))
    })
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let shortened: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{shortened}…")
    } else {
        shortened
    }
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn format_unavailable_is_not_treated_as_missing_video() {
        let error = AppError::from_download_stderr(
            "ERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats for a list of available formats",
        );
        assert_eq!(error.code, "format_unavailable");
        assert!(!error.message.contains("찾을 수 없습니다"));
        assert!(error.message.contains("Requested format is not available"));
    }

    #[test]
    fn fragment_404_is_not_treated_as_missing_video() {
        let error = AppError::from_download_stderr("[download] Got error: HTTP Error 404: Not Found");
        assert_ne!(error.code, "not_found");
        assert!(!error.message.contains("찾을 수 없습니다"));
    }

    #[test]
    fn video_unavailable_is_not_found() {
        let error = AppError::from_ytdlp_stderr("ERROR: [youtube] abc123: Video unavailable");
        assert_eq!(error.code, "not_found");
        assert!(error.message.contains("찾을 수 없습니다"));
        assert!(error.message.contains("Video unavailable"));
    }

    #[test]
    fn ffmpeg_merge_error_wins_over_generic_fallback() {
        let error = AppError::from_download_stderr(
            "ERROR: You have requested merging of multiple formats but ffmpeg is not installed. Please install ffmpeg",
        );
        assert_eq!(error.code, "ffmpeg");
    }

    #[test]
    fn page_reload_is_not_treated_as_network() {
        let error = AppError::from_download_stderr(
            "ERROR: [youtube] Ht6lcYg9Zfo: The page needs to be reloaded.",
        );
        assert_eq!(error.code, "youtube_challenge");
        assert!(!error.message.contains("네트워크"));
        assert!(!error.message.contains("저장 폴더"));
        assert!(error.message.contains("다시 시도"));
    }
}
