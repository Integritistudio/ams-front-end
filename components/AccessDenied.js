'use client';

export default function AccessDenied({ moduleName }) {
  return (
    <div className="empty-state" style={{ padding: '48px 24px' }}>
      <i className="fa-solid fa-lock" style={{ fontSize: 28, marginBottom: 12, display: 'block', color: 'var(--text-muted)' }} />
      <strong style={{ display: 'block', marginBottom: 6, color: 'var(--text-main)' }}>Access Denied</strong>
      <span style={{ color: 'var(--text-muted)' }}>
        You do not have permission to view{moduleName ? ` ${moduleName}` : ' this module'}.
      </span>
    </div>
  );
}
