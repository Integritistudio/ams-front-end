/** Shared helpers for dashboard analytics aggregations. */

export const CHART_COLORS = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#06b6d4',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

export function parseDate(row) {
  const raw =
    row?.created_timestamp ||
    row?.createdTimestamp ||
    row?.created_at ||
    row?.createdAt ||
    row?.purchase_date ||
    row?.purchaseDate ||
    row?.assigned_at ||
    row?.assignedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatDayLabel(d) {
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export function formatWeekLabel(d) {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${formatDayLabel(d)}–${formatDayLabel(end)}`;
}

export function formatMonthLabel(d) {
  return d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
}

/**
 * Bucket rows into daily / weekly / monthly series.
 * @param {'daily'|'weekly'|'monthly'} period
 */
export function buildTimeSeries(rows, period = 'daily', valueKeys = [{ key: 'count', pick: () => 1 }]) {
  const now = startOfDay(new Date());
  const buckets = [];

  if (period === 'daily') {
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({
        key: d.toISOString().slice(0, 10),
        label: formatDayLabel(d),
        start: d,
        end: new Date(d.getTime() + 86400000 - 1),
      });
    }
  } else if (period === 'weekly') {
    for (let i = 7; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      buckets.push({
        key: d.toISOString().slice(0, 10),
        label: formatWeekLabel(d),
        start: d,
        end: new Date(d.getTime() + 7 * 86400000 - 1),
      });
    }
  } else {
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      buckets.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: formatMonthLabel(d),
        start: d,
        end,
      });
    }
  }

  return buckets.map((b) => {
    const inBucket = rows.filter((r) => {
      const dt = parseDate(r);
      return dt && dt >= b.start && dt <= b.end;
    });
    const point = { label: b.label, key: b.key };
    valueKeys.forEach(({ key, pick }) => {
      point[key] = inBucket.reduce((sum, r) => sum + Number(pick(r) || 0), 0);
    });
    return point;
  });
}

export function countBy(rows, getter, { top = 8, emptyLabel = 'Unknown' } = {}) {
  const map = new Map();
  rows.forEach((r) => {
    const raw = getter(r);
    const label = (raw == null || String(raw).trim() === '') ? emptyLabel : String(raw).trim();
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

export function isPendingStatus(status) {
  return String(status || '').toLowerCase().includes('pending');
}

export function isOpenTicket(status) {
  const s = String(status || '').toLowerCase();
  return !s.includes('resolved') && !s.includes('closed') && !s.includes('cancel');
}

export function filterOwn(rows, user) {
  const email = (user?.email || '').toLowerCase();
  const name = (user?.name || '').toLowerCase();
  const id = user?.id;
  if (!email && !id) return [];
  return rows.filter((r) => {
    const requesterEmail = (r.requester_email || r.requesterEmail || r.email || '').toLowerCase();
    const assignedEmail = (r.assigned_to_email || r.assignedToEmail || r.user_email || r.userEmail || '').toLowerCase();
    const assigneeName = (r.assigned_to || r.assignedTo || r.assignee || '').toLowerCase();
    if (email && (requesterEmail === email || assignedEmail === email)) return true;
    if (id && (Number(r.requester_id) === Number(id) || Number(r.user_id) === Number(id))) return true;
    if (name && assigneeName === name) return true;
    return false;
  });
}

/** Convert series objects into CSV-friendly [headers, rows]. */
export function seriesToExport(series, nameKey = 'name', valueKey = 'value') {
  if (!Array.isArray(series) || !series.length) {
    return { headers: [nameKey, valueKey], rows: [] };
  }
  const keys = Object.keys(series[0]);
  return {
    headers: keys,
    rows: series.map((row) => keys.map((k) => row[k] ?? '')),
  };
}
