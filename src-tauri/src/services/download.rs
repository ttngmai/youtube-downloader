use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

use crate::error::AppError;
use crate::models::{
    DownloadOptions, DownloadProgress, DownloadResult, ProgressStatus,
};
use crate::services::bins;
use crate::services::paths;
use crate::services::progress::{interpret_line, LineEvent, ProgressAggregator};
use crate::services::ytdlp;

const STDERR_TAIL_LIMIT: usize = 8 * 1024;

pub async fn run_download(
    app: &AppHandle,
    options: &DownloadOptions,
    cancel: &mut watch::Receiver<bool>,
) -> Result<DownloadResult, AppError> {
    let url = options.url.trim();
    if !ytdlp::is_youtube_url(url) {
        return Err(AppError::invalid_url());
    }

    let mode = options.mode.trim().to_ascii_lowercase();
    if mode != "video" && mode != "audio" {
        return Err(AppError::invalid_options());
    }

    let quality = options
        .quality
        .as_deref()
        .unwrap_or("best")
        .trim()
        .to_ascii_lowercase();
    let audio_format = options
        .audio_format
        .as_deref()
        .unwrap_or("mp3")
        .trim()
        .to_ascii_lowercase();
    let video_codec = normalize_video_codec(
        options
            .video_codec
            .as_deref()
            .unwrap_or("av1"),
    );

    if mode == "video" && !matches!(quality.as_str(), "best" | "2160" | "1440" | "1080" | "720" | "480" | "360")
    {
        return Err(AppError::invalid_options());
    }

    if mode == "video" && video_codec.is_none() {
        return Err(AppError::invalid_options());
    }

    if mode == "audio" && !matches!(audio_format.as_str(), "mp3" | "m4a") {
        return Err(AppError::invalid_options());
    }

    let output_dir = paths::resolve_output_directory(app, &options.output_directory)?;
    let ytdlp = bins::resolve_ytdlp(app)?;
    let ffmpeg = bins::resolve_ffmpeg(app);

    if mode == "audio" && audio_format == "mp3" && ffmpeg.is_none() {
        return Err(AppError::ffmpeg_missing());
    }

    emit_progress(
        app,
        &DownloadProgress {
            percent: 0.0,
            downloaded_bytes: None,
            total_bytes: None,
            speed: None,
            eta: None,
            status: ProgressStatus::Downloading,
            message: Some("다운로드를 시작합니다.".to_string()),
        },
    );

    let mut command = Command::new(&ytdlp);
    apply_download_args(
        &mut command,
        &mode,
        &quality,
        &audio_format,
        video_codec.unwrap_or("av1"),
        &output_dir,
        ffmpeg.as_deref(),
    );
    command.arg("--");
    command.arg(url);
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.kill_on_drop(true);

    #[cfg(windows)]
    command.creation_flags(bins::CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        log::error!("failed to spawn yt-dlp download: {error}");
        AppError::new("ytdlp_exec", "yt-dlp를 실행하지 못했습니다.")
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let mut stdout_lines = stdout.map(|pipe| BufReader::new(pipe).lines());
    let mut stderr_lines = stderr.map(|pipe| BufReader::new(pipe).lines());

    let mut stderr_tail = String::new();
    let mut last_path: Option<String> = None;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut last_percent = -1.0_f64;
    let expected_files: u32 = if mode == "video" && ffmpeg.is_some() { 2 } else { 1 };
    let mut aggregator = ProgressAggregator::new(expected_files);
    let mut current = DownloadProgress {
        percent: 0.0,
        downloaded_bytes: None,
        total_bytes: None,
        speed: None,
        eta: None,
        status: ProgressStatus::Downloading,
        message: Some("파일을 받는 중입니다.".to_string()),
    };

    loop {
        if *cancel.borrow() {
            let _ = child.start_kill();
            let _ = child.wait().await;
            return Err(AppError::cancelled());
        }

        if stderr_lines.is_none() && stdout_lines.is_none() {
            break;
        }

        tokio::select! {
            _ = cancel.changed() => {
                if *cancel.borrow() {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    return Err(AppError::cancelled());
                }
            }
            line = next_line_or_pending(&mut stderr_lines) => {
                match line {
                    Ok(Some(line)) => {
                        append_tail(&mut stderr_tail, &line);
                        apply_line(
                            app,
                            &line,
                            &mut current,
                            &mut last_path,
                            &mut last_emit,
                            &mut last_percent,
                            &mut aggregator,
                        );
                    }
                    Ok(None) => stderr_lines = None,
                    Err(error) => {
                        log::warn!("failed to read yt-dlp stderr: {error}");
                        stderr_lines = None;
                    }
                }
            }
            line = next_line_or_pending(&mut stdout_lines) => {
                match line {
                    Ok(Some(line)) => {
                        apply_line(
                            app,
                            &line,
                            &mut current,
                            &mut last_path,
                            &mut last_emit,
                            &mut last_percent,
                            &mut aggregator,
                        );
                        capture_path(&line, &mut last_path);
                    }
                    Ok(None) => stdout_lines = None,
                    Err(error) => {
                        log::warn!("failed to read yt-dlp stdout: {error}");
                        stdout_lines = None;
                    }
                }
            }
        }
    }

    let status = child.wait().await.map_err(|error| {
        log::error!("failed to wait for yt-dlp: {error}");
        AppError::download_failed()
    })?;

    if *cancel.borrow() {
        return Err(AppError::cancelled());
    }

    if !status.success() {
        return Err(AppError::from_download_stderr(&stderr_tail));
    }

    let file_path = last_path
        .as_deref()
        .and_then(|path| resolve_existing_file(&output_dir, path))
        .ok_or_else(AppError::download_failed)?;

    emit_progress(
        app,
        &DownloadProgress {
            percent: 100.0,
            downloaded_bytes: current.downloaded_bytes,
            total_bytes: current.total_bytes,
            speed: None,
            eta: None,
            status: ProgressStatus::Completed,
            message: Some(file_path.clone()),
        },
    );

    Ok(DownloadResult { file_path })
}

fn apply_download_args(
    command: &mut Command,
    mode: &str,
    quality: &str,
    audio_format: &str,
    video_codec: &str,
    output_dir: &Path,
    ffmpeg: Option<&Path>,
) {
    command.args([
        "--no-playlist",
        "--no-warnings",
        "--progress",
        "--newline",
        "--encoding",
        "utf-8",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--print",
        "after_move:filepath",
    ]);

    #[cfg(windows)]
    command.arg("--windows-filenames");

    command.arg("-P");
    command.arg(output_dir);
    command.arg("-o");
    command.arg("%(title)s.%(ext)s");

    if let Some(ffmpeg) = ffmpeg {
        command.arg("--ffmpeg-location");
        command.arg(ffmpeg);
    }

    if mode == "audio" {
        if ffmpeg.is_some() {
            command.args(["-f", "ba/b", "-x", "--audio-format", audio_format, "--audio-quality", "0"]);
        } else {
            command.args(["-f", "ba[ext=m4a]/bestaudio[ext=m4a]/bestaudio"]);
        }
        return;
    }

    let selector = video_format_selector(quality, video_codec, ffmpeg.is_some());
    command.arg("-f");
    command.arg(selector);

    if ffmpeg.is_some() {
        command.args(["--merge-output-format", "mp4"]);
    }
}

fn normalize_video_codec(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "av1" | "av01" => Some("av1"),
        "avc1" | "avc" | "h264" => Some("avc1"),
        _ => None,
    }
}

