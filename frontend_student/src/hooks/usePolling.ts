import { useEffect, useRef } from 'react';

export function usePolling(callback: () => void, delayMs: number, active: boolean) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      try {
        saved.current();
      } catch (e) {
        // Guard against synchronous errors thrown by the callback so the
        // polling interval keeps running and we don't produce uncaught
        // exceptions in the console.
        // eslint-disable-next-line no-console
        console.error('Polling callback error', e);
      }
    }, delayMs);
    return () => clearInterval(id);
  }, [delayMs, active]);
}
