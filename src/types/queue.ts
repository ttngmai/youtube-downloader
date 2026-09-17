import type {
  AppError,
  DownloadOptions,
  DownloadMode,
  VideoCodec,
  VideoQuality,
  AudioFormat,
} from "@/types/download";

export const QUEUE_ITEM_STATUSES = [
  "queued",
  "downloading",
  "completed",
  "error",
  "cancelled",
] as const;

export type QueueItemStatus = (typeof QUEUE_ITEM_STATUSES)[number];

export interface QueueItem {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  mode: DownloadMode;
  quality?: VideoQuality;
  audioFormat?: AudioFormat;
  videoCodec?: VideoCodec;
  options: DownloadOptions;
  status: QueueItemStatus;
  filePath?: string;
  error?: AppError;
}

export const QUEUE_STATUS_LABELS: Record<QueueItemStatus, string> = {
  queued: "대기 중",
  downloading: "받는 중",
  completed: "완료",
  error: "실패",
  cancelled: "취소됨",
};
