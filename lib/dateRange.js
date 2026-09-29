/** Shared date-range presets for list table filters. */

export const DATE_RANGE_PRESETS = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'current_week', label: 'Current Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'current_month', label: 'Current Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

export function emptyDateRange() {
  return { preset: 'all', from: '', to: '' };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday = start of week (ISO). */
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeek(d) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

function startOfMonth(d) {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function parseYmd(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {{ start: Date|null, end: Date|null }}
 */
export function resolveDateRange(state, now = new Date()) {
  const preset = state?.preset || 'all';
  if (preset === 'all') return { start: null, end: null };

  if (preset === 'today') {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y) };
  }
  if (preset === 'current_week') {
    return { start: startOfWeek(now), end: endOfWeek(now) };
  }
  if (preset === 'last_week') {
    const ref = new Date(now);
    ref.setDate(ref.getDate() - 7);
    return { start: startOfWeek(ref), end: endOfWeek(ref) };
  }
  if (preset === 'current_month') {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  if (preset === 'last_month') {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }
  if (preset === 'custom') {
    const from = parseYmd(state?.from);
    const to = parseYmd(state?.to);
    return {
      start: from ? startOfDay(from) : null,
      end: to ? endOfDay(to) : null,
    };
  }
  return { start: null, end: null };
}

export function getRowDate(row, fields = ['created_at', 'createdAt']) {
  if (!row) return null;
  const list = Array.isArray(fields) ? fields : [fields];
  for (const key of list) {
    const raw = row[key];
    if (raw == null || raw === '') continue;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Returns true if the row's date falls within the selected range (inclusive). */
export function rowInDateRange(row, state, fields = ['created_at', 'createdAt']) {
  const { start, end } = resolveDateRange(state);
  if (!start && !end) return true;
  const d = getRowDate(row, fields);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}
