export const APP_STATUSES = [
  "idle",
  "fetchingMetadata",
  "ready",
  "downloading",
  "processing",
  "completed",
  "error",
] as const;

export type AppStatus = (typeof APP_STATUSES)[number];

export const VIDEO_QUALITIES = [
  "best",
  "2160",
  "1440",
  "1080",
  "720",
  "480",
  "360",
] as const;

export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

export const AUDIO_FORMATS = ["mp3", "m4a"] as const;

export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export const VIDEO_CODECS = ["av1", "avc1"] as const;

export type VideoCodec = (typeof VIDEO_CODECS)[number];

export const DOWNLOAD_MODES = ["video", "audio"] as const;

export type DownloadMode = (typeof DOWNLOAD_MODES)[number];

export interface DownloadOptions {
  url: string;
  mode: DownloadMode;
  quality?: VideoQuality;
  audioFormat?: AudioFormat;
  videoCodec?: VideoCodec;
  outputDirectory: string;
}

export interface DownloadResult {
  filePath: string;
}

export interface DownloadProgress {
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
  status: "downloading" | "processing" | "completed" | "error";
  message?: string;
}

export interface AppError {
  code: string;
  message: string;
}

export const DEFAULT_OUTPUT_DIRECTORY = "~/Downloads";

export const VIDEO_QUALITY_LABELS: Record<VideoQuality, string> = {
  best: "Best",
  "2160": "2160p",
  "1440": "1440p",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
};

export const AUDIO_FORMAT_LABELS: Record<AudioFormat, string> = {
  mp3: "MP3",
  m4a: "M4A",
};

export const VIDEO_CODEC_LABELS: Record<VideoCodec, string> = {
  av1: "AV1 (권장)",
  avc1: "H.264",
};

export const VIDEO_CODEC_NOTES: Record<VideoCodec, string> = {
  av1: "용량이 작고 고화질입니다. 팟플레이어/VLC에서는 잘 재생되지만, Windows 미디어 플레이어는 영상을 못 열 수 있습니다.",
  avc1: "Windows 기본 플레이어와 호환이 좋습니다. 같은 화질이면 파일이 더 크고, 4K는 없을 수 있습니다.",
};

export function isBusyStatus(status: AppStatus): boolean {
  return (
    status === "fetchingMetadata" ||
    status === "downloading" ||
    status === "processing"
  );
}

export function isVideoQuality(value: string): value is VideoQuality {
  return VIDEO_QUALITIES.includes(value as VideoQuality);
}

export function isAudioFormat(value: string): value is AudioFormat {
  return AUDIO_FORMATS.includes(value as AudioFormat);
}

export function isVideoCodec(value: string): value is VideoCodec {
  return VIDEO_CODECS.includes(value as VideoCodec);
}

export function isDownloadMode(value: string): value is DownloadMode {
  return DOWNLOAD_MODES.includes(value as DownloadMode);
}
