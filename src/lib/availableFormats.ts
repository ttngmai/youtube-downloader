import {
  VIDEO_QUALITY_LABELS,
  type VideoCodec,
  type VideoQuality,
} from "@/types/download";
import type { VideoFormat } from "@/types/video";

export const CODEC_FAMILIES = ["av1", "avc1", "vp9"] as const;

export type CodecFamily = (typeof CODEC_FAMILIES)[number];

export const CODEC_FAMILY_LABELS: Record<CodecFamily, string> = {
  av1: "AV1",
  avc1: "H.264",
  vp9: "VP9",
};

const QUALITY_HEIGHTS: Array<Exclude<VideoQuality, "best">> = [
  "2160",
  "1440",
  "1080",
  "720",
  "480",
  "360",
];

export interface CodecAvailability {
  family: CodecFamily;
  maxHeight: number;
}

export interface AvailableFormats {
  qualities: Array<Exclude<VideoQuality, "best">>;
  maxHeight: number | null;
  codecs: CodecAvailability[];
}

export function summarizeAvailableFormats(
  formats: VideoFormat[] | null | undefined,
): AvailableFormats | null {
  if (!formats || formats.length === 0) {
    return null;
  }

  const qualitySet = new Set<Exclude<VideoQuality, "best">>();
  const codecMax = new Map<CodecFamily, number>();
  let maxHeight = 0;

  for (const format of formats) {
    const height = format.height;
    if (!height || height <= 0) {
      continue;
    }

    maxHeight = Math.max(maxHeight, height);

    const quality = qualityBucket(height);
    if (quality) {
      qualitySet.add(quality);
    }

    const family = classifyVideoCodec(format.vcodec);
    if (!family) {
      continue;
    }

    const previous = codecMax.get(family) ?? 0;
    if (height > previous) {
      codecMax.set(family, height);
    }
  }

  if (maxHeight === 0 && codecMax.size === 0) {
    return null;
  }

  return {
    qualities: QUALITY_HEIGHTS.filter((quality) => qualitySet.has(quality)),
    maxHeight: maxHeight > 0 ? maxHeight : null,
    codecs: CODEC_FAMILIES.flatMap((family) => {
      const height = codecMax.get(family);
      return height ? [{ family, maxHeight: height }] : [];
    }),
  };
}

export function classifyVideoCodec(vcodec?: string): CodecFamily | null {
  if (!vcodec) {
    return null;
  }

  const value = vcodec.trim().toLowerCase();
  if (!value || value === "none") {
    return null;
  }

  if (value.startsWith("av01") || value === "av1") {
    return "av1";
  }

  if (
    value.startsWith("avc1") ||
    value.startsWith("avc3") ||
    value.startsWith("avc") ||
    value.includes("h264")
  ) {
    return "avc1";
  }

  if (value.startsWith("vp09") || value.startsWith("vp9")) {
    return "vp9";
  }

  return null;
}

export function hasQualityOption(
  available: AvailableFormats | null,
  quality: VideoQuality,
): boolean {
  if (quality === "best") {
    return true;
  }

  if (!available?.maxHeight) {
    return true;
  }

  return available.maxHeight >= Number(quality);
}

export function codecMaxHeight(
  available: AvailableFormats | null,
  codec: VideoCodec,
): number | null {
  return available?.codecs.find((item) => item.family === codec)?.maxHeight ?? null;
}

export function formatQualityLabel(quality: VideoQuality): string {
  return VIDEO_QUALITY_LABELS[quality];
}

export function formatHeightLabel(height: number): string {
  return `${height}p`;
}

function qualityBucket(height: number): Exclude<VideoQuality, "best"> | null {
  if (height >= 2160) {
    return "2160";
  }
  if (height >= 1440) {
    return "1440";
  }
  if (height >= 1080) {
    return "1080";
  }
  if (height >= 720) {
    return "720";
  }
  if (height >= 480) {
    return "480";
  }
  if (height >= 360) {
    return "360";
  }
  return null;
}
