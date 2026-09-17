use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn resolve_ytdlp(app: &AppHandle) -> Result<PathBuf, AppError> {
    resolve_sidecar(app, "yt-dlp").ok_or_else(AppError::ytdlp_missing)
}

pub fn resolve_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    resolve_sidecar(app, "ffmpeg")
}

fn resolve_sidecar(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let triple = current_target_triple();
    let sidecar_name = sidecar_file_name(name, triple);
    let plain_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };

    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(&sidecar_name));
        candidates.push(resource_dir.join("binaries").join(&plain_name));
        candidates.push(resource_dir.join(&sidecar_name));
        candidates.push(resource_dir.join(&plain_name));
        if let Some(parent) = resource_dir.parent() {
            candidates.push(parent.join(&sidecar_name));
            candidates.push(parent.join(&plain_name));
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            candidates.push(dir.join("binaries").join(&sidecar_name));
            candidates.push(dir.join(&sidecar_name));
            candidates.push(dir.join(&plain_name));
        }
    }

    let crate_binaries = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    candidates.push(crate_binaries.join(&sidecar_name));
    candidates.push(crate_binaries.join(&plain_name));

    if let Some(found) = candidates.into_iter().find(|path| path.is_file()) {
        return Some(found);
    }

    which::which(&plain_name)
        .or_else(|_| which::which(name))
        .ok()
}

fn sidecar_file_name(name: &str, triple: &str) -> String {
    if cfg!(windows) {
        format!("{name}-{triple}.exe")
    } else {
        format!("{name}-{triple}")
    }
}

fn current_target_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
    )))]
    {
        "unknown"
    }
}
