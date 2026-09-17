use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::AppError;

pub fn resolve_output_directory(app: &AppHandle, input: &str) -> Result<PathBuf, AppError> {
    let trimmed = input.trim();
    let download_dir = || {
        app.path()
            .download_dir()
            .map_err(|_| AppError::invalid_output_dir())
    };

    let path = if trimmed.is_empty()
        || trimmed == "~/Downloads"
        || trimmed == "~\\Downloads"
        || trimmed.eq_ignore_ascii_case("downloads")
    {
        download_dir()?
    } else if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        app.path()
            .home_dir()
            .map_err(|_| AppError::invalid_output_dir())?
            .join(rest)
    } else {
        PathBuf::from(trimmed)
    };

    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|error| {
            log::error!("failed to create output directory {}: {error}", path.display());
            AppError::invalid_output_dir()
        })?;
    }

    if !path.is_dir() {
        return Err(AppError::invalid_output_dir());
    }

    Ok(path)
}
