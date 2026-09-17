use std::path::Path;
use std::time::Duration;

use serde_json::Value;
use tauri::AppHandle;
use tokio::process::Command;

use crate::error::AppError;
use crate::models::{YtdlpStatus, YtdlpUpdateResult};
use crate::services::bins;

const VERSION_TIMEOUT: Duration = Duration::from_secs(20);
const UPDATE_TIMEOUT: Duration = Duration::from_secs(180);
const GITHUB_RELEASES: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
const USER_AGENT: &str = "youtube-downloader/0.1.0";
const MIN_BINARY_SIZE: usize = 1_000_000;

pub async fn status(app: &AppHandle) -> Result<YtdlpStatus, AppError> {
    let binary = bins::resolve_ytdlp(app)?;
    let current_version = read_version(&binary).await?;
    let latest_version = fetch_latest_version().await.ok();
    let update_available = latest_version
        .as_deref()
        .is_some_and(|latest| versions_differ(&current_version, latest));

    Ok(YtdlpStatus {
        current_version,
        latest_version,
        update_available,
    })
}

pub async fn update(app: &AppHandle) -> Result<YtdlpUpdateResult, AppError> {
    let binary = bins::resolve_ytdlp(app)?;
    let previous_version = read_version(&binary).await?;
    let latest_version = fetch_latest_version().await.ok();

    if latest_version
        .as_deref()
        .is_some_and(|latest| !versions_differ(&previous_version, latest))
    {
        return Ok(YtdlpUpdateResult {
            previous_version: previous_version.clone(),
            current_version: previous_version,
            updated: false,
        });
    }

    let bytes = download_latest_binary().await?;
    replace_binary(&binary, &bytes).await?;

    let current_version = read_version(&binary).await.unwrap_or_else(|_| {
        latest_version
            .clone()
            .unwrap_or_else(|| previous_version.clone())
    });

    Ok(YtdlpUpdateResult {
        previous_version,
        current_version,
        updated: true,
    })
}

async fn read_version(binary: &Path) -> Result<String, AppError> {
    let mut command = Command::new(binary);
    command.args(["--version"]);
    command.stdin(std::process::Stdio::null());

    #[cfg(windows)]
    command.creation_flags(bins::CREATE_NO_WINDOW);

    let output = tokio::time::timeout(VERSION_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::update_failed())?
        .map_err(|error| {
            log::error!("failed to read yt-dlp version: {error}");
            AppError::update_failed()
        })?;

    if !output.status.success() {
        return Err(AppError::update_failed());
    }

    parse_version(&String::from_utf8_lossy(&output.stdout)).ok_or_else(AppError::update_failed)
}

async fn fetch_latest_version() -> Result<String, AppError> {
    let client = http_client()?;
    let response = client
        .get(GITHUB_RELEASES)
        .send()
        .await
        .map_err(|error| {
            log::error!("failed to query yt-dlp releases: {error}");
            AppError::update_failed()
        })?;

    if !response.status().is_success() {
        log::error!("yt-dlp releases returned {}", response.status());
        return Err(AppError::update_failed());
    }

    let payload: Value = response.json().await.map_err(|error| {
        log::error!("failed to parse yt-dlp releases json: {error}");
        AppError::update_failed()
    })?;

    payload
        .get("tag_name")
        .and_then(Value::as_str)
        .map(normalize_version)
        .filter(|version| !version.is_empty())
        .ok_or_else(AppError::update_failed)
}

async fn download_latest_binary() -> Result<Vec<u8>, AppError> {
    let client = http_client()?;
    let response = client
        .get(latest_binary_url())
        .send()
        .await
        .map_err(|error| {
            log::error!("failed to download yt-dlp: {error}");
            AppError::update_failed()
        })?;

    if !response.status().is_success() {
        log::error!("yt-dlp download returned {}", response.status());
        return Err(AppError::update_failed());
    }

    let bytes = response.bytes().await.map_err(|error| {
        log::error!("failed to read yt-dlp bytes: {error}");
        AppError::update_failed()
    })?;

    if !looks_like_binary(&bytes) {
        return Err(AppError::update_failed());
    }

    Ok(bytes.to_vec())
}

async fn replace_binary(target: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let target = target.to_path_buf();
    let payload = bytes.to_vec();
    tokio::task::spawn_blocking(move || write_binary_atomic(&target, &payload))
        .await
        .map_err(|error| {
            log::error!("yt-dlp replace task failed: {error}");
            AppError::update_failed()
        })?
}

fn write_binary_atomic(target: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(AppError::update_failed)?;
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let temp = parent.join(format!("{file_name}.new"));
    let backup = parent.join(format!("{file_name}.bak"));

    std::fs::write(&temp, bytes).map_err(|error| permission_or_failed(error))?;

    if backup.exists() {
        let _ = std::fs::remove_file(&backup);
    }

    if target.exists() {
        std::fs::rename(target, &backup).map_err(|error| {
            let _ = std::fs::remove_file(&temp);
            permission_or_failed(error)
        })?;
    }

    if let Err(error) = std::fs::rename(&temp, target) {
        if backup.exists() {
            let _ = std::fs::rename(&backup, target);
        }
        let _ = std::fs::remove_file(&temp);
        return Err(permission_or_failed(error));
    }

    let _ = std::fs::remove_file(&backup);
    Ok(())
}

fn permission_or_failed(error: std::io::Error) -> AppError {
    log::error!("failed to replace yt-dlp: {error}");
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        AppError::new(
            "update_permission",
            "yt-dlp 파일을 바꿀 권한이 없습니다. 다운로드가 끝난 뒤 다시 시도하세요.",
        )
    } else {
        AppError::update_failed()
    }
}

fn http_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(UPDATE_TIMEOUT)
        .build()
        .map_err(|error| {
            log::error!("failed to build http client: {error}");
            AppError::update_failed()
        })
}

fn latest_binary_url() -> &'static str {
    if cfg!(windows) {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    }
}

fn parse_version(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(normalize_version)
        .filter(|version| !version.is_empty())
}

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches('v').trim().to_string()
}

fn versions_differ(current: &str, latest: &str) -> bool {
    normalize_version(current) != normalize_version(latest)
}

fn looks_like_binary(bytes: &[u8]) -> bool {
    if bytes.len() < MIN_BINARY_SIZE {
        return false;
    }

    if cfg!(windows) {
        bytes.starts_with(b"MZ")
    } else {
        bytes[0] == 0x7F || bytes.starts_with(b"#!")
    }
}

#[cfg(test)]
mod tests {
    use super::{looks_like_binary, normalize_version, parse_version, versions_differ};

    #[test]
    fn parses_version_output() {
        assert_eq!(parse_version("2026.08.19\n"), Some("2026.08.19".into()));
        assert_eq!(parse_version("v2026.08.19"), Some("2026.08.19".into()));
        assert_eq!(normalize_version(" v2026.08.19 "), "2026.08.19");
    }

    #[test]
    fn detects_update_when_versions_differ() {
        assert!(versions_differ("2026.07.01", "2026.08.19"));
        assert!(!versions_differ("v2026.08.19", "2026.08.19"));
    }

    #[test]
    fn rejects_tiny_or_html_payloads() {
        assert!(!looks_like_binary(b"<html>not a binary</html>"));
        let mut exe = vec![0u8; 1_000_001];
        exe[0] = b'M';
        exe[1] = b'Z';
        assert!(looks_like_binary(&exe) || !cfg!(windows));
    }
}
