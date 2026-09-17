import { FolderOpen, Play, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AUDIO_FORMAT_LABELS,
  VIDEO_QUALITY_LABELS,
} from "@/types/download";
import {
  QUEUE_STATUS_LABELS,
  type QueueItem,
} from "@/types/queue";

interface DownloadQueueProps {
  items: QueueItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCancelCurrent: () => void;
  onClearQueued: () => void;
  onClearFinished: () => void;
  onOpenFile: (path: string) => void;
  onRevealInFolder: (path: string) => void;
}

export function DownloadQueue({
  items,
  onRemove,
  onRetry,
  onCancelCurrent,
  onClearQueued,
  onClearFinished,
  onOpenFile,
  onRevealInFolder,
}: DownloadQueueProps) {
  if (items.length === 0) {
    return null;
  }

  const queuedCount = items.filter((item) => item.status === "queued").length;
  const finishedCount = items.filter(
    (item) =>
      item.status === "completed" ||
      item.status === "error" ||
      item.status === "cancelled",
  ).length;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>대기열</CardTitle>
            <CardDescription>
              {queuedCount > 0
                ? `${queuedCount}개가 차례를 기다리고 있습니다.`
                : "한 번에 하나씩 이어서 받습니다."}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {queuedCount > 0 ? (
              <Button type="button" variant="ghost" size="xs" onClick={onClearQueued}>
                대기 삭제
              </Button>
            ) : null}
            {finishedCount > 0 ? (
              <Button type="button" variant="ghost" size="xs" onClick={onClearFinished}>
                완료 삭제
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
            onRetry={() => onRetry(item.id)}
            onCancelCurrent={onCancelCurrent}
            onOpenFile={onOpenFile}
            onRevealInFolder={onRevealInFolder}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function QueueRow({
  item,
  onRemove,
  onRetry,
  onCancelCurrent,
  onOpenFile,
  onRevealInFolder,
}: {
  item: QueueItem;
  onRemove: () => void;
  onRetry: () => void;
  onCancelCurrent: () => void;
  onOpenFile: (path: string) => void;
  onRevealInFolder: (path: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/70 px-2.5 py-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" title={item.title}>
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={badgeVariant(item.status)}>{QUEUE_STATUS_LABELS[item.status]}</Badge>
          <span className="text-xs text-muted-foreground">{formatItemOptions(item)}</span>
        </div>
        {item.status === "error" && item.error?.message ? (
          <p className="line-clamp-2 text-xs text-destructive">{item.error.message}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {item.status === "queued" ? (
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label="대기열에서 제거">
            <Trash2 />
          </Button>
        ) : null}
        {item.status === "downloading" ? (
          <Button type="button" variant="ghost" size="icon-xs" onClick={onCancelCurrent} aria-label="현재 항목 취소">
            <X />
          </Button>
        ) : null}
        {item.status === "completed" && item.filePath ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenFile(item.filePath!)}
              aria-label="파일 열기"
            >
              <Play />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onRevealInFolder(item.filePath!)}
              aria-label="폴더에서 보기"
            >
              <FolderOpen />
            </Button>
          </>
        ) : null}
        {item.status === "error" || item.status === "cancelled" ? (
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRetry} aria-label="다시 받기">
            <RotateCcw />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatItemOptions(item: QueueItem): string {
  if (item.mode === "audio") {
    return item.audioFormat ? AUDIO_FORMAT_LABELS[item.audioFormat] : "Audio";
  }

  const parts = ["Video"];
  if (item.quality) {
    parts.push(VIDEO_QUALITY_LABELS[item.quality]);
  }
  if (item.videoCodec) {
    parts.push(item.videoCodec === "avc1" ? "H.264" : "AV1");
  }
  return parts.join(" · ");
}

function badgeVariant(status: QueueItem["status"]) {
  if (status === "completed") {
    return "secondary" as const;
  }
  if (status === "error") {
    return "destructive" as const;
  }
  if (status === "downloading") {
    return "default" as const;
  }
  return "outline" as const;
}
