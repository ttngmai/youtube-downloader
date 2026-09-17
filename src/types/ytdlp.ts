export interface YtdlpStatus {
  currentVersion: string;
  latestVersion?: string | null;
  updateAvailable: boolean;
}

export interface YtdlpUpdateResult {
  previousVersion: string;
  currentVersion: string;
  updated: boolean;
}
