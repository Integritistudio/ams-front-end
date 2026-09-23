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
        <button type="button" className="btn-page" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
        {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map((p) => (
          <button key={p} type="button" className={`btn-page ${p === page ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>
        ))}
        <button type="button" className="btn-page" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function EmptyState({ text }) {
  return <div className="empty-state">{text || 'No records found.'}</div>;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Download filtered rows as CSV (all matching rows, not only current page). */
export function exportRowsToCsv(filename, headers, rows) {
  const csv = [headers.join(',')]
    .concat(rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Opens a clean printable table. Browser Print dialog also supports "Save as PDF".
 */
export function openPrintableTable({ title, headers, rows }) {
  if (typeof window === 'undefined') return;

  const generated = new Date().toLocaleString();
  const headCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const bodyRows = (rows || [])
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || 'Report')}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #0f172a; margin: 24px; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    tr:nth-child(even) td { background: #f8fafc; }
    @media print {
      body { margin: 12px; }
      h1 { font-size: 16px; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title || 'Report')}</h1>
  <div class="meta">Integriti IT Helpdesk · Generated ${escapeHtml(generated)} · ${rows?.length || 0} record(s)</div>
  <table>
    <thead><tr>${headCells}</tr></thead>
    <tbody>${bodyRows || `<tr><td colspan="${Math.max(headers.length, 1)}">No records</td></tr>`}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (!win) {
    URL.revokeObjectURL(url);
    window.alert('Please allow pop-ups to use Print / PDF export.');
    return;
  }

  // Print after the blob document loads (avoid blank page / double dialog)
  let printed = false;
  const tryPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch (_e) {
      /* ignore */
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (typeof win.addEventListener === 'function') {
    win.addEventListener('load', tryPrint);
  }
  setTimeout(tryPrint, 500);
}

/**
 * CSV + PDF (print-to-PDF) + Print — matches index.html admin export group.
 * Exports the provided rows (typically full filtered set, not one page).
 */
export function TableExportButtons({
  filename = 'export',
  title = 'Report',
  headers = [],
  rows = [],
  disabled = false,
}) {
  const empty = !Array.isArray(rows) || rows.length === 0;
  const blocked = disabled || empty || !headers.length;

  function onCsv() {
    if (blocked) return;
    exportRowsToCsv(`${filename}-${stamp()}.csv`, headers, rows);
  }

  function onPrintOrPdf() {
    if (blocked) return;
    openPrintableTable({ title, headers, rows });
  }

  return (
    <div className="export-btn-group">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        title="Export CSV"
        disabled={blocked}
        onClick={onCsv}
      >
        <i className="fa-solid fa-file-csv" /><span>CSV</span>
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        title="Print to PDF"
        disabled={blocked}
        onClick={onPrintOrPdf}
      >
        <i className="fa-solid fa-file-pdf" /><span>PDF</span>
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        title="Print Table"
        disabled={blocked}
        onClick={onPrintOrPdf}
      >
        <i className="fa-solid fa-print" /><span>Print</span>
      </button>
    </div>
  );
}
