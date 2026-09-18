'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { emailTemplatesApi } from '../../services/api';

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
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('templates');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!hasPermission('email_settings')) return;
    load();
  }, [hasPermission, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) =>
      [pid(t), t.name, t.subject, t.status].join(' ').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  if (!hasPermission('email_settings')) {
    return (
      <AppShell title="Email Settings" subtitle="Notification templates and triggers.">
        <AccessDenied moduleName="Email Settings" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Email Settings" subtitle="Notification templates and automated triggers.">
      <div className="kb-categories-bar" style={{ marginBottom: 16 }}>
        <button type="button" className={`kb-pill ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
          Email Templates
        </button>
        <button type="button" className={`kb-pill ${tab === 'triggers' ? 'active' : ''}`} onClick={() => setTab('triggers')}>
          Email Triggers
        </button>
      </div>

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
      ) : (
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
      )}

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
