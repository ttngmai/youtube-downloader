use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::models::{YtdlpStatus, YtdlpUpdateResult};
use crate::services::update;
use crate::state::DownloadController;

#[tauri::command]
pub async fn get_ytdlp_status(app: AppHandle) -> Result<YtdlpStatus, AppError> {
    update::status(&app).await
}

#[tauri::command]
pub async fn update_ytdlp(
    app: AppHandle,
    state: State<'_, DownloadController>,
) -> Result<YtdlpUpdateResult, AppError> {
    if state.is_busy() {
        return Err(AppError::update_busy());
    }

    update::update(&app).await
}
