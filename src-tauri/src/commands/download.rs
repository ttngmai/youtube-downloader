use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::models::{DownloadOptions, DownloadResult};
use crate::services::download;
use crate::state::DownloadController;

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    state: State<'_, DownloadController>,
    options: DownloadOptions,
) -> Result<DownloadResult, AppError> {
    let mut session = state.start_session()?;
    download::run_download(&app, &options, &mut session.cancel_rx).await
}

#[tauri::command]
pub fn cancel_download(state: State<'_, DownloadController>) -> Result<(), AppError> {
    state.request_cancel();
    Ok(())
}