fn video_format_selector(quality: &str, codec: &str, has_ffmpeg: bool) -> String {
    let codec_filter = if codec == "avc1" {
        "vcodec^=avc1"
    } else {
        "vcodec^=av01"
    };

    if has_ffmpeg {
        if quality == "best" {
            if codec == "avc1" {
                format!(
                    "bv*[{codec_filter}]+ba[ext=m4a]/bv*[{codec_filter}]+ba/b[{codec_filter}]/bv*+ba/b/wv*+ba/w"
                )
            } else {
                format!("bv*[{codec_filter}]+ba/bv*+ba/b/wv*+ba/w")
            }
        } else if codec == "avc1" {
            format!(
                "bv*[{codec_filter}][height<={quality}]+ba[ext=m4a]/bv*[{codec_filter}]+ba[ext=m4a]/b[{codec_filter}][height<={quality}]/b[{codec_filter}]/bv*[height<={quality}]+ba/bv*+ba/b/wv*+ba/w"
            )
        } else {
            format!(
                "bv*[{codec_filter}][height<={quality}]+ba/bv*[{codec_filter}]+ba/bv*[height<={quality}]+ba/bv*+ba/b/wv*+ba/w"
            )
        }
    } else if quality == "best" {
        format!("b[ext=mp4][{codec_filter}]/b[{codec_filter}]/b[ext=mp4]/b/w")
    } else {
        format!(
            "b[ext=mp4][{codec_filter}][height<={quality}]/b[{codec_filter}][height<={quality}]/b[ext=mp4][height<={quality}]/b[height<={quality}]/b[ext=mp4]/b/w"
        )
    }
}

