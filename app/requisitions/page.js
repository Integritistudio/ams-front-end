'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { requisitionsApi, catalogApi, usersApi, departmentsApi } from '../../services/api';

const PAGE_SIZE = 10;

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

const emptyForm = {
  type: 'Hardware',
  item: '',
  other_item: '',
  project: '',
  urgency: 'Standard',
  justification: '',
  department: '',
  approver_id: '',
};

export default function RequisitionsPage() {
  return (
    <Suspense fallback={<DataLoader label="Loading requisitions..." />}>
      <RequisitionsPageInner />
    </Suspense>
  );
}

function RequisitionsPageInner() {
  const { hasPermission, canViewAll, user } = useAuth();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [catalog, setCatalog] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await requisitionsApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load requisitions', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('requisitions')) return;
    load();
    usersApi.directory().then((res) => setApprovers(res.data || [])).catch(() => {});
    departmentsApi.list().then((res) => {
      const list = (res.data || []).map((d) => d.name || d).filter(Boolean);
      setDepartments(list);
    }).catch(() => {});
  }, [hasPermission, load]);

  useEffect(() => {
    if (searchParams.get('create') === '1' && hasPermission('requisitions')) {
      setForm({ ...emptyForm, department: user?.department || '' });
      setCreateOpen(true);
      router.replace('/requisitions');
    }
  }, [searchParams, hasPermission, user, router]);

  useEffect(() => {
    if (!createOpen) return;
    catalogApi.list(form.type).then((res) => {
      const items = res.data || [];
      setCatalog(items);
      if (items.length && !form.item) {
        setForm((f) => ({ ...f, item: items[0].name || items[0] }));
      }
    }).catch(() => setCatalog([]));
  }, [createOpen, form.type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const status = r.status || '';
      if (!canViewAll('requisitions') && status === 'Pending Manager Approval') {
        /* still show own pending if requester */
      }
      if (statusFilter !== 'All' && status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        pid(r),
        r.item,
        r.requester_name || r.requesterName,
        r.project,
        r.type,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, canViewAll]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => (r.status || '').toLowerCase().includes('pending')).length;
    const approved = filtered.filter((r) => {
      const s = (r.status || '').toLowerCase();
      return s.includes('approved') || s.includes('fulfilled') || s.includes('procurement');
    }).length;
    const rejected = filtered.filter((r) => (r.status || '').toLowerCase().includes('reject')).length;
    return { total, pending, approved, rejected };
  }, [filtered]);

  async function submitCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let item = form.item;
      if (String(item).toLowerCase().includes('other')) {
        item = form.other_item.trim() || item;
      }
      const approver = approvers.find((u) => String(u.id) === String(form.approver_id));
      await requisitionsApi.create({
        type: form.type,
        item,
        project: form.project,
        urgency: form.urgency,
        justification: form.justification,
        department: form.department || user?.department,
        approver_id: Number(form.approver_id),
        approver_name: approver?.name,
        requester_name: user?.name,
        requester_email: user?.email,
      });
      showToast('Submitted', 'Asset requisition forwarded to approver.', 'success');
      setCreateOpen(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not submit request', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id) {
    try {
      const res = await requisitionsApi.get(id);
      setDetail(res.data);
      setReplyText('');
      setDetailOpen(true);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load requisition', 'error');
    }
  }

  async function postReply() {
    if (!detail || !replyText.trim()) return;
    try {
      await requisitionsApi.reply(pid(detail), replyText.trim());
      setReplyText('');
      showToast('Reply Posted', 'Reply added to requisition thread.', 'success');
      await openDetail(pid(detail));
    } catch (err) {
      showToast('Error', err.message || 'Reply failed', 'error');
    }
  }

  if (!hasPermission('requisitions')) {
    return (
      <AppShell title="New Asset Request" subtitle="Hardware & software requisitions.">
        <AccessDenied moduleName="Asset Requisitions" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="New Asset Requests"
      subtitle="Hardware & software requisitions with manager approval."
      actions={(
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setForm({ ...emptyForm, department: user?.department || '' });
            setCreateOpen(true);
          }}
        >
          <i className="fa-solid fa-plus" /><span>New Asset Request</span>
        </button>
      )}
    >
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info"><h3>Total Requisitions</h3><div className="counter">{kpis.total}</div></div>
          <div className="metric-icon icon-total"><i className="fa-solid fa-cart-flatbed" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info"><h3>Pending Approval</h3><div className="counter">{kpis.pending}</div></div>
          <div className="metric-icon icon-progress"><i className="fa-solid fa-hourglass-half" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info"><h3>Approved / Fulfilled</h3><div className="counter">{kpis.approved}</div></div>
          <div className="metric-icon icon-resolved"><i className="fa-solid fa-circle-check" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info"><h3>Rejected</h3><div className="counter">{kpis.rejected}</div></div>
          <div className="metric-icon icon-urgent"><i className="fa-solid fa-ban" /></div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Asset Requisitions</h2></div>
        <div className="toolbar-controls-group">
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search by ID, item, requester..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="filter-box">
            <select
              className="form-control form-control-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="All">All Statuses</option>
              <option value="Pending Manager Approval">Pending Approval</option>
              <option value="Approved - Sent to IT">Approved - Sent to IT</option>
              <option value="In Procurement">In Procurement</option>
              <option value="Fulfilled">Fulfilled</option>
              <option value="Rejected">Rejected</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Requester</th>
              <th>Type</th>
              <th>Item</th>
              <th>Urgency</th>
              <th>Approver</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={8} label="Loading requisitions..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8}><EmptyState text="No asset requisitions found." /></td></tr>
            ) : (
              pageRows.map((r) => (
                <tr key={pid(r)}>
                  <td><strong>#{pid(r)}</strong></td>
                  <td>
                    {r.requester_name || r.requesterName}
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.department}</span>
                  </td>
                  <td>{r.type}</td>
                  <td>{r.item}</td>
                  <td>{r.urgency}</td>
                  <td>{r.approver_name || r.approverName}</td>
                  <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(pid(r))}>
                      <i className="fa-solid fa-eye" /><span>Details</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />

      <Modal
        open={createOpen}
        title="New Asset Requisition"
        icon="fa-cart-flatbed"
        onClose={() => setCreateOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" form="newReqForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-paper-plane" /><span>{saving ? 'Submitting...' : 'Submit Request'}</span>
            </button>
          </>
        )}
      >
        <form id="newReqForm" onSubmit={submitCreate} autoComplete="off">
          <div className="form-group">
            <label>Asset Type *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['Hardware', 'Software'].map((t) => (
                <label
                  key={t}
                  className={`radio-pill ${form.type === t ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="reqAssetType"
                    value={t}
                    checked={form.type === t}
                    onChange={() => setForm((f) => ({ ...f, type: t, item: '' }))}
                    style={{ display: 'none' }}
                  />
                  <i className={`fa-solid ${t === 'Hardware' ? 'fa-laptop' : 'fa-code'}`} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Catalog Item *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.item}
                onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
              >
                <option value="">Select item</option>
                {catalog.map((c) => {
                  const name = c.name || c;
                  return <option key={name} value={name}>{name}</option>;
                })}
                <option value="Other Item (Specify Below)">Other Item (Specify Below)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Urgency *</label>
              <select
                className="form-control form-control-select"
                value={form.urgency}
                onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}
              >
                <option value="Standard">Standard</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>
          {String(form.item).toLowerCase().includes('other') ? (
            <div className="form-group">
              <label>Specify Item *</label>
              <input
                className="form-control"
                required
                value={form.other_item}
                onChange={(e) => setForm((f) => ({ ...f, other_item: e.target.value }))}
              />
            </div>
          ) : null}
          <div className="form-grid-2">
            <div className="form-group">
              <label>Department</label>
              <select
                className="form-control form-control-select"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              >
                <option value="">{user?.department || 'Select Department'}</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Approver *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.approver_id}
                onChange={(e) => setForm((f) => ({ ...f, approver_id: e.target.value }))}
              >
                <option value="">Select Approver</option>
                {approvers
                  .filter((u) => u.status === 'Active' && Number(u.id) !== Number(user?.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Project / Cost Center</label>
            <input
              className="form-control"
              value={form.project}
              onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
              placeholder="Optional project name"
            />
          </div>
          <div className="form-group">
            <label>Business Justification *</label>
            <textarea
              className="form-control"
              required
              value={form.justification}
              onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
              placeholder="Why is this asset required?"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={detailOpen}
        title={`Requisition — #${detail ? pid(detail) : ''}`}
        icon="fa-cart-flatbed"
        onClose={() => setDetailOpen(false)}
        maxWidth={680}
        footer={<button type="button" className="btn btn-secondary" onClick={() => setDetailOpen(false)}>Close</button>}
      >
        {detail ? (
          <>
            <div className="ticket-status-banner">
              <div><strong>Status:</strong> <span className={statusBadgeClass(detail.status)}>{detail.status}</span></div>
              <div><strong>Approver:</strong> {detail.approver_name || detail.approverName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, width: '100%', marginTop: 4 }}>
                Created: {detail.created_timestamp || detail.createdTimestamp
                  ? new Date(detail.created_timestamp || detail.createdTimestamp).toLocaleString()
                  : '—'}
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label>Requester</label><input className="form-control" disabled value={detail.requester_name || ''} /></div>
              <div className="form-group"><label>Department</label><input className="form-control" disabled value={detail.department || ''} /></div>
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label>Type</label><input className="form-control" disabled value={detail.type || ''} /></div>
              <div className="form-group"><label>Item</label><input className="form-control" disabled value={detail.item || ''} /></div>
            </div>
            <div className="form-group"><label>Justification</label><textarea className="form-control" disabled value={detail.justification || ''} /></div>
            <div className="ticket-thread-section">
              <h4 className="thread-heading"><i className="fa-solid fa-comments" /> Discussion Thread</h4>
              <div className="timeline-thread-box">
                {(detail.replies || []).length === 0 ? (
                  <div className="empty-state" style={{ padding: 16 }}>No replies yet.</div>
                ) : (
                  (detail.replies || []).map((r) => (
                    <div key={r.id || r.created_at} className="thread-msg">
                      <div className="thread-msg-header">
                        <strong>{r.author_name || r.authorName || 'User'}</strong>
                        <span>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="thread-msg-body">{r.text || r.message}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="reply-input-wrapper">
                <textarea className="form-control" rows={2} placeholder="Write reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                <button type="button" className="btn btn-primary btn-sm" onClick={postReply}>
                  <i className="fa-solid fa-reply" /><span>Post Reply</span>
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </AppShell>
  );
}
