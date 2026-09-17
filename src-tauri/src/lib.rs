mod commands;
mod error;
mod models;
mod services;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::DownloadController::new())
        .invoke_handler(tauri::generate_handler![
            commands::metadata::fetch_video_info,
            commands::download::download_video,
            commands::download::cancel_download,
            commands::update::get_ytdlp_status,
            commands::update::update_ytdlp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
