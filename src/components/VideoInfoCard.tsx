import { Clock, ImageOff, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CODEC_FAMILY_LABELS,
  formatHeightLabel,
  formatQualityLabel,
  summarizeAvailableFormats,
  type AvailableFormats,
} from "@/lib/availableFormats";
import { formatDuration } from "@/lib/format";
import type { AppStatus } from "@/types/download";
import type { VideoInfo } from "@/types/video";

interface VideoInfoCardProps {
  status: AppStatus;
  video?: VideoInfo | null;
  errorMessage?: string | null;
}

export function VideoInfoCard({
  status,
  video,
  errorMessage,
}: VideoInfoCardProps) {
  const isLoading = status === "fetchingMetadata";

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>영상 정보</CardTitle>
        <CardDescription>
          URL을 입력하면 제목, 채널, 길이와 가능한 화질을 확인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "error" && errorMessage && !video ? (
          <p className="whitespace-pre-wrap break-words rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : video ? (
          <VideoDetails video={video} />
        ) : (
          <EmptyVideoState isLoading={isLoading} />
        )}
      </CardContent>
    </Card>
  );
}

function VideoDetails({ video }: { video: VideoInfo }) {
  const available = summarizeAvailableFormats(video.formats);

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted sm:w-52 sm:shrink-0">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <ThumbnailFallback />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="truncate text-base font-medium leading-snug">
          {video.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {video.channel ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <UserRound className="size-3.5 shrink-0" />
              <span className="truncate">{video.channel}</span>
            </span>
          ) : null}
          <Badge variant="secondary" className="gap-1">
            <Clock className="size-3" />
            {formatDuration(video.duration)}
          </Badge>
        </div>
        {available ? <AvailableFormatSummary available={available} /> : null}
      </div>
    </div>
  );
}

function AvailableFormatSummary({ available }: { available: AvailableFormats }) {
  return (
    <div className="space-y-1.5 pt-0.5">
      {available.qualities.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {available.qualities.map((quality) => (
            <Badge key={quality} variant="outline">
              {formatQualityLabel(quality)}
            </Badge>
          ))}
        </div>
      ) : null}
      {available.codecs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {available.codecs.map((codec) => (
            <Badge key={codec.family} variant="secondary">
              {CODEC_FAMILY_LABELS[codec.family]} {formatHeightLabel(codec.maxHeight)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyVideoState({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex aspect-video w-32 shrink-0 items-center justify-center rounded-lg bg-muted sm:w-40">
        {isLoading ? (
          <div className="size-7 animate-pulse rounded-md bg-foreground/10" />
        ) : (
          <ThumbnailFallback />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {isLoading ? (
          <div className="h-5 w-3/4 animate-pulse rounded-md bg-muted" />
        ) : (
          <p className="text-sm font-medium text-foreground">
            아직 불러온 영상이 없습니다
          </p>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isLoading
            ? "영상 정보를 불러오는 중..."
            : "YouTube 주소를 입력하면 여기에 미리보기가 표시됩니다."}
        </p>
      </div>
    </div>
  );
}

function ThumbnailFallback() {
  return (
    <div className="flex size-full items-center justify-center text-muted-foreground">
      <ImageOff className="size-6" />
    </div>
  );
}
