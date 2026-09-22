/**
 * Same-day shift hours: accumulate while logged in, pause on logout / session end,
 * resume on same calendar day, reset to 0 on a new day.
 */

function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function storageKey(email) {
  return `integriti_shift_${String(email || '').toLowerCase()}_${localDayKey()}`;
}

function read(email) {
  if (typeof window === 'undefined' || !email) {
    return { accumulatedMs: 0, sessionStartedAt: null };
  }
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return { accumulatedMs: 0, sessionStartedAt: null };
    const parsed = JSON.parse(raw);
    return {
      accumulatedMs: Math.max(0, Number(parsed.accumulatedMs) || 0),
      sessionStartedAt: parsed.sessionStartedAt ? Number(parsed.sessionStartedAt) : null,
    };
  } catch (_e) {
    return { accumulatedMs: 0, sessionStartedAt: null };
  }
}

function write(email, data) {
  if (typeof window === 'undefined' || !email) return;
  localStorage.setItem(
    storageKey(email),
    JSON.stringify({
      accumulatedMs: Math.max(0, Number(data.accumulatedMs) || 0),
      sessionStartedAt: data.sessionStartedAt || null,
    })
  );
}

/** Start or resume counting for today's shift. */
export function startShift(email) {
  if (!email) return;
  const data = read(email);
  if (!data.sessionStartedAt) {
    data.sessionStartedAt = Date.now();
    write(email, data);
  }
}

/** Pause and bank elapsed time (logout, session expiry, tab close). */
export function pauseShift(email) {
  if (!email) return;
  const data = read(email);
  if (data.sessionStartedAt) {
    data.accumulatedMs += Date.now() - data.sessionStartedAt;
    data.sessionStartedAt = null;
    write(email, data);
  }
}

/** Total shift ms for today (accumulated + current open session). */
export function getShiftElapsedMs(email) {
  if (!email) return 0;
  const data = read(email);
  let ms = data.accumulatedMs || 0;
  if (data.sessionStartedAt) ms += Date.now() - data.sessionStartedAt;
  return Math.max(0, ms);
}

export function formatShiftHours(ms) {
  const totalMins = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const mins = (totalMins % 60).toString().padStart(2, '0');
  return `${hrs}h ${mins}m`;
}
