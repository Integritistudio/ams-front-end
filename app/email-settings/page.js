'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { emailTemplatesApi, settingsApi } from '../../services/api';

const PAGE_SIZE = 10;

const TRIGGERS = [
  {
    title: 'Ticket Created Notification',
    desc: 'Sent automatically to requester and IT Support when a new ticket is raised.',
  },
  {
    title: 'Requisition Manager Approval Alert',
    desc: 'Sent to the selected approver when a new asset request is submitted.',
  },
  {
    title: 'Ticket Resolution & Closure Alert',
    desc: 'Sent to requester when IT marks a ticket as Resolved.',
  },
];

const EMPTY_SMTP = {
  enabled: false,
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  username: '',
  password: '',
  password_set: false,
  from_name: 'IT Service Desk',
  from_email: '',
};

function pid(t) {
  return t?.public_id || t?.publicId || t?.id;
}

const emptyForm = {
  name: '',
  subject: '',
  body: '',
  status: 'Active',
};

export default function EmailSettingsPage() {
  const { hasPermission, user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('smtp');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [smtp, setSmtp] = useState(EMPTY_SMTP);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [testTo, setTestTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emailTemplatesApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadSmtp = useCallback(async () => {
    setSmtpLoading(true);
    try {
      const res = await settingsApi.getSmtp();
      const data = res.data || {};
      setSmtp({
        ...EMPTY_SMTP,
        ...data,
        password: '',
        port: Number(data.port || 587),
      });
      setTestTo((prev) => prev || data.from_email || data.username || user?.email || '');
    } catch (err) {
      showToast('Error', err.message || 'Failed to load SMTP settings', 'error');
    } finally {
      setSmtpLoading(false);
    }
  }, [showToast, user?.email]);

  useEffect(() => {
    if (!hasPermission('email_settings')) return;
    load();
    loadSmtp();
  }, [hasPermission, load, loadSmtp]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) =>
      [pid(t), t.name, t.subject, t.status].join(' ').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Template ID', 'Template Name', 'Subject', 'Status', 'Last Updated'],
    rows: filtered.map((t) => [
      pid(t),
      t.name || '',
      t.subject || '',
      t.status || '',
      t.updated_at || t.updatedAt
        ? new Date(t.updated_at || t.updatedAt).toLocaleString()
        : '',
    ]),
  }), [filtered]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row) {
    setEditingId(pid(row));
    setForm({
      name: row.name || '',
      subject: row.subject || '',
      body: row.body || '',
      status: row.status || 'Active',
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) await emailTemplatesApi.update(editingId, form);
      else await emailTemplatesApi.create(form);
      showToast('Saved', editingId ? 'Template updated.' : 'Template created.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this email template?')) return;
    try {
      await emailTemplatesApi.remove(id);
      showToast('Deleted', 'Template removed.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Delete failed', 'error');
    }
  }

  function applyMicrosoftPreset() {
    setSmtp((s) => ({
      ...s,
      enabled: true,
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      username: s.username || 'Sajid.masood@integriti.io',
      from_email: s.from_email || s.username || 'Sajid.masood@integriti.io',
      from_name: s.from_name || 'IT Service Desk',
    }));
  }

  async function saveSmtp(e) {
    e.preventDefault();
    setSmtpSaving(true);
    try {
      const body = {
        enabled: smtp.enabled,
        host: smtp.host,
        port: Number(smtp.port || 587),
        secure: Boolean(smtp.secure),
        username: smtp.username,
        from_name: smtp.from_name,
        from_email: smtp.from_email || smtp.username,
      };
      if (smtp.password) body.password = smtp.password;
      const res = await settingsApi.updateSmtp(body);
      setSmtp({
        ...EMPTY_SMTP,
        ...(res.data || {}),
        password: '',
      });
      showToast('Saved', 'SMTP settings saved in admin. Emails will use these credentials.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Failed to save SMTP settings', 'error');
    } finally {
      setSmtpSaving(false);
    }
  }

  async function testSmtp() {
    setSmtpTesting(true);
    try {
      const res = await settingsApi.testSmtp(testTo || smtp.from_email || smtp.username);
      showToast('Test sent', res.message || `Test email sent to ${testTo}`, 'success');
    } catch (err) {
      showToast('Test failed', err.message || 'Could not send test email', 'error');
    } finally {
      setSmtpTesting(false);
    }
  }

  if (!hasPermission('email_settings')) {
    return (
      <AppShell title="Email Settings" subtitle="SMTP, templates, and triggers.">
        <AccessDenied moduleName="Email Settings" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Email Settings" subtitle="Configure Microsoft / SMTP sender, templates, and triggers.">
      <div className="kb-categories-bar" style={{ marginBottom: 16 }}>
        <button type="button" className={`kb-pill ${tab === 'smtp' ? 'active' : ''}`} onClick={() => setTab('smtp')}>
          SMTP / Microsoft Mail
        </button>
        <button type="button" className={`kb-pill ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
          Email Templates
        </button>
        <button type="button" className={`kb-pill ${tab === 'triggers' ? 'active' : ''}`} onClick={() => setTab('triggers')}>
          Email Triggers
        </button>
      </div>

      {tab === 'smtp' ? (
        <div className="account-main-box">
          <div className="account-section-heading">
            <i className="fa-solid fa-server" /><span>Outgoing Email (SMTP)</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Configure the mailbox used to send password setup, reset, and notification emails.
            For Microsoft 365 use <strong>smtp.office365.com</strong> with your full work email
            (example: <code>Sajid.masood@integriti.io</code>). If MFA is enabled, use an
            <strong> App Password</strong> instead of your normal login password.
          </p>
          {smtpLoading ? (
            <DataLoader label="Loading SMTP settings..." />
          ) : (
            <form onSubmit={saveSmtp} autoComplete="off">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="remember-me" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(smtp.enabled)}
                    onChange={(e) => setSmtp((s) => ({ ...s, enabled: e.target.checked }))}
                  />
                  <span>Enable SMTP sending</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={applyMicrosoftPreset}>
                  <i className="fa-brands fa-microsoft" /><span>Microsoft 365 preset</span>
                </button>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>SMTP Host *</label>
                  <input
                    className="form-control"
                    required={smtp.enabled}
                    value={smtp.host}
                    onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))}
                    placeholder="smtp.office365.com"
                  />
                </div>
                <div className="form-group">
                  <label>Port *</label>
                  <input
                    className="form-control"
                    type="number"
                    required={smtp.enabled}
                    value={smtp.port}
                    onChange={(e) => setSmtp((s) => ({ ...s, port: e.target.value }))}
                    placeholder="587"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="remember-me" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(smtp.secure)}
                    onChange={(e) => setSmtp((s) => ({ ...s, secure: e.target.checked }))}
                  />
                  <span>Use SSL/TLS (secure=true). Leave off for Microsoft 365 port 587 (STARTTLS).</span>
                </label>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>SMTP Username (mailbox) *</label>
                  <input
                    className="form-control"
                    required={smtp.enabled}
                    value={smtp.username}
                    onChange={(e) => setSmtp((s) => ({ ...s, username: e.target.value }))}
                    placeholder="Sajid.masood@integriti.io"
                  />
                </div>
                <div className="form-group">
                  <label>SMTP Password {smtp.password_set ? '(saved — leave blank to keep)' : '*'}</label>
                  <input
                    className="form-control"
                    type="password"
                    required={smtp.enabled && !smtp.password_set}
                    value={smtp.password}
                    onChange={(e) => setSmtp((s) => ({ ...s, password: e.target.value }))}
                    placeholder={smtp.password_set ? '•••••••• (unchanged)' : 'Password or App Password'}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>From Name</label>
                  <input
                    className="form-control"
                    value={smtp.from_name}
                    onChange={(e) => setSmtp((s) => ({ ...s, from_name: e.target.value }))}
                    placeholder="IT Service Desk"
                  />
                </div>
                <div className="form-group">
                  <label>From Email *</label>
                  <input
                    className="form-control"
                    required={smtp.enabled}
                    value={smtp.from_email}
                    onChange={(e) => setSmtp((s) => ({ ...s, from_email: e.target.value }))}
                    placeholder="Sajid.masood@integriti.io"
                  />
                  <small style={{ color: 'var(--text-muted)' }}>
                    For Microsoft 365 this usually must match the authenticated mailbox.
                  </small>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={smtpSaving}>
                  <i className="fa-solid fa-floppy-disk" />
                  <span>{smtpSaving ? 'Saving…' : 'Save SMTP Settings'}</span>
                </button>
              </div>

              <hr style={{ borderColor: 'var(--border-color)', margin: '22px 0' }} />

              <div className="account-section-heading" style={{ marginBottom: 12 }}>
                <i className="fa-solid fa-paper-plane" /><span>Send test email</span>
              </div>
              <div className="form-grid-2" style={{ alignItems: 'end' }}>
                <div className="form-group">
                  <label>Recipient</label>
                  <input
                    className="form-control"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@integriti.io"
                  />
                </div>
                <div className="form-group">
                  <button type="button" className="btn btn-secondary" disabled={smtpTesting} onClick={testSmtp}>
                    <i className="fa-solid fa-vial" />
                    <span>{smtpTesting ? 'Sending…' : 'Send Test Email'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {tab === 'templates' ? (
        <>
          <div className="table-toolbar">
            <div className="toolbar-left"><h2>Email Notification Templates</h2></div>
            <div className="toolbar-controls-group">
              <div className="search-box">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                <i className="fa-solid fa-plus" /><span>+ Add Template</span>
              </button>
              <TableExportButtons
                filename="email-templates"
                title="Email Notification Templates"
                headers={exportPack.headers}
                rows={exportPack.rows}
              />
            </div>
          </div>

          <div className="table-container">
            <table className="helpdesk-table">
              <thead>
                <tr>
                  <th>Template ID</th>
                  <th>Template Name</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <DataLoader colSpan={6} label="Loading templates..." />
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState text="No email templates found." /></td></tr>
                ) : (
                  pageRows.map((t) => (
                    <tr key={pid(t)}>
                      <td><strong>#{pid(t)}</strong></td>
                      <td>{t.name}</td>
                      <td>{t.subject}</td>
                      <td><span className={statusBadgeClass(t.status)}>{t.status}</span></td>
                      <td>
                        {t.updated_at || t.updatedAt
                          ? new Date(t.updated_at || t.updatedAt).toLocaleString()
                          : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>
                          <i className="fa-solid fa-pen" />
                        </button>{' '}
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(pid(t))}>
                          <i className="fa-solid fa-trash" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
        </>
      ) : null}

      {tab === 'triggers' ? (
        <div className="account-main-box">
          <div className="account-section-heading">
            <i className="fa-solid fa-bolt" /><span>Automated Email Triggers</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TRIGGERS.map((tr) => (
              <div key={tr.title} className="notice-card-item">
                <div>
                  <strong>{tr.title}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr.desc}</div>
                </div>
                <span className="badge badge-approved">Enabled</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Modal
        open={open}
        title={editingId ? 'Edit Email Template' : 'Add Email Template'}
        icon="fa-envelope-open-text"
        onClose={() => setOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" form="emailTplForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save Template'}</span>
            </button>
          </>
        )}
      >
        <form id="emailTplForm" onSubmit={submit} autoComplete="off">
          <div className="form-grid-2">
            <div className="form-group">
              <label>Template Name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control form-control-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Subject *</label>
            <input className="form-control" required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Body *</label>
            <textarea className="form-control" rows={8} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Use {{name}}, {{ticket_id}}, etc." />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
