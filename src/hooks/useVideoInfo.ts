import { useRef, useState } from "react";
import { fetchVideoInfo, toAppError } from "@/lib/tauri";
import { isYouTubeUrl } from "@/lib/youtube";
import type { AppError, AppStatus } from "@/types/download";
import type { VideoInfo } from "@/types/video";

export function useVideoInfo() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const requestId = useRef(0);

  function resetMetadata() {
    requestId.current += 1;
    setVideo(null);
    setError(null);
    setStatus("idle");
  }

  function updateUrl(nextUrl: string) {
    setUrl(nextUrl);
    if (video || error || status !== "idle") {
      resetMetadata();
    }
  }

  async function loadMetadata(targetUrl = url): Promise<boolean> {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setError({
        code: "invalid_url",
        message: "YouTube URL을 입력하세요.",
      });
      setStatus("error");
      return false;
    }

    if (!isYouTubeUrl(trimmed)) {
      setVideo(null);
      setError({
        code: "invalid_url",
        message:
          "올바른 YouTube URL이 아닙니다. youtube.com 또는 youtu.be 주소를 입력하세요.",
      });
      setStatus("error");
      return false;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setStatus("fetchingMetadata");
    setError(null);
    setVideo(null);

    try {
      const info = await fetchVideoInfo(trimmed);
      if (requestId.current !== currentRequest) {
        return false;
      }

      setVideo(info);
      setStatus("ready");
      return true;
    } catch (caught) {
      if (requestId.current !== currentRequest) {
        return false;
      }

      const appError = toAppError(caught);
      setVideo(null);
      setError(appError);
      setStatus("error");
      return false;
    }
  }

  return {
    url,
    status,
    video,
    error,
    updateUrl,
    loadMetadata,
    resetMetadata,
  };
}
