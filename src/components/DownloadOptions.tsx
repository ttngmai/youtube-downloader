import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AUDIO_FORMAT_LABELS,
  AUDIO_FORMATS,
  VIDEO_CODEC_LABELS,
  VIDEO_CODEC_NOTES,
  VIDEO_CODECS,
  VIDEO_QUALITIES,
  VIDEO_QUALITY_LABELS,
  isAudioFormat,
  isDownloadMode,
  isVideoCodec,
  isVideoQuality,
  type AudioFormat,
  type DownloadMode,
  type VideoCodec,
  type VideoQuality,
} from "@/types/download";
import type { VideoFormat } from "@/types/video";
import {
  codecMaxHeight,
  formatHeightLabel,
  hasQualityOption,
  summarizeAvailableFormats,
} from "@/lib/availableFormats";

interface DownloadOptionsProps {
  mode: DownloadMode;
  quality: VideoQuality;
  audioFormat: AudioFormat;
  videoCodec: VideoCodec;
  formats?: VideoFormat[] | null;
  outputDirectory: string;
  disabled?: boolean;
  onModeChange: (mode: DownloadMode) => void;
  onQualityChange: (quality: VideoQuality) => void;
  onAudioFormatChange: (format: AudioFormat) => void;
  onVideoCodecChange: (codec: VideoCodec) => void;
  onPickFolder: () => void;
}

export function DownloadOptions({
  mode,
  quality,
  audioFormat,
  videoCodec,
  formats,
  outputDirectory,
  disabled = false,
  onModeChange,
  onQualityChange,
  onAudioFormatChange,
  onVideoCodecChange,
  onPickFolder,
}: DownloadOptionsProps) {
  const available = summarizeAvailableFormats(formats);
  const selectedQualityMissing =
    Boolean(available) && !hasQualityOption(available, quality);
  const selectedCodecHeight = codecMaxHeight(available, videoCodec);
  const selectedCodecMissing = Boolean(available) && selectedCodecHeight === null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>다운로드 설정</CardTitle>
        <CardDescription>
          포맷과 화질을 고르고 저장할 폴더를 지정하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Format</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={mode}
            disabled={disabled}
            className="w-full sm:w-auto"
            onValueChange={(value) => {
              if (isDownloadMode(value)) {
                onModeChange(value);
              }
            }}
          >
            <ToggleGroupItem value="video" className="flex-1 sm:flex-none">
              Video
            </ToggleGroupItem>
            <ToggleGroupItem value="audio" className="flex-1 sm:flex-none">
              Audio
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {mode === "video" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="video-quality">Video Quality</Label>
              <Select
                value={quality}
                disabled={disabled}
                onValueChange={(value) => {
                  if (isVideoQuality(value)) {
                    onQualityChange(value);
                  }
                }}
              >
                <SelectTrigger id="video-quality" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {VIDEO_QUALITIES.map((item) => {
                    const hint = qualityAvailabilityLabel(available, item);
                    return (
                      <SelectItem key={item} value={item}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{VIDEO_QUALITY_LABELS[item]}</span>
                          {hint ? (
                            <span className="text-xs text-muted-foreground">{hint}</span>
                          ) : null}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedQualityMissing && available?.maxHeight ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  이 영상은 최대 {formatHeightLabel(available.maxHeight)}까지 있습니다. 더 높은 화질을 고르면 가능한 화질로 받습니다.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-codec">Video Codec</Label>
              <Select
                value={videoCodec}
                disabled={disabled}
                onValueChange={(value) => {
                  if (isVideoCodec(value)) {
                    onVideoCodecChange(value);
                  }
                }}
              >
                <SelectTrigger id="video-codec" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {VIDEO_CODECS.map((item) => {
                    const hint = codecAvailabilityLabel(available, item);
                    return (
                      <SelectItem key={item} value={item}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{VIDEO_CODEC_LABELS[item]}</span>
                          {hint ? (
                            <span className="text-xs text-muted-foreground">{hint}</span>
                          ) : null}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {VIDEO_CODEC_NOTES[videoCodec]}
              </p>
              {selectedCodecMissing ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  이 영상에는 {VIDEO_CODEC_LABELS[videoCodec]} 스트림이 없습니다. 받으면 다른 코덱으로 대체될 수 있습니다.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="audio-format">Audio Format</Label>
            <Select
              value={audioFormat}
              disabled={disabled}
              onValueChange={(value) => {
                if (isAudioFormat(value)) {
                  onAudioFormatChange(value);
                }
              }}
            >
              <SelectTrigger id="audio-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {AUDIO_FORMATS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {AUDIO_FORMAT_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="output-folder">Output Folder</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <p
              id="output-folder"
              title={outputDirectory}
              className="h-9 min-w-0 flex-1 truncate rounded-lg border border-input bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground dark:bg-input/30"
            >
              {outputDirectory}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="h-9 shrink-0"
              onClick={onPickFolder}
            >
              <FolderOpen />
              폴더 선택
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function qualityAvailabilityLabel(
  available: ReturnType<typeof summarizeAvailableFormats>,
  quality: VideoQuality,
): string | null {
  if (!available || quality === "best") {
    return null;
  }

  return hasQualityOption(available, quality) ? null : "없음";
}

function codecAvailabilityLabel(
  available: ReturnType<typeof summarizeAvailableFormats>,
  codec: VideoCodec,
): string | null {
  if (!available) {
    return null;
  }

  const height = codecMaxHeight(available, codec);
  return height ? `최대 ${formatHeightLabel(height)}` : "없음";
}
