import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AppError,
  DownloadOptions,
  DownloadResult,
} from "@/types/download";
import type { VideoInfo } from "@/types/video";
import type { YtdlpStatus, YtdlpUpdateResult } from "@/types/ytdlp";

export const COMMANDS = {
  fetchVideoInfo: "fetch_video_info",
  downloadVideo: "download_video",
  cancelDownload: "cancel_download",
  getYtdlpStatus: "get_ytdlp_status",
  updateYtdlp: "update_ytdlp",
  getAppPreferences: "get_app_preferences",
  setOutputDirectory: "set_output_directory",
  pickOutputDirectory: "pick_output_directory",
  revealInFolder: "reveal_in_folder",
  openFile: "open_file",
} as const;

export const EVENTS = {
  downloadProgress: "download-progress",
} as const;

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return invoke<VideoInfo>(COMMANDS.fetchVideoInfo, { url });
}

export async function downloadVideo(
  options: DownloadOptions,
): Promise<DownloadResult> {
  return invoke<DownloadResult>(COMMANDS.downloadVideo, { options });
}

export async function cancelDownload(): Promise<void> {
  return invoke(COMMANDS.cancelDownload);
}

export async function getYtdlpStatus(): Promise<YtdlpStatus> {
  return invoke<YtdlpStatus>(COMMANDS.getYtdlpStatus);
}

export async function updateYtdlp(): Promise<YtdlpUpdateResult> {
  return invoke<YtdlpUpdateResult>(COMMANDS.updateYtdlp);
}

export async function revealInFolder(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function openFile(path: string): Promise<void> {
  await openPath(path);
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (typeof error === "string") {
    const parsed = tryParseJson(error);
    if (parsed) {
      return toAppError(parsed);
    }

    return { code: "unknown", message: error };
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String((error as { message: unknown }).message);
    const parsed = tryParseJson(message);
    if (parsed) {
      return toAppError(parsed);
    }

    return { code: "unknown", message };
  }

  return {
    code: "unknown",
    message: "알 수 없는 오류가 발생했습니다.",
  };
}

function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    typeof (value as { message: unknown }).message === "string"
  );
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
