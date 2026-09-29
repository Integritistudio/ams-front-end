/** Tracks last user / API activity for inactivity session timeout. */

const DEFAULT_MINUTES = 30;
const STORAGE_KEY = 'integriti_session_timeout_minutes';

let lastActivityAt = Date.now();
let timeoutMinutes = DEFAULT_MINUTES;

export function touchSessionActivity() {
  lastActivityAt = Date.now();
}

export function getLastSessionActivity() {
  return lastActivityAt;
}

/** Milliseconds remaining until idle logout (0 if already idle). */
export function getIdleRemainingMs() {
  const limitMs = timeoutMinutes * 60 * 1000;
  return Math.max(0, limitMs - (Date.now() - lastActivityAt));
}

export function formatIdleCountdown(ms = getIdleRemainingMs()) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getSessionTimeoutMinutes() {
  return timeoutMinutes;
}

export function setSessionTimeoutMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 1) {
    timeoutMinutes = DEFAULT_MINUTES;
  } else {
    timeoutMinutes = Math.min(480, Math.max(1, Math.round(n)));
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, String(timeoutMinutes));
    } catch (_e) {
      /* ignore */
    }
  }
  return timeoutMinutes;
}

export function loadCachedSessionTimeoutMinutes() {
  if (typeof window === 'undefined') return DEFAULT_MINUTES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) setSessionTimeoutMinutes(raw);
  } catch (_e) {
    /* ignore */
  }
  return timeoutMinutes;
}

export function isSessionIdle() {
  const limitMs = timeoutMinutes * 60 * 1000;
  return Date.now() - lastActivityAt >= limitMs;
}

export const SESSION_TIMEOUT_DEFAULT_MINUTES = DEFAULT_MINUTES;
