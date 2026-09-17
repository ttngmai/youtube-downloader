import { CheckCircle2, CircleAlert, Download, FolderOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fileNameFromPath, formatEta, formatSpeed } from "@/lib/format";
import type { AppStatus, DownloadProgress } from "@/types/download";

interface DownloadProgressCardProps {
  status: AppStatus;
  progress?: DownloadProgress | null;
  filePath?: string | null;
  jobTitle?: string | null;
  onOpenFile?: () => void;
  onRevealInFolder?: () => void;
}

const STATUS_COPY: Record<AppStatus, { title: string; description: string }> = {
  idle: {
    title: "대기 중",
    description: "다운로드를 시작하면 진행률이 여기에 표시됩니다.",
  },
  fetchingMetadata: {
    title: "영상 정보를 불러오는 중...",
    description: "메타데이터를 확인하고 있습니다.",
  },
  ready: {
    title: "다운로드 준비됨",
    description: "설정을 확인한 뒤 Download를 누르세요. 받는 동안 다음 영상도 대기열에 넣을 수 있습니다.",
  },
  downloading: {
    title: "Downloading...",
    description: "파일을 받는 중입니다.",
  },
  processing: {
    title: "영상 처리 중...",
    description: "ffmpeg로 파일을 변환하거나 병합하고 있습니다.",
  },
  completed: {
    title: "Download completed",
    description: "파일이 저장 폴더에 준비되었습니다.",
  },
  error: {
    title: "다운로드에 실패했습니다",
    description: "설정을 확인한 뒤 다시 시도하세요.",
  },
};

export function DownloadProgressCard({
  status,
  progress,
  filePath,
  jobTitle,
  onOpenFile,
  onRevealInFolder,
}: DownloadProgressCardProps) {
  const copy = STATUS_COPY[status];
  const percent = clampPercent(progress?.percent ?? (status === "completed" ? 100 : 0));
  const showMetrics =
    status === "downloading" &&
    (progress?.speed != null || progress?.eta != null);
  const completedPath = status === "completed" ? filePath : null;
  const description = completedPath
    ? fileNameFromPath(completedPath)
    : jobTitle && (status === "downloading" || status === "processing")
      ? jobTitle
      : (progress?.message ?? copy.description);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              {status === "completed" ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : null}
              {status === "error" ? (
                <CircleAlert className="size-4 text-destructive" />
              ) : null}
              {status === "idle" || status === "ready" ? (
                <Download className="size-4 text-muted-foreground" />
              ) : null}
              {copy.title}
            </CardTitle>
            <CardDescription
              title={completedPath ?? undefined}
              className="whitespace-pre-wrap break-words"
            >
              {description}
            </CardDescription>
          </div>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {percent}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={percent} className="h-2" />
        {showMetrics ? (
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>속도 {formatSpeed(progress?.speed ?? Number.NaN)}</span>
            <span>남은 시간 {formatEta(progress?.eta ?? Number.NaN)}</span>
          </div>
        ) : null}
        {completedPath ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="sm"
              className="h-9 flex-1"
              onClick={onOpenFile}
            >
              <Play />
              파일 열기
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 flex-1"
              onClick={onRevealInFolder}
            >
              <FolderOpen />
              폴더에서 보기
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}
