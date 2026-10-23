use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn resolve_ytdlp(app: &AppHandle) -> Result<PathBuf, AppError> {
    ensure_managed_from_sidecar(app, "yt-dlp");
    managed_if_exists(app, "yt-dlp")
        .or_else(|| find_bundled_sidecar(app, "yt-dlp"))
        .or_else(|| find_on_path("yt-dlp"))
        .ok_or_else(AppError::ytdlp_missing)
}

pub fn resolve_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    ensure_managed_from_sidecar(app, "ffmpeg");
    ensure_managed_from_sidecar(app, "ffprobe");
    managed_if_exists(app, "ffmpeg")
        .or_else(|| find_bundled_sidecar(app, "ffmpeg"))
        .or_else(|| find_on_path("ffmpeg"))
}

pub fn managed_ytdlp_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    managed_binary_path(app, "yt-dlp").ok_or_else(|| {
        AppError::new(
            "update_permission",
            "yt-dlp를 저장할 폴더를 준비하지 못했습니다.",
        )
    })
}

fn ensure_managed_from_sidecar(app: &AppHandle, name: &str) {
    let Some(dest) = managed_binary_path(app, name) else {
        return;
    };
    if dest.is_file() {
        return;
    }
    let Some(src) = find_bundled_sidecar(app, name) else {
        return;
    };
    if src == dest {
        return;
    }
    if let Some(parent) = dest.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if std::fs::copy(&src, &dest).is_ok() {
        set_executable(&dest);
    }
}

fn managed_if_exists(app: &AppHandle, name: &str) -> Option<PathBuf> {
    managed_binary_path(app, name).filter(|path| path.is_file())
}

fn managed_binary_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("binaries").join(plain_binary_name(name)))
}

fn find_bundled_sidecar(app: &AppHandle, name: &str) -> Option<PathBuf> {
    sidecar_candidates(app, name)
        .into_iter()
        .find(|path| path.is_file())
}

fn sidecar_candidates(app: &AppHandle, name: &str) -> Vec<PathBuf> {
    let triple = current_target_triple();
    let sidecar_name = sidecar_file_name(name, triple);
    let plain_name = plain_binary_name(name);
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
    candidates
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let plain_name = plain_binary_name(name);
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

fn plain_binary_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn set_executable(path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o755);
            let _ = std::fs::set_permissions(path, permissions);
        }
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

#[cfg(test)]
mod tests {
    use super::{plain_binary_name, sidecar_file_name};

    #[test]
    fn sidecar_names_include_host_triple() {
        let name = sidecar_file_name("yt-dlp", "aarch64-apple-darwin");
        if cfg!(windows) {
            assert_eq!(name, "yt-dlp-aarch64-apple-darwin.exe");
        } else {
            assert_eq!(name, "yt-dlp-aarch64-apple-darwin");
        }
    }

    #[test]
    fn plain_names_use_windows_extension() {
        if cfg!(windows) {
            assert_eq!(plain_binary_name("ffmpeg"), "ffmpeg.exe");
        } else {
            assert_eq!(plain_binary_name("ffmpeg"), "ffmpeg");
        }
    }
}
