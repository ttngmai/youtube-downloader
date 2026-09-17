import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { cancelDownload, downloadVideo, EVENTS, openFile, revealInFolder, toAppError } from "@/lib/tauri";
import {
  type AppError,
  type AppStatus,
  type DownloadOptions,
  type DownloadProgress,
  type DownloadResult,
} from "@/types/download";

type StartResult =
  | { status: "completed"; filePath: string }
  | { status: "cancelled" }
  | { status: "error"; error: AppError };

export function useDownload() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const active = useRef(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void listen<DownloadProgress>(EVENTS.downloadProgress, (event) => {
      if (!active.current) {
        return;
      }

      setProgress(event.payload);
      if (event.payload.status === "processing") {
        setStatus("processing");
      } else if (event.payload.status === "downloading") {
        setStatus("downloading");
      }
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  function reset() {
    active.current = false;
    setCancelling(false);
    setStatus("idle");
    setProgress(null);
    setError(null);
    setFilePath(null);
  }

  async function pickFolder(currentDirectory: string): Promise<string | null> {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: currentDirectory,
        title: "저장 폴더 선택",
      });

      if (typeof selected === "string" && selected) {
        return selected;
      }

      return null;
    } catch (caught) {
      throw toAppError(caught);
    }
  }

  async function start(options: DownloadOptions): Promise<StartResult> {
    active.current = true;
    setCancelling(false);
    setStatus("downloading");
    setError(null);
    setFilePath(null);
    setProgress({
      percent: 0,
      status: "downloading",
      message: "다운로드를 시작합니다.",
    });

    try {
      const result: DownloadResult = await downloadVideo(options);
      if (!active.current) {
        return { status: "cancelled" };
      }

      setFilePath(result.filePath);
      setStatus("completed");
      setProgress({
        percent: 100,
        status: "completed",
        message: result.filePath,
      });
      return { status: "completed", filePath: result.filePath };
    } catch (caught) {
      const appError = toAppError(caught);
      if (!active.current || appError.code === "cancelled") {
        setCancelling(false);
        setStatus("ready");
        setProgress(null);
        setError(null);
        return { status: "cancelled" };
      }

      setStatus("error");
      setError(appError);
      setProgress((previous) => ({
        percent: previous?.percent ?? 0,
        status: "error",
        message: appError.message,
      }));
      return { status: "error", error: appError };
    } finally {
      active.current = false;
      setCancelling(false);
    }
  }

  async function cancel() {
    if (cancelling) {
      return;
    }

    setCancelling(true);
    try {
      await cancelDownload();
    } catch (caught) {
      setCancelling(false);
      throw toAppError(caught);
    }
  }

  async function openFileAt(path: string) {
    try {
      await openFile(path);
    } catch (caught) {
      throw toAppError(caught);
    }
  }

  async function revealFileAt(path: string) {
    try {
      await revealInFolder(path);
    } catch (caught) {
      throw toAppError(caught);
    }
  }

  async function openDownloadedFile() {
    if (!filePath) {
      throw {
        code: "file_missing",
        message: "열 파일을 찾을 수 없습니다.",
      } satisfies AppError;
    }

    await openFileAt(filePath);
  }

  async function revealDownloadedFile() {
    if (!filePath) {
      throw {
        code: "file_missing",
        message: "폴더에서 표시할 파일을 찾을 수 없습니다.",
      } satisfies AppError;
    }

    await revealFileAt(filePath);
  }

  return {
    status,
    progress,
    error,
    filePath,
    cancelling,
    pickFolder,
    start,
    cancel,
    openFileAt,
    revealFileAt,
    openDownloadedFile,
    revealDownloadedFile,
    reset,
  };
}
