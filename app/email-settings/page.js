'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { emailTemplatesApi, settingsApi } from '../../services/api';

const PAGE_SIZE = 10;

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
  use_custom: false,
  event_key: '',
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
  const [previewBusy, setPreviewBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardData, setCardData] = useState(null);

  const [triggers, setTriggers] = useState([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [triggersSaving, setTriggersSaving] = useState(false);

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

  const loadTriggers = useCallback(async () => {
    setTriggersLoading(true);
    try {
      const res = await emailTemplatesApi.triggers();
      setTriggers(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load triggers', 'error');
    } finally {
      setTriggersLoading(false);
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

  useEffect(() => {
    if (!hasPermission('email_settings')) return;
    if (tab === 'triggers') loadTriggers();
  }, [hasPermission, tab, loadTriggers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) =>
      [pid(t), t.name, t.subject, t.status, t.event_key, t.event_name, t.event_category]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Event', 'Category', 'Name', 'Use Custom', 'Status', 'Subject'],
    rows: filtered.map((t) => [
      t.event_key || '',
      t.event_category || '',
      t.name || '',
      t.use_custom ? 'Yes' : 'No (system default)',
      t.status || '',
      t.subject || '',
    ]),
  }), [filtered]);

  const triggersByCategory = useMemo(() => {
    const map = {};
    for (const tr of triggers) {
      const cat = tr.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(tr);
    }
    return map;
  }, [triggers]);

  function openEdit(row) {
    setEditingId(pid(row));
    setForm({
      name: row.name || '',
      subject: row.subject || '',
      body: row.body || '',
      status: row.status || 'Active',
      use_custom: Boolean(row.use_custom),
      event_key: row.event_key || '',
      variables: row.variables || [],
      event_description: row.event_description || '',
      event_name: row.event_name || '',
    });
    setOpen(true);
  }

  function insertVariable(token) {
    const tag = `{{${token}}}`;
    setForm((f) => ({ ...f, body: `${f.body || ''}${f.body ? ' ' : ''}${tag}` }));
  }

  async function openEmailCard({ eventKey, mode, draft } = {}) {
    if (!eventKey) return;
    setCardBusy(true);
    setCardOpen(true);
    setCardData(null);
    try {
      const res = await emailTemplatesApi.previewCard(eventKey, mode, {
        ...(draft
          ? {
              subject: draft.subject,
              body: draft.body,
              name: draft.name,
            }
          : {}),
        full: true,
        mode,
      });
      setCardData(res.data || null);
    } catch (err) {
      showToast('Preview failed', err.message || 'Could not load email card', 'error');
      setCardOpen(false);
    } finally {
      setCardBusy(false);
    }
  }

  async function runPreview() {
    setPreviewBusy(true);
    try {
      await openEmailCard({
        eventKey: form.event_key,
        mode: 'custom',
        draft: {
          subject: form.subject,
          body: form.body,
          name: form.name,
        },
      });
    } finally {
      setPreviewBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await emailTemplatesApi.update(editingId, {
        name: form.name,
        subject: form.subject,
        body: form.body,
        status: form.status,
        use_custom: Boolean(form.use_custom),
      });
      showToast('Saved', form.use_custom ? 'Custom template enabled for this event.' : 'Template saved (system default still used until Use custom is on).', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    if (!editingId) return;
    if (!window.confirm('Restore system default subject/body and turn off Use custom?')) return;
    setSaving(true);
    try {
      const res = await emailTemplatesApi.resetDefaults(editingId);
      const row = res.data || {};
      setForm((f) => ({
        ...f,
        name: row.name || f.name,
        subject: row.subject || '',
        body: row.body || '',
        use_custom: false,
        status: row.status || 'Active',
      }));
      showToast('Reset', 'System default copy restored.', 'info');
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Reset failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveTriggers() {
    setTriggersSaving(true);
    try {
      const res = await emailTemplatesApi.updateTriggers(
        triggers.map((t) => ({ event_key: t.event_key, enabled: Boolean(t.enabled) }))
      );
      setTriggers(res.data || triggers);
      showToast('Saved', 'Email triggers updated. Disabled events skip SMTP (in-app notifications still work).', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Failed to save triggers', 'error');
    } finally {
      setTriggersSaving(false);
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
    <AppShell title="Email Settings" subtitle="Configure Microsoft / SMTP sender, event templates, and email triggers.">
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
            For Microsoft 365 use <strong>smtp.office365.com</strong> with your full work email.
            If MFA is enabled, use an <strong>App Password</strong>.
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
                  <input className="form-control" required={smtp.enabled} value={smtp.host} onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))} placeholder="smtp.office365.com" />
                </div>
                <div className="form-group">
                  <label>Port *</label>
                  <input className="form-control" type="number" required={smtp.enabled} value={smtp.port} onChange={(e) => setSmtp((s) => ({ ...s, port: e.target.value }))} placeholder="587" />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="remember-me" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={Boolean(smtp.secure)} onChange={(e) => setSmtp((s) => ({ ...s, secure: e.target.checked }))} />
                  <span>Use SSL/TLS (secure=true). Leave off for Microsoft 365 port 587 (STARTTLS).</span>
                </label>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>SMTP Username (mailbox) *</label>
                  <input className="form-control" required={smtp.enabled} value={smtp.username} onChange={(e) => setSmtp((s) => ({ ...s, username: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>SMTP Password {smtp.password_set ? '(saved — leave blank to keep)' : '*'}</label>
                  <input className="form-control" type="password" required={smtp.enabled && !smtp.password_set} value={smtp.password} onChange={(e) => setSmtp((s) => ({ ...s, password: e.target.value }))} placeholder={smtp.password_set ? '•••••••• (unchanged)' : 'Password or App Password'} />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>From Name</label>
                  <input className="form-control" value={smtp.from_name} onChange={(e) => setSmtp((s) => ({ ...s, from_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>From Email *</label>
                  <input className="form-control" required={smtp.enabled} value={smtp.from_email} onChange={(e) => setSmtp((s) => ({ ...s, from_email: e.target.value }))} />
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
                  <input className="form-control" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
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
            <div className="toolbar-left">
              <h2>Event Email Templates</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 720 }}>
                Each notification event has a template. Leave <strong>Use custom</strong> off to keep the rich system email.
                Turn it on to send your subject/body with <code>{'{{variables}}'}</code>. Detail tables still append when available.
              </p>
            </div>
            <div className="toolbar-controls-group">
              <div className="search-box">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  type="text"
                  placeholder="Search events / templates..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
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
                  <th>Event</th>
                  <th>Category</th>
                  <th>Mode</th>
                  <th>Email trigger</th>
                  <th>Email preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <DataLoader colSpan={6} label="Loading templates..." />
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState text="No event templates found. Restart the API to seed them." /></td></tr>
                ) : (
                  pageRows.map((t) => (
                    <tr key={pid(t)}>
                      <td>
                        <strong>{t.event_name || t.name}</strong>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.event_key}</div>
                      </td>
                      <td>{t.event_category || '—'}</td>
                      <td>
                        {t.use_custom ? (
                          <span className="badge badge-approved">Custom</span>
                        ) : (
                          <span className="badge badge-sla">System default</span>
                        )}
                      </td>
                      <td>
                        {t.trigger_enabled === false ? (
                          <span className="badge badge-rejected">Off</span>
                        ) : (
                          <span className="badge badge-approved">On</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ justifyContent: 'flex-start' }}
                            disabled={cardBusy}
                            onClick={() => openEmailCard({ eventKey: t.event_key, mode: 'system' })}
                            title="View the built-in system email card"
                          >
                            <i className="fa-solid fa-envelope-open" />
                            <span>System default</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ justifyContent: 'flex-start' }}
                            disabled={cardBusy}
                            onClick={() => openEmailCard({ eventKey: t.event_key, mode: 'outgoing' })}
                            title="View the email that is actually sent right now"
                          >
                            <i className="fa-solid fa-paper-plane" />
                            <span>{t.use_custom ? 'Outgoing (custom)' : 'Outgoing (system)'}</span>
                          </button>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>
                          <i className="fa-solid fa-pen" /><span> Edit</span>
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
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Turn events off to skip <strong>SMTP email</strong> for that action. In-app notifications still appear.
          </p>
          {triggersLoading ? (
            <DataLoader label="Loading triggers..." />
          ) : (
            <>
              {Object.entries(triggersByCategory).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{cat}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((tr) => (
                      <div key={tr.event_key} className="notice-card-item" style={{ alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{tr.name}</strong>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}><code>{tr.event_key}</code></div>
                        </div>
                        <label className="remember-me" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(tr.enabled)}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setTriggers((list) =>
                                list.map((x) => (x.event_key === tr.event_key ? { ...x, enabled: on } : x))
                              );
                            }}
                          />
                          <span>{tr.enabled ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-primary" disabled={triggersSaving} onClick={saveTriggers}>
                <i className="fa-solid fa-floppy-disk" />
                <span>{triggersSaving ? 'Saving…' : 'Save Triggers'}</span>
              </button>
            </>
          )}
        </div>
      ) : null}

      <Modal
        open={open}
        title={form.event_name ? `Edit: ${form.event_name}` : 'Edit Email Template'}
        icon="fa-envelope-open-text"
        onClose={() => setOpen(false)}
        maxWidth={720}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={resetDefaults}>
              Reset to system default
            </button>
            <button type="submit" form="emailTplForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /><span>{saving ? 'Saving...' : 'Save Template'}</span>
            </button>
          </>
        )}
      >
        <form id="emailTplForm" onSubmit={submit} autoComplete="off">
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {form.event_description || 'Customize subject and body for this notification event.'}
            {' '}Event: <code>{form.event_key}</code>
          </p>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="remember-me" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={Boolean(form.use_custom)}
                onChange={(e) => setForm((f) => ({ ...f, use_custom: e.target.checked }))}
              />
              <span>Use custom template for this event (otherwise system rich email is sent)</span>
            </label>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Display name *</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Template status</label>
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
            <textarea
              className="form-control"
              rows={8}
              required
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Hello {{requesterName}}, ticket {{ticketId}} ..."
            />
          </div>

          {(form.variables || []).length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Insert variable</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {form.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ height: 26, fontSize: 11, padding: '0 8px' }}
                    onClick={() => insertVariable(v)}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={previewBusy || cardBusy} onClick={runPreview}>
              <i className="fa-solid fa-eye" />
              <span>{previewBusy || cardBusy ? 'Rendering…' : 'Preview custom email card'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={cardBusy}
              onClick={() => openEmailCard({ eventKey: form.event_key, mode: 'system' })}
            >
              <i className="fa-solid fa-envelope-open" />
              <span>View system default card</span>
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Preview opens the full branded email card (same layout recipients receive), including header color from Settings and the details table.
          </p>
        </form>
      </Modal>

      <Modal
        open={cardOpen}
        title={cardData?.source_label || 'Email card preview'}
        icon="fa-envelope"
        onClose={() => {
          if (cardBusy) return;
          setCardOpen(false);
          setCardData(null);
        }}
        maxWidth={680}
        footer={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setCardOpen(false);
              setCardData(null);
            }}
          >
            Close
          </button>
        )}
      >
        {cardBusy || !cardData ? (
          <div style={{ padding: '24px 8px', textAlign: 'center' }}>
            <i className="fa-solid fa-spinner fa-spin" /> Loading email card…
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
              <div><strong>Subject:</strong> {cardData.subject}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                Event: <code>{cardData.event_key}</code>
                {cardData.use_custom_active ? ' · Custom template is active for sending' : ' · System default is used for sending'}
              </div>
            </div>
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#f1f5f9',
              }}
            >
              <iframe
                title="Email card preview"
                srcDoc={cardData.html || ''}
                style={{
                  width: '100%',
                  height: 560,
                  border: 0,
                  display: 'block',
                  background: '#f1f5f9',
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
