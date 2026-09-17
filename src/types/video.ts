export interface VideoFormat {
  formatId: string;
  ext?: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
}

export interface VideoInfo {
  title: string;
  thumbnail?: string;
  channel?: string;
  duration: number;
  formats: VideoFormat[];
}