fn apply_line(
    app: &AppHandle,
    line: &str,
    current: &mut DownloadProgress,
    last_path: &mut Option<String>,
    last_emit: &mut Instant,
    last_percent: &mut f64,
    aggregator: &mut ProgressAggregator,
) {
    for event in interpret_line(line) {
        match event {
            LineEvent::Destination { path } => {
                aggregator.begin_file();
                *last_path = Some(path);
            }
            LineEvent::Processing { message } => {
                current.status = ProgressStatus::Processing;
                current.speed = None;
                current.eta = None;
                current.percent = aggregator.mark_processing();
                current.message = Some(message.to_string());
                emit_progress(app, current);
                *last_emit = Instant::now();
                *last_percent = current.percent;
            }
            LineEvent::Progress {
                percent,
                downloaded_bytes,
                total_bytes,
                speed,
                eta,
            } => {
                let overall = aggregator.update(percent, downloaded_bytes, total_bytes);
                current.status = ProgressStatus::Downloading;
                current.percent = overall;
                current.downloaded_bytes = downloaded_bytes;
                current.total_bytes = total_bytes;
                current.speed = speed;
                current.eta = eta;
                current.message = Some("파일을 받는 중입니다.".to_string());

                let now = Instant::now();
                if (overall - *last_percent).abs() >= 0.4
                    || now.duration_since(*last_emit) >= Duration::from_millis(200)
                    || percent >= 100.0
                {
                    emit_progress(app, current);
                    *last_emit = now;
                    *last_percent = overall;
                }
            }
        }
    }
}

fn capture_path(line: &str, last_path: &mut Option<String>) {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('{') || trimmed.starts_with('[') {
        return;
    }

    *last_path = Some(trimmed.to_string());
}

fn resolve_existing_file(output_dir: &Path, path: &str) -> Option<String> {
    let direct = PathBuf::from(path);
    if direct.is_file() {
        return Some(direct.to_string_lossy().into_owned());
    }

    let joined = output_dir.join(path);
    if joined.is_file() {
        return Some(joined.to_string_lossy().into_owned());
    }

    None
}

fn emit_progress(app: &AppHandle, progress: &DownloadProgress) {
    if let Err(error) = app.emit("download-progress", progress) {
        log::warn!("failed to emit download-progress: {error}");
    }
}

fn append_tail(buffer: &mut String, line: &str) {
    buffer.push_str(line);
    buffer.push('\n');
    if buffer.len() > STDERR_TAIL_LIMIT {
        let extra = buffer.len() - STDERR_TAIL_LIMIT;
        buffer.drain(..extra);
    }
}

async fn next_line_or_pending<R: tokio::io::AsyncBufRead + Unpin>(
    lines: &mut Option<tokio::io::Lines<R>>,
) -> std::io::Result<Option<String>> {
    match lines.as_mut() {
        Some(lines) => lines.next_line().await,
        None => std::future::pending().await,
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_video_codec, video_format_selector};

    #[test]
    fn normalizes_codec_aliases() {
        assert_eq!(normalize_video_codec("AV1"), Some("av1"));
        assert_eq!(normalize_video_codec("av01"), Some("av1"));
        assert_eq!(normalize_video_codec("h264"), Some("avc1"));
        assert_eq!(normalize_video_codec("avc"), Some("avc1"));
        assert_eq!(normalize_video_codec("vp9"), None);
    }

    #[test]
    fn prefers_requested_codec_then_falls_back() {
        let av1 = video_format_selector("best", "av1", true);
        assert!(av1.starts_with("bv*[vcodec^=av01]+ba/"));
        assert!(av1.contains("/bv*+ba/b"));

        let avc1 = video_format_selector("best", "avc1", true);
        assert!(avc1.starts_with("bv*[vcodec^=avc1]+ba[ext=m4a]/"));
        assert!(avc1.contains("/b[vcodec^=avc1]/"));
        assert!(avc1.contains("/bv*+ba/b"));

        let limited = video_format_selector("1080", "av1", true);
        assert!(limited.contains("[height<=1080]"));
        assert!(limited.contains("vcodec^=av01"));
    }
}
