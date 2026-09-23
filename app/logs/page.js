'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import { EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { logsApi } from '../../services/api';

export default function LogsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await logsApi.list();
      setLogs(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('logs')) return;
    load();
  }, [hasPermission, load]);

  const exportPack = useMemo(() => ({
    headers: ['Time', 'Action', 'Target', 'Details', 'User Name', 'User Email', 'User Role'],
    rows: logs.map((log) => [
      log.created_at || log.createdAt
        ? new Date(log.created_at || log.createdAt).toLocaleString()
        : '',
      log.action || '',
      log.target_id || log.targetId || '',
      log.details || '',
      log.user_name || log.userName || '',
      log.user_email || log.userEmail || '',
      log.user_role || log.userRole || '',
    ]),
  }), [logs]);

  async function clearLogs() {
    if (!window.confirm('Clear your audit logs? This cannot be undone.')) return;
    try {
      await logsApi.clear();
      showToast('Cleared', 'Audit logs cleared.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Clear failed', 'error');
    }
  }

  if (!hasPermission('logs')) {
    return (
      <AppShell title="My Logs" subtitle="System activity and audit trail.">
        <AccessDenied moduleName="Activity Logs" />
      </AppShell>
    );
  }

  return (
    <AppShell title="My Activity Logs" subtitle="Track actions, holds, SLA changes, and approvals.">
      <div className="logs-wrapper-box">
        <div className="logs-header-bar">
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-main)' }}>
              <i className="fa-solid fa-clock-rotate-left" /> System Activity & Audit Trail
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Track actions, holds, SLA changes, auto-assignments, and approvals.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <TableExportButtons
              filename="activity-logs"
              title="System Activity & Audit Trail"
              headers={exportPack.headers}
              rows={exportPack.rows}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearLogs}>
              <i className="fa-solid fa-trash-can" /><span>Clear Logs</span>
            </button>
          </div>
        </div>
        <div className="logs-timeline">
          {loading ? (
            <DataLoader label="Loading activity logs..." />
          ) : logs.length === 0 ? (
            <EmptyState text="No activity logs found." />
          ) : (
            logs.map((log) => (
              <div key={log.id || `${log.created_at}-${log.action}`} className="log-entry-item">
                <div className="log-icon-bullet"><i className="fa-solid fa-bolt" /></div>
                <div className="log-entry-content">
                  <div className="log-entry-top">
                    <strong style={{ color: 'var(--primary)' }}>
                      {log.action}
                      {log.target_id || log.targetId ? ` [${log.target_id || log.targetId}]` : ''}
                    </strong>
                    <span className="log-entry-time">
                      {log.created_at || log.createdAt
                        ? new Date(log.created_at || log.createdAt).toLocaleString()
                        : ''}
                    </span>
                  </div>
                  <div className="log-entry-desc">{log.details}</div>
                  <div className="log-entry-user">
                    Initiated by: <strong>{log.user_name || log.userName || 'User'}</strong>
                    {' '}({log.user_email || log.userEmail || '—'})
                    {log.user_role || log.userRole ? ` - ${log.user_role || log.userRole}` : ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
