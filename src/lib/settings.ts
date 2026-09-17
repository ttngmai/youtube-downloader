import {
  DEFAULT_OUTPUT_DIRECTORY,
  isAudioFormat,
  isDownloadMode,
  isVideoCodec,
  isVideoQuality,
  type AudioFormat,
  type DownloadMode,
  type VideoCodec,
  type VideoQuality,
} from "@/types/download";

export const SETTINGS_STORAGE_KEY = "youtube-downloader.settings";

export interface AppSettings {
  mode: DownloadMode;
  quality: VideoQuality;
  audioFormat: AudioFormat;
  videoCodec: VideoCodec;
  outputDirectory: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "video",
  quality: "best",
  audioFormat: "mp3",
  videoCodec: "av1",
  outputDirectory: null,
};

export function loadSettings(): AppSettings {
  const raw = readStorage();
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    ...current,
    ...partial,
  };

  if ("outputDirectory" in partial) {
    next.outputDirectory = isPersistedDirectory(partial.outputDirectory)
      ? partial.outputDirectory.trim()
      : null;
  } else {
    next.outputDirectory = current.outputDirectory;
  }

  writeStorage(JSON.stringify({
    mode: next.mode,
    quality: next.quality,
    audioFormat: next.audioFormat,
    videoCodec: next.videoCodec,
    outputDirectory: next.outputDirectory,
  }));

  return next;
}

export function parseSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const record = value as Record<string, unknown>;

  return {
    mode: typeof record.mode === "string" && isDownloadMode(record.mode)
      ? record.mode
      : DEFAULT_SETTINGS.mode,
    quality:
      typeof record.quality === "string" && isVideoQuality(record.quality)
        ? record.quality
        : DEFAULT_SETTINGS.quality,
    audioFormat:
      typeof record.audioFormat === "string" && isAudioFormat(record.audioFormat)
        ? record.audioFormat
        : DEFAULT_SETTINGS.audioFormat,
    videoCodec:
      typeof record.videoCodec === "string" && isVideoCodec(record.videoCodec)
        ? record.videoCodec
        : DEFAULT_SETTINGS.videoCodec,
    outputDirectory: parseOutputDirectory(record.outputDirectory),
  };
}

function parseOutputDirectory(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return isPersistedDirectory(trimmed) ? trimmed : null;
}

function isPersistedDirectory(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== DEFAULT_OUTPUT_DIRECTORY;
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, value);
  } catch {
    // Private mode or a disabled store should not break the UI.
  }
}
