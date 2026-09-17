import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { YtdlpStatus } from "@/types/ytdlp";

interface YtdlpUpdateBarProps {
  status: YtdlpStatus | null;
  loading?: boolean;
  updating?: boolean;
  disabled?: boolean;
  onRefresh: () => void;
  onUpdate: () => void;
}

export function YtdlpUpdateBar({
  status,
  loading = false,
  updating = false,
  disabled = false,
  onRefresh,
  onUpdate,
}: YtdlpUpdateBarProps) {
  const busy = loading || updating || disabled;
  const versionLabel = status?.currentVersion ?? (loading ? "확인 중..." : "확인 불가");

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          yt-dlp <span className="tabular-nums text-muted-foreground">{versionLabel}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {statusMessage(status, loading)}
        </p>
      </div>
      {showUpdateButton(status) ? (
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0"
          disabled={busy}
          onClick={onUpdate}
        >
          {updating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {updating ? "업데이트 중..." : "업데이트"}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={busy}
          onClick={onRefresh}
        >
          {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          다시 확인
        </Button>
      )}
    </div>
  );
}

function showUpdateButton(status: YtdlpStatus | null): boolean {
  if (!status) {
    return false;
  }

  return status.updateAvailable || !status.latestVersion;
}

function statusMessage(status: YtdlpStatus | null, loading: boolean): string {
  if (loading && !status) {
    return "버전을 확인하고 있습니다.";
  }
  if (!status) {
    return "버전을 확인하지 못했습니다.";
  }
  if (status.updateAvailable && status.latestVersion) {
    return `새 버전 ${status.latestVersion}을 받을 수 있습니다.`;
  }
  if (!status.latestVersion) {
    return "최신 버전 확인에 실패했습니다. 직접 업데이트할 수 있습니다.";
  }
  return "최신 버전을 사용 중입니다.";
}
