use tauri::AppHandle;

use crate::error::AppError;
use crate::models::VideoInfo;
use crate::services::ytdlp;

#[tauri::command]
pub async fn fetch_video_info(app: AppHandle, url: String) -> Result<VideoInfo, AppError> {
    let binary = ytdlp::resolve_binary(&app)?;
    ytdlp::fetch_metadata(&binary, &url).await
}
