use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;
use tauri::AppHandle;
use tokio::process::Command;

use crate::error::AppError;
use crate::models::{VideoFormat, VideoInfo};
use crate::services::bins;

const METADATA_TIMEOUT: Duration = Duration::from_secs(60);

pub fn resolve_binary(app: &AppHandle) -> Result<PathBuf, AppError> {
    bins::resolve_ytdlp(app)
}

pub async fn fetch_metadata(binary: &Path, url: &str) -> Result<VideoInfo, AppError> {
    let url = url.trim();
    if !is_youtube_url(url) {
        return Err(AppError::invalid_url());
    }

    let mut command = Command::new(binary);
    command.args([
        "-J",
        "--no-download",
        "--no-warnings",
        "--no-playlist",
        "--no-progress",
        "--encoding",
        "utf-8",
        "--",
        url,
    ]);
    command.stdin(std::process::Stdio::null());

    #[cfg(windows)]
    command.creation_flags(bins::CREATE_NO_WINDOW);

    let output = tokio::time::timeout(METADATA_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            AppError::new(
                "network",
                "영상 정보 조회가 너무 오래 걸렸습니다. 네트워크 상태를 확인하세요.",
            )
        })?
        .map_err(|error| {
            log::error!("failed to spawn yt-dlp: {error}");
            AppError::new("ytdlp_exec", "yt-dlp를 실행하지 못했습니다.")
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(AppError::from_ytdlp_stderr(&stderr));
    }

    let json = parse_json_payload(&stdout)?;
    video_info_from_json(json)
}

pub fn is_youtube_url(input: &str) -> bool {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return false;
    }

    let lower = trimmed.to_ascii_lowercase();
    let without_scheme = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(lower.as_str());

    let host = without_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .trim_end_matches('.');
    let host = host.strip_prefix("www.").unwrap_or(host);

    matches!(
        host,
        "youtube.com" | "m.youtube.com" | "music.youtube.com" | "youtu.be"
    )
}

fn parse_json_payload(stdout: &str) -> Result<Value, AppError> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err(AppError::metadata_failed());
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }

    let start = trimmed.find('{').ok_or_else(AppError::metadata_failed)?;
    let end = trimmed.rfind('}').ok_or_else(AppError::metadata_failed)?;
    if end <= start {
        return Err(AppError::metadata_failed());
    }

    serde_json::from_str(&trimmed[start..=end]).map_err(|error| {
        log::error!("failed to parse yt-dlp json: {error}");
        AppError::metadata_failed()
    })
}

fn video_info_from_json(value: Value) -> Result<VideoInfo, AppError> {
    if value.get("_type").and_then(Value::as_str) == Some("playlist") {
        return Err(AppError::new(
            "playlist_unsupported",
            "재생목록은 아직 지원하지 않습니다. 영상 URL을 입력하세요.",
        ));
    }

    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .ok_or_else(AppError::metadata_failed)?
        .to_string();

    let channel = first_string(&value, &["channel", "uploader", "uploader_id"]);
    let thumbnail = pick_thumbnail(&value);
    let duration = value
        .get("duration")
        .and_then(Value::as_f64)
        .filter(|seconds| seconds.is_finite() && *seconds >= 0.0)
        .map(|seconds| seconds.round() as u64)
        .unwrap_or(0);

    Ok(VideoInfo {
        title,
        thumbnail,
        channel,
        duration,
        formats: collect_formats(&value),
    })
}

fn pick_thumbnail(value: &Value) -> Option<String> {
    if let Some(thumbnail) = value.get("thumbnail").and_then(Value::as_str) {
        if !thumbnail.is_empty() {
            return Some(thumbnail.to_string());
        }
    }

    value
        .get("thumbnails")
        .and_then(Value::as_array)
        .and_then(|thumbnails| {
            thumbnails.iter().rev().find_map(|item| {
                item.get("url")
                    .and_then(Value::as_str)
                    .filter(|url| !url.is_empty())
                    .map(str::to_string)
            })
        })
}

fn collect_formats(value: &Value) -> Vec<VideoFormat> {
    let Some(items) = value.get("formats").and_then(Value::as_array) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let format_id = item.get("format_id").and_then(Value::as_str)?;
            if format_id.starts_with("sb") {
                return None;
            }

            let ext = item.get("ext").and_then(Value::as_str);
            if matches!(ext, Some("mhtml" | "storyboard")) {
                return None;
            }

            let vcodec = item
                .get("vcodec")
                .and_then(Value::as_str)
                .filter(|codec| *codec != "none")
                .map(str::to_string)?;
            let height = item
                .get("height")
                .and_then(Value::as_u64)
                .filter(|height| *height > 0)
                .map(|height| height as u32)?;

            Some(VideoFormat {
                format_id: format_id.to_string(),
                ext: ext.map(str::to_string),
                height: Some(height),
                vcodec: Some(vcodec),
                acodec: item
                    .get("acodec")
                    .and_then(Value::as_str)
                    .filter(|codec| *codec != "none")
                    .map(str::to_string),
            })
        })
        .collect()
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    })
}

#[cfg(test)]
mod tests {
    use super::collect_formats;
    use serde_json::json;

    #[test]
    fn collect_formats_keeps_video_streams_and_skips_audio_and_storyboards() {
        let value = json!({
            "formats": [
                { "format_id": "sb0", "ext": "mhtml", "height": 90, "vcodec": "none" },
                { "format_id": "251", "ext": "webm", "vcodec": "none", "acodec": "opus" },
                { "format_id": "399", "ext": "mp4", "height": 1080, "vcodec": "av01.0.08M.08", "acodec": "none" },
                { "format_id": "137", "ext": "mp4", "height": 1080, "vcodec": "avc1.640028", "acodec": "none" },
                { "format_id": "401", "ext": "mp4", "height": 2160, "vcodec": "av01.0.12M.08", "acodec": "none" }
            ]
        });

        let formats = collect_formats(&value);
        assert_eq!(formats.len(), 3);
        assert!(formats.iter().any(|format| format.height == Some(2160)));
        assert!(formats.iter().any(|format| {
            format
                .vcodec
                .as_deref()
                .is_some_and(|codec| codec.starts_with("avc1"))
        }));
    }
}

