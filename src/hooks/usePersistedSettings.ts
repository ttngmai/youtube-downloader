import { downloadDir } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings";
import { DEFAULT_OUTPUT_DIRECTORY } from "@/types/download";
import type {
  AudioFormat,
  DownloadMode,
  VideoCodec,
  VideoQuality,
} from "@/types/download";

export function usePersistedSettings() {
  const [initial] = useState(loadSettings);
  const [mode, setMode] = useState<DownloadMode>(initial.mode);
  const [quality, setQuality] = useState<VideoQuality>(initial.quality);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(initial.audioFormat);
  const [videoCodec, setVideoCodec] = useState<VideoCodec>(initial.videoCodec);
  const [outputDirectory, setOutputDirectory] = useState(
    initial.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY,
  );

  useEffect(() => {
    if (initial.outputDirectory) {
      return;
    }

    let cancelled = false;
    void downloadDir()
      .then((directory) => {
        if (!cancelled && directory) {
          setOutputDirectory(directory);
        }
      })
      .catch(() => {
        // Keep the placeholder path when the Tauri path API is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [initial.outputDirectory]);

  useEffect(() => {
    const next: Partial<AppSettings> = {
      mode,
      quality,
      audioFormat,
      videoCodec,
    };

    if (outputDirectory !== DEFAULT_OUTPUT_DIRECTORY) {
      next.outputDirectory = outputDirectory;
    }

    saveSettings(next);
  }, [mode, quality, audioFormat, videoCodec, outputDirectory]);

  return {
    mode,
    quality,
    audioFormat,
    videoCodec,
    outputDirectory,
    setMode,
    setQuality,
    setAudioFormat,
    setVideoCodec,
    setOutputDirectory,
  };
}
