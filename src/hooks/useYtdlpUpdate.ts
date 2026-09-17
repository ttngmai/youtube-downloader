import { useCallback, useEffect, useState } from "react";
import { getYtdlpStatus, toAppError, updateYtdlp } from "@/lib/tauri";
import type { AppError } from "@/types/download";
import type { YtdlpStatus } from "@/types/ytdlp";

export function useYtdlpUpdate() {
  const [status, setStatus] = useState<YtdlpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getYtdlpStatus();
      setStatus(next);
      return next;
    } catch (caught) {
      const appError = toAppError(caught);
      setError(appError);
      throw appError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      // Error state is already stored.
    });
  }, [refresh]);

  async function update() {
    if (updating) {
      return null;
    }

    setUpdating(true);
    setError(null);
    try {
      const result = await updateYtdlp();
      setStatus({
        currentVersion: result.currentVersion,
        latestVersion: result.currentVersion,
        updateAvailable: false,
      });
      return result;
    } catch (caught) {
      const appError = toAppError(caught);
      setError(appError);
      throw appError;
    } finally {
      setUpdating(false);
    }
  }

  return {
    status,
    loading,
    updating,
    error,
    refresh,
    update,
  };
}
