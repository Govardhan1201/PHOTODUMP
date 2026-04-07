'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getJobProgress, SessionProgress } from '@/lib/api';

/**
 * Polls the job progress endpoint for a given session.
 * Stops polling when the session reaches COMPLETED or FAILED.
 */
export function useJobStatus(sessionId: string | null, intervalMs = 1500) {
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPolling(false);
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await getJobProgress(sessionId);
      setProgress(data);
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        stopPolling();
      }
    } catch (e: any) {
      setError(e.message);
      stopPolling();
    }
  }, [sessionId, stopPolling]);

  useEffect(() => {
    if (!sessionId) return;
    setPolling(true);
    fetchProgress(); // immediate first fetch
    timerRef.current = setInterval(fetchProgress, intervalMs);
    return stopPolling;
  }, [sessionId, fetchProgress, intervalMs, stopPolling]);

  return { progress, error, polling, refetch: fetchProgress };
}
