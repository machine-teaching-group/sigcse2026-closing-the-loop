/* Simple client-side logging utility with level gating and structured output */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogEvent {
  ts: string;
  ns: string; // namespace (e.g., API, UI, POLL)
  event: string;
  level: Level;
  payload?: unknown;
}

// Read log level from localStorage (user can run: localStorage.setItem('logLevel','debug'))
function currentLevel(): Level {
  const v = (typeof localStorage !== 'undefined' && localStorage.getItem('logLevel')) || 'info';
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  return 'info';
}

const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldLog(l: Level) {
  return levelOrder[l] >= levelOrder[currentLevel()];
}

function baseLog(level: Level, ns: string, event: string, payload?: unknown) {
  if (!shouldLog(level)) return;
  const logObj: LogEvent = { ts: new Date().toISOString(), ns, event, level, payload };
  const msg = `[${logObj.ts}] [${level.toUpperCase()}] [${ns}] ${event}`;
  if (level === 'error') console.error(msg, payload);
  else if (level === 'warn') console.warn(msg, payload);
  else if (level === 'debug') console.debug(msg, payload);
  else console.log(msg, payload);
}

export const logDebug = (ns: string, event: string, payload?: unknown) => baseLog('debug', ns, event, payload);
export const logInfo = (ns: string, event: string, payload?: unknown) => baseLog('info', ns, event, payload);
export const logWarn = (ns: string, event: string, payload?: unknown) => baseLog('warn', ns, event, payload);
export const logError = (ns: string, event: string, payload?: unknown) => baseLog('error', ns, event, payload);

// Helper for timing an async function
export async function withTiming<T>(ns: string, event: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const elapsed = +(performance.now() - start).toFixed(1);
    logDebug(ns, `${event}:timing`, { elapsedMs: elapsed });
    return result;
  } catch (e) {
    const elapsed = +(performance.now() - start).toFixed(1);
    logError(ns, `${event}:failed`, { elapsedMs: elapsed, error: (e as any)?.message });
    throw e;
  }
}
