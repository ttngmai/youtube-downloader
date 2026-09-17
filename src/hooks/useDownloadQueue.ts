import { useCallback, useRef, useState } from "react";
import type { DownloadOptions } from "@/types/download";
import type { QueueItem } from "@/types/queue";
import type { VideoInfo } from "@/types/video";
import type { useDownload } from "@/hooks/useDownload";

type DownloadApi = Pick<ReturnType<typeof useDownload>, "start" | "cancel">;

interface QueueListeners {
  onCompleted?: (item: QueueItem) => void;
  onError?: (item: QueueItem) => void;
  onCancelled?: (item: QueueItem) => void;
}

interface EnqueueInput {
  url: string;
  video: VideoInfo;
  options: DownloadOptions;
}

function createQueueId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useDownloadQueue(download: DownloadApi, listeners: QueueListeners = {}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const pumpingRef = useRef(false);
  const downloadRef = useRef(download);
  const listenersRef = useRef(listeners);
  downloadRef.current = download;
  listenersRef.current = listeners;

  const updateItems = useCallback((updater: (previous: QueueItem[]) => QueueItem[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const pump = useCallback(async () => {
    if (pumpingRef.current) {
      return;
    }

    pumpingRef.current = true;

    try {
      while (true) {
        const next = itemsRef.current.find((item) => item.status === "queued");
        if (!next) {
          break;
        }

        updateItems((previous) =>
          previous.map((item) =>
            item.id === next.id ? { ...item, status: "downloading", error: undefined } : item,
          ),
        );

        const result = await downloadRef.current.start(next.options);

        let settled: QueueItem | undefined;
        updateItems((previous) =>
          previous.map((item) => {
            if (item.id !== next.id) {
              return item;
            }

            if (result.status === "completed") {
              settled = {
                ...item,
                status: "completed",
                filePath: result.filePath,
                error: undefined,
              };
              return settled;
            }

            if (result.status === "cancelled") {
              settled = { ...item, status: "cancelled", error: undefined };
              return settled;
            }

            settled = { ...item, status: "error", error: result.error };
            return settled;
          }),
        );

        if (settled?.status === "completed") {
          listenersRef.current.onCompleted?.(settled);
        } else if (settled?.status === "cancelled") {
          listenersRef.current.onCancelled?.(settled);
        } else if (settled?.status === "error") {
          listenersRef.current.onError?.(settled);
        }
      }
    } finally {
      pumpingRef.current = false;
      if (itemsRef.current.some((item) => item.status === "queued")) {
        void pump();
      }
    }
  }, [updateItems]);

  function isActiveUrl(url: string): boolean {
    const trimmed = url.trim();
    return items.some(
      (item) =>
        item.url === trimmed &&
        (item.status === "queued" || item.status === "downloading"),
    );
  }

  function enqueue(input: EnqueueInput): { ok: true; item: QueueItem } | { ok: false; reason: "duplicate" } {
    const url = input.url.trim();
    if (
      itemsRef.current.some(
        (item) =>
          item.url === url &&
          (item.status === "queued" || item.status === "downloading"),
      )
    ) {
      return { ok: false, reason: "duplicate" };
    }

    const item: QueueItem = {
      id: createQueueId(),
      url,
      title: input.video.title,
      thumbnail: input.video.thumbnail,
      mode: input.options.mode,
      quality: input.options.quality,
      audioFormat: input.options.audioFormat,
      videoCodec: input.options.videoCodec,
      options: { ...input.options, url },
      status: "queued",
    };

    updateItems((previous) => [...previous, item]);
    void pump();
    return { ok: true, item };
  }

  function remove(id: string) {
    updateItems((previous) =>
      previous.filter((item) => item.id !== id || item.status === "downloading"),
    );
  }

  function retry(id: string) {
    updateItems((previous) =>
      previous.map((item) =>
        item.id === id && item.status !== "downloading" && item.status !== "queued"
          ? { ...item, status: "queued", error: undefined, filePath: undefined }
          : item,
      ),
    );
    void pump();
  }

  function clearQueued() {
    updateItems((previous) => previous.filter((item) => item.status !== "queued"));
  }

  function clearFinished() {
    updateItems((previous) =>
      previous.filter(
        (item) =>
          item.status === "queued" || item.status === "downloading",
      ),
    );
  }

  async function cancelCurrent() {
    const current = itemsRef.current.find((item) => item.status === "downloading");
    if (!current) {
      return;
    }

    await downloadRef.current.cancel();
  }

  const current = items.find((item) => item.status === "downloading") ?? null;
  const queuedCount = items.filter((item) => item.status === "queued").length;
  const busy = Boolean(current);

  return {
    items,
    current,
    queuedCount,
    busy,
    isActiveUrl,
    enqueue,
    remove,
    retry,
    clearQueued,
    clearFinished,
    cancelCurrent,
  };
}
