'use client';

export function statusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('resolved') || s.includes('fulfilled') || s.includes('approved')) return 'badge badge-resolved';
  if (s.includes('reject')) return 'badge badge-rejected';
  if (s.includes('hold')) return 'badge badge-hold';
  if (s.includes('progress') || s.includes('pending') || s.includes('procurement')) return 'badge badge-progress';
  return 'badge badge-open';
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination-footer">
      <div className="pagination-info">Showing {from} to {to} of {total} records</div>
      <div className="pagination-controls">
        <button className="btn-page" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
        {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map((p) => (
          <button key={p} className={`btn-page ${p === page ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>
        ))}
        <button className="btn-page" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function EmptyState({ text }) {
  return <div className="empty-state">{text || 'No records found.'}</div>;
}

export function exportRowsToCsv(filename, headers, rows) {
  const csv = [headers.join(',')].concat(
    rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
