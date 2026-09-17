import { Download, ListPlus, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { DownloadOptions } from "@/components/DownloadOptions";
import { DownloadProgressCard } from "@/components/DownloadProgress";
import { DownloadQueue } from "@/components/DownloadQueue";
import { UrlInput } from "@/components/UrlInput";
import { VideoInfoCard } from "@/components/VideoInfoCard";
import { YtdlpUpdateBar } from "@/components/YtdlpUpdateBar";
import { Button } from "@/components/ui/button";
import { useDownload } from "@/hooks/useDownload";
import { useDownloadQueue } from "@/hooks/useDownloadQueue";
import { usePersistedSettings } from "@/hooks/usePersistedSettings";
import { useVideoInfo } from "@/hooks/useVideoInfo";
import { useYtdlpUpdate } from "@/hooks/useYtdlpUpdate";

function App() {
  const {
    url,
    status: infoStatus,
    video,
    error: infoError,
    updateUrl,
    loadMetadata,
  } = useVideoInfo();
  const download = useDownload();
  const queue = useDownloadQueue(download, {
    onCompleted: (item) => {
      toast.success(`${item.title} 다운로드가 완료되었습니다.`);
    },
    onError: (item) => {
      toast.error(item.error?.message ?? "다운로드에 실패했습니다.");
    },
    onCancelled: () => {
      toast.message("현재 항목을 취소했습니다.");
    },
  });
  const ytdlp = useYtdlpUpdate();
  const {
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
  } = usePersistedSettings();

  const fetching = infoStatus === "fetchingMetadata";
  const queueBusy = queue.busy;
  const alreadyQueued = Boolean(video && queue.isActiveUrl(url));
  const canEnqueue = Boolean(video) && !alreadyQueued && !fetching;

  function handleUrlChange(nextUrl: string) {
    updateUrl(nextUrl);
  }

  async function handlePaste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.error("클립보드가 비어 있습니다.");
        return;
      }

      updateUrl(text);
      const ok = await loadMetadata(text);
      if (ok) {
        toast.success("영상 정보를 불러왔습니다.");
      }
    } catch {
      toast.error("클립보드를 읽을 수 없습니다.");
    }
  }

  async function handleSubmitUrl() {
    const ok = await loadMetadata();
    if (ok) {
      toast.success("영상 정보를 불러왔습니다.");
    }
  }

  async function handlePickFolder() {
    try {
      const selected = await download.pickFolder(outputDirectory);
      if (selected) {
        setOutputDirectory(selected);
      }
    } catch (error) {
      toast.error(errorMessage(error, "폴더를 선택하지 못했습니다."));
    }
  }

  function handleEnqueue() {
    if (!canEnqueue || !video) {
      return;
    }

    const result = queue.enqueue({
      url,
      video,
      options: {
        url,
        mode,
        quality,
        audioFormat,
        videoCodec,
        outputDirectory,
      },
    });

    if (!result.ok) {
      toast.message("이미 대기열에 있는 영상입니다.");
      return;
    }

    toast.success(
      queueBusy ? "대기열에 추가했습니다." : "다운로드를 시작합니다.",
    );
  }

  async function handleCancelCurrent() {
    try {
      await queue.cancelCurrent();
    } catch (error) {
      toast.error(errorMessage(error, "다운로드를 취소하지 못했습니다."));
    }
  }

  async function handleOpenFile(path?: string) {
    try {
      if (path) {
        await download.openFileAt(path);
        return;
      }
      await download.openDownloadedFile();
    } catch (error) {
      toast.error(errorMessage(error, "파일을 열 수 없습니다."));
    }
  }

  async function handleRevealInFolder(path?: string) {
    try {
      if (path) {
        await download.revealFileAt(path);
        return;
      }
      await download.revealDownloadedFile();
    } catch (error) {
      toast.error(errorMessage(error, "폴더를 열 수 없습니다."));
    }
  }

  async function handleYtdlpRefresh() {
    try {
      const next = await ytdlp.refresh();
      if (next.updateAvailable) {
        toast.message(`yt-dlp ${next.latestVersion}을 받을 수 있습니다.`);
        return;
      }
      toast.success("이미 최신 yt-dlp를 사용 중입니다.");
    } catch (error) {
      toast.error(errorMessage(error, "yt-dlp 버전을 확인하지 못했습니다."));
    }
  }

  async function handleYtdlpUpdate() {
    try {
      const result = await ytdlp.update();
      if (!result) {
        return;
      }
      if (result.updated) {
        toast.success(`yt-dlp를 ${result.currentVersion}으로 업데이트했습니다.`);
        return;
      }
      toast.success("이미 최신 yt-dlp를 사용 중입니다.");
    } catch (error) {
      toast.error(errorMessage(error, "yt-dlp를 업데이트하지 못했습니다."));
    }
  }

  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-5">
        <AppHeader />
        <YtdlpUpdateBar
          status={ytdlp.status}
          loading={ytdlp.loading}
          updating={ytdlp.updating}
          disabled={queueBusy || fetching}
          onRefresh={() => {
            void handleYtdlpRefresh();
          }}
          onUpdate={() => {
            void handleYtdlpUpdate();
          }}
        />
        <UrlInput
          url={url}
          isLoading={fetching}
          onUrlChange={handleUrlChange}
          onPaste={() => {
            void handlePaste();
          }}
          onSubmit={() => {
            void handleSubmitUrl();
          }}
        />
        <VideoInfoCard
          status={infoStatus}
          video={video}
          errorMessage={infoError?.message}
        />
        <DownloadOptions
          mode={mode}
          quality={quality}
          audioFormat={audioFormat}
          videoCodec={videoCodec}
          formats={video?.formats}
          outputDirectory={outputDirectory}
          onModeChange={setMode}
          onQualityChange={setQuality}
          onAudioFormatChange={setAudioFormat}
          onVideoCodecChange={setVideoCodec}
          onPickFolder={() => {
            void handlePickFolder();
          }}
        />
        <div className="flex w-full min-w-0 flex-col gap-2">
          {canEnqueue ? (
            <Button
              type="button"
              size="lg"
              className="h-10 w-full"
              onClick={handleEnqueue}
            >
              {queueBusy ? <ListPlus /> : <Download />}
              {queueBusy ? "대기열에 추가" : "Download"}
            </Button>
          ) : null}
          {queueBusy ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-10 w-full"
              disabled={download.cancelling}
              onClick={() => {
                void handleCancelCurrent();
              }}
            >
              {download.cancelling ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <X />
              )}
              {download.cancelling ? "취소 중..." : "현재 항목 취소"}
            </Button>
          ) : null}
          {!canEnqueue && !queueBusy ? (
            <Button type="button" size="lg" className="h-10 w-full" disabled>
              <Download />
              Download
            </Button>
          ) : null}
        </div>
        <DownloadProgressCard
          status={progressStatus(infoStatus, download.status)}
          progress={download.progress}
          filePath={download.filePath}
          jobTitle={queue.current?.title}
          onOpenFile={() => {
            void handleOpenFile();
          }}
          onRevealInFolder={() => {
            void handleRevealInFolder();
          }}
        />
        <DownloadQueue
          items={queue.items}
          onRemove={queue.remove}
          onRetry={queue.retry}
          onCancelCurrent={() => {
            void handleCancelCurrent();
          }}
          onClearQueued={queue.clearQueued}
          onClearFinished={queue.clearFinished}
          onOpenFile={(path) => {
            void handleOpenFile(path);
          }}
          onRevealInFolder={(path) => {
            void handleRevealInFolder(path);
          }}
        />
      </main>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message).trim();
    if (message) {
      return message;
    }
  }

  return fallback;
}

function progressStatus(
  infoStatus: ReturnType<typeof useVideoInfo>["status"],
  downloadStatus: ReturnType<typeof useDownload>["status"],
) {
  if (downloadStatus === "downloading" || downloadStatus === "processing") {
    return downloadStatus;
  }

  if (infoStatus === "fetchingMetadata") {
    return "fetchingMetadata";
  }

  if (infoStatus === "ready") {
    return "ready";
  }

  if (downloadStatus === "completed" || downloadStatus === "error") {
    return downloadStatus;
  }

  if (downloadStatus === "ready") {
    return infoStatus === "idle" ? "idle" : "ready";
  }

  return infoStatus;
}

export default App;
