'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import DateRangeFilter from '../../components/DateRangeFilter';
import InventorySourceBadge from '../../components/InventorySourceBadge';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { requisitionsApi, catalogApi, usersApi, uploadsApi, aiApi } from '../../services/api';
import UserAvatar from '../../components/UserAvatar';
import { useAvatarDirectory } from '../../hooks/useAvatarDirectory';
import { emptyDateRange, rowInDateRange } from '../../lib/dateRange';
import { inventorySourceLabel } from '../../lib/inventorySource';

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
  behalf_name: '',
  requester_name: '',
  requester_email: '',
};

const PENDING_STATUSES = [
  'Pending Line Manager Approval',
  'Pending Manager Approval',
  'Pending IT Pricing',
  'Pending Finance Approval',
  'Pending HR Approval',
  'Pending GM Approval',
  'Pending Executive Approval',
];

const IT_QUEUE_STATUSES = [
  'Approved - Sent to IT',
  'In Progress',
  'In Procurement',
  'On Hold',
];

export default function RequisitionsPage() {
  return (
    <Suspense fallback={<DataLoader label="Loading requisitions..." />}>
      <RequisitionsPageInner />
    </Suspense>
  );
}

function RequisitionsPageInner() {
  const { hasPermission, canViewAll, user, role } = useAuth();
  const { avatarFor } = useAvatarDirectory();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isElevated =
    Boolean(role?.is_it_admin) ||
    Boolean(role?.is_executive) ||
    Boolean(role?.is_hr_manager) ||
    Boolean(role?.is_finance_manager) ||
    Boolean(role?.is_gm) ||
    Boolean(user?.is_super_admin);
  const isItAdmin = Boolean(role?.is_it_admin);
  const isExecutiveViewer = Boolean(role?.is_executive);
  const canSeeInventoryFlag = isElevated;
  const hideItQueueOnAssetRequests =
    isItAdmin ||
    (!isExecutiveViewer &&
      !Boolean(role?.is_hr_manager) &&
      !Boolean(role?.is_finance_manager) &&
      !Boolean(role?.is_gm));
  const isItOverride = canViewAll('requisitions') || Boolean(role?.is_it_admin);
  const isExecutiveCreator =
    isExecutiveViewer && !Boolean(role?.is_it_admin);

  const lineManagerLabel = user?.manager || 'your Line Manager';

  function isExecutivePriority(r) {
    if (!r) return false;
    if (r.requester_is_executive === true || r.requesterIsExecutive === true) return true;
    const hist = String(r.decision_history || r.decisionHistory || '');
    return hist.includes('EXECUTIVE_PRIORITY');
  }

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [mineOnly, setMineOnly] = useState(false);
  const [dateRange, setDateRange] = useState(emptyDateRange);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [catalog, setCatalog] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [attachFile, setAttachFile] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
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
  }, [hasPermission, load]);

  useEffect(() => {
    if (searchParams.get('create') === '1' && hasPermission('requisitions')) {
      openCreateModal();
      router.replace('/requisitions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function applyBehalf(nameVal) {
    const found = directory.find((u) => (u.name || '').toLowerCase() === nameVal.trim().toLowerCase());
    if (found) {
      setForm((f) => ({
        ...f,
        behalf_name: nameVal,
        requester_name: found.name,
        requester_email: found.email,
        department: found.department || f.department,
      }));
    } else {
      setForm((f) => ({
        ...f,
        behalf_name: nameVal,
        requester_name: user?.name || '',
        requester_email: user?.email || '',
        department: user?.department || '',
      }));
    }
  }

  async function improveJustification() {
    const draft = (form.justification || '').trim();
    if (!draft) {
      showToast('Draft needed', 'Please write a draft first.', 'warning');
      return;
    }
    setAiBusy(true);
    try {
      const res = await aiApi.improve(draft, 'justification');
      setForm((f) => ({ ...f, justification: res.data?.text || draft }));
      showToast('Improved', res.message || 'Text improved.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'AI improve failed', 'error');
    } finally {
      setAiBusy(false);
    }
  }

  async function openCreateModal() {
    setAttachFile(null);
    setForm({
      ...emptyForm,
      department: user?.department || '',
      requester_name: user?.name || '',
      requester_email: user?.email || '',
    });
    setCreateOpen(true);
    try {
      if (isItOverride) {
        const dirRes = await usersApi.directory();
        setDirectory((dirRes.data || []).filter((u) => (u.status || 'Active') === 'Active'));
      } else {
        setDirectory([]);
      }
    } catch (_e) {
      setDirectory([]);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const myEmail = (user?.email || '').toLowerCase();
    return rows.filter((r) => {
      const status = r.status || '';
      const isPending = PENDING_STATUSES.includes(status)
        || status.toLowerCase().includes('pending');
      if (isPending && !isExecutiveViewer) return false;
      if (hideItQueueOnAssetRequests && IT_QUEUE_STATUSES.includes(status)) return false;

      const requesterEmail = (r.requester_email || r.requesterEmail || '').toLowerCase();
      if (mineOnly && myEmail && requesterEmail !== myEmail) return false;
      if (statusFilter !== 'All' && status !== statusFilter) return false;
      if (!rowInDateRange(r, dateRange)) return false;
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
  }, [rows, search, statusFilter, dateRange, mineOnly, user?.email, hideItQueueOnAssetRequests, isExecutiveViewer]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: canSeeInventoryFlag
      ? ['Request ID', 'Requester', 'Department', 'Type', 'Item', 'Urgency', 'Line Manager', 'Status', 'Stock', 'Project']
      : ['Request ID', 'Requester', 'Department', 'Type', 'Item', 'Urgency', 'Line Manager', 'Status', 'Project'],
    rows: filtered.map((r) => {
      const base = [
        pid(r),
        r.requester_name || r.requesterName || '',
        r.department || '',
        r.type || '',
        r.item || '',
        r.urgency || '',
        r.line_manager_name || r.lineManagerName || r.approver_name || r.approverName || '',
        r.status || '',
      ];
      if (canSeeInventoryFlag) base.push(inventorySourceLabel(r));
      base.push(r.project || '');
      return base;
    }),
  }), [filtered, canSeeInventoryFlag]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const inProgress = filtered.filter((r) => {
      const s = (r.status || '').toLowerCase();
      return s.includes('approved') || s.includes('progress') || s.includes('procurement') || s.includes('hold');
    }).length;
    const fulfilled = filtered.filter((r) => {
      const s = (r.status || '').toLowerCase();
      return s.includes('fulfilled') || s.includes('completed');
    }).length;
    const rejected = filtered.filter((r) => (r.status || '').toLowerCase().includes('reject')).length;
    return { total, pending: inProgress, approved: fulfilled, rejected };
  }, [filtered]);

  async function submitCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let item = form.item;
      if (String(item).toLowerCase().includes('other')) {
        item = form.other_item.trim() || item;
      }
      if (!form.project?.trim()) {
        showToast('Required', 'Project Reference is required.', 'warning');
        setSaving(false);
        return;
      }
      let attachment_url = null;
      if (attachFile) {
        const up = await uploadsApi.upload(attachFile);
        attachment_url = up.data?.url || null;
      }
      await requisitionsApi.create({
        type: form.type,
        item,
        project: form.project.trim(),
        urgency: form.urgency,
        justification: form.justification,
        department: form.department || user?.department,
        requester_name: form.requester_name || user?.name,
        requester_email: form.requester_email || user?.email,
        attachment_url,
        on_behalf: Boolean(form.behalf_name?.trim()),
      });
      showToast(
        'Submitted',
        isExecutiveCreator
          ? 'Executive Priority request auto-approved and sent to IT Admin.'
          : `Request sent to ${lineManagerLabel} for Line Manager approval.`,
        'success'
      );
      setCreateOpen(false);
      setForm(emptyForm);
      setAttachFile(null);
      router.push('/approvals');
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
      <AppShell title="Asset Requests" subtitle="Hardware & software requisitions.">
        <AccessDenied moduleName="Asset Requests" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Asset Requests"
      subtitle={
        isExecutiveViewer
          ? 'Organisation-wide view of all asset requests and statuses. Stage approvals stay under Pending Approvals.'
          : 'Completed and rejected asset requisitions. Requests still awaiting approval or IT action stay under Pending Approvals.'
      }
      actions={(
        <button type="button" className="btn btn-primary" onClick={() => openCreateModal()}>
          <i className="fa-solid fa-plus" /><span>New Request</span>
        </button>
      )}
    >
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info"><h3>Total Requisitions</h3><div className="counter">{kpis.total}</div></div>
          <div className="metric-icon icon-total"><i className="fa-solid fa-cart-flatbed" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info"><h3>In Progress (IT)</h3><div className="counter">{kpis.pending}</div></div>
          <div className="metric-icon icon-progress"><i className="fa-solid fa-gears" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info"><h3>Completed</h3><div className="counter">{kpis.approved}</div></div>
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
          {isElevated ? (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                margin: 0,
                fontSize: 13,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }}
              />
              My Asset Requests
            </label>
          ) : null}
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
              {isExecutiveViewer ? (
                <>
                  <option value="Pending Line Manager Approval">Pending Line Manager Approval</option>
                  <option value="Pending IT Pricing">Pending IT Pricing</option>
                  <option value="Pending Finance Approval">Pending Finance Approval</option>
                  <option value="Pending HR Approval">Pending HR Approval</option>
                  <option value="Pending GM Approval">Pending GM Approval</option>
                  <option value="Pending Executive Approval">Pending Executive Approval</option>
                </>
              ) : null}
              {!hideItQueueOnAssetRequests ? (
                <>
                  <option value="Approved - Sent to IT">Approved - Sent to IT</option>
                  <option value="In Progress">In Progress</option>
                  <option value="In Procurement">In Procurement</option>
                  <option value="On Hold">On Hold</option>
                </>
              ) : null}
              <option value="Completed">Completed</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <DateRangeFilter
            value={dateRange}
            onChange={(next) => { setDateRange(next); setPage(1); }}
          />
          <TableExportButtons
            filename="asset-requests"
            title="Asset Requests"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
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
              <th>Line Manager</th>
              <th>Status</th>
              {canSeeInventoryFlag ? <th>Stock</th> : null}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={canSeeInventoryFlag ? 9 : 8} label="Loading requisitions..." />
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={canSeeInventoryFlag ? 9 : 8}>
                  <EmptyState
                    text={
                      isExecutiveViewer
                        ? 'No asset requests found.'
                        : 'No approved asset requests yet. Pending items are under Pending Approvals.'
                    }
                  />
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={pid(r)}>
                  <td><strong>#{pid(r)}</strong></td>
                  <td>
                    <UserAvatar
                      name={r.requester_name || r.requesterName}
                      src={avatarFor({
                        email: r.requester_email || r.requesterEmail,
                        name: r.requester_name || r.requesterName,
                      })}
                      size="table"
                      sub={r.department}
                    />
                  </td>
                  <td>{r.type}</td>
                  <td>{r.item}</td>
                  <td>{r.urgency}</td>
                  <td>{r.line_manager_name || r.lineManagerName || r.approver_name || r.approverName || '—'}</td>
                  <td>
                    <span className={statusBadgeClass(r.status)}>{r.status}</span>
                    {isExecutivePriority(r) ? (
                      <>
                        {' '}
                        <span className="badge badge-sla-warning" title="Executive Priority — auto-approved to IT">
                          Executive Priority
                        </span>
                      </>
                    ) : null}
                  </td>
                  {canSeeInventoryFlag ? (
                    <td><InventorySourceBadge row={r} compact /></td>
                  ) : null}
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
        title="New Asset Requisition Form"
        icon="fa-cart-plus"
        onClose={() => setCreateOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" form="newReqForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-paper-plane" /><span>{saving ? 'Submitting...' : 'Submit Requisition'}</span>
            </button>
          </>
        )}
      >
        <form id="newReqForm" onSubmit={submitCreate} autoComplete="off">
          {isItOverride ? (
            <div
              className="form-group"
              style={{
                background: 'rgba(37,99,235,0.06)',
                border: '1px solid rgba(37,99,235,0.2)',
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <label style={{ color: 'var(--primary)', fontWeight: 700, marginBottom: 6 }}>
                <i className="fa-solid fa-user-gear" /> Request Asset on Behalf of Employee (IT Support Override)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Search and select employee name (leave blank if for yourself)..."
                list="behalfRequestEmployeeList"
                value={form.behalf_name}
                onChange={(e) => applyBehalf(e.target.value)}
              />
              <datalist id="behalfRequestEmployeeList">
                {directory.map((u) => (
                  <option key={u.id || u.email} value={u.name}>{u.email}</option>
                ))}
              </datalist>
            </div>
          ) : null}

          <div className="form-grid-2">
            <div className="form-group">
              <label>Requester Name</label>
              <input className="form-control" readOnly value={form.requester_name || user?.name || ''} />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input className="form-control" readOnly value={form.department || user?.department || ''} />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Approval Routing</label>
              {isExecutiveCreator ? (
                <input className="form-control" readOnly value="Auto-approved → Sent to IT Admin" />
              ) : (
                <input
                  className="form-control"
                  readOnly
                  value={
                    user?.manager_id || user?.manager
                      ? `Will be sent to your Line Manager (${lineManagerLabel})`
                      : 'Will be sent to your Line Manager'
                  }
                />
              )}
            </div>
            <div className="form-group">
              <label>Urgency / Timeline *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.urgency}
                onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}
              >
                <option value="Standard">Standard (5 days)</option>
                <option value="Urgent">Urgent (2 days)</option>
              </select>
            </div>
          </div>

          {isExecutiveCreator ? (
            <p style={{ margin: '-6px 0 14px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: 6, color: 'var(--warning)' }} />
              Executive Priority: Line Manager approval is skipped. This request goes directly to IT Admin.
            </p>
          ) : !user?.manager_id && !user?.manager ? (
            <p style={{ margin: '-6px 0 14px', fontSize: 12.5, color: 'var(--warning)', lineHeight: 1.45 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
              No Line Manager is assigned on your profile. Ask an admin to set your manager before submitting.
            </p>
          ) : (
            <p style={{ margin: '-6px 0 14px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />
              Starts as <strong>Pending Line Manager Approval</strong>, then IT pricing and Finance / HR / GM / Executive as needed.
            </p>
          )}

          <div className="sla-live-preview-box">
            <i className="fa-solid fa-truck-ramp-box" />
            <div>
              <strong>Target Procurement SLA:</strong>{' '}
              <span>
                {form.urgency === 'Urgent'
                  ? 'Urgent Request: Project blocker timeline — IT purchasing & handover commitment within 2 Working Days (48 Hours) after approval.'
                  : 'Standard Request: Standard equipment provisioning — IT sourcing & handover commitment within 5 Working Days (120 Hours) after approval.'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label>Requisition Category Type *</label>
            <div className="radio-type-selector">
              {['Hardware', 'Software'].map((t) => (
                <label key={t} className={`radio-pill ${form.type === t ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="reqAssetType"
                    value={t}
                    checked={form.type === t}
                    onChange={() => setForm((f) => ({ ...f, type: t, item: '', other_item: '' }))}
                  />
                  <i className={`fa-solid ${t === 'Hardware' ? 'fa-laptop' : 'fa-code'}`} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Requested Item *</label>
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

          {String(form.item).toLowerCase().includes('other') ? (
            <div className="form-group">
              <label>Specify Custom Item *</label>
              <input
                className="form-control"
                required
                value={form.other_item}
                onChange={(e) => setForm((f) => ({ ...f, other_item: e.target.value }))}
              />
            </div>
          ) : null}

          <div className="form-group">
            <label>Project Reference *</label>
            <input
              className="form-control"
              required
              value={form.project}
              onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
              placeholder="Project / cost center reference"
            />
          </div>

          <div className="form-group">
            <div className="label-with-ai">
              <label>Business Justification *</label>
              <button type="button" className="btn-ai" disabled={aiBusy} onClick={improveJustification}>
                <i className={`fa-solid ${aiBusy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} />
                <span>{aiBusy ? 'Improving...' : 'Improve with AI'}</span>
              </button>
            </div>
            <textarea
              className="form-control"
              required
              value={form.justification}
              onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
              placeholder="Why is this asset required?"
            />
          </div>

          <div className="form-group">
            <label>Attachment (Optional)</label>
            <input
              type="file"
              className="form-control file-input"
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={(e) => setAttachFile(e.target.files?.[0] || null)}
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
        footer={(
          <button type="button" className="btn btn-secondary" onClick={() => setDetailOpen(false)}>Close</button>
        )}
      >
        {detail ? (
          <>
            <div className="ticket-status-banner">
              <div>
                <strong>Status:</strong> <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
                {isExecutivePriority(detail) ? (
                  <>
                    {' '}
                    <span className="badge badge-sla-warning">Executive Priority</span>
                  </>
                ) : null}
              </div>
              <div>
                <strong>Line Manager:</strong>{' '}
                {detail.line_manager_name || detail.lineManagerName || detail.approver_name || detail.approverName || '—'}
              </div>
              {canSeeInventoryFlag ? (
                <div>
                  <strong>Stock:</strong>{' '}
                  <InventorySourceBadge row={detail} />
                </div>
              ) : null}
              <div style={{ color: 'var(--text-muted)', fontSize: 12, width: '100%', marginTop: 4 }}>
                Created: {detail.created_timestamp || detail.createdTimestamp
                  ? new Date(detail.created_timestamp || detail.createdTimestamp).toLocaleString()
                  : '—'}
              </div>
            </div>
            {canSeeInventoryFlag ? (
              <div
                className="hold-notice-box"
                style={{
                  background:
                    detail.inventory_available === true || detail.inventoryAvailable === true
                      ? 'rgba(16,185,129,0.1)'
                      : detail.inventory_available === false || detail.inventoryAvailable === false
                        ? 'rgba(239,68,68,0.08)'
                        : 'rgba(148,163,184,0.1)',
                  borderColor:
                    detail.inventory_available === true || detail.inventoryAvailable === true
                      ? 'rgba(16,185,129,0.35)'
                      : detail.inventory_available === false || detail.inventoryAvailable === false
                        ? 'rgba(239,68,68,0.35)'
                        : 'var(--border-color)',
                }}
              >
                <i
                  className={`fa-solid ${
                    detail.inventory_available === true || detail.inventoryAvailable === true
                      ? 'fa-boxes-stacked'
                      : detail.inventory_available === false || detail.inventoryAvailable === false
                        ? 'fa-cart-shopping'
                        : 'fa-clock'
                  }`}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <strong>Fulfillment source:</strong>
                  <div style={{ marginTop: 2 }}>
                    {detail.inventory_available === true || detail.inventoryAvailable === true
                      ? 'Available in Inventory — prefer assigning from stock.'
                      : detail.inventory_available === false || detail.inventoryAvailable === false
                        ? 'Need Purchase — item not in stock; pricing / procurement path applies.'
                        : 'Inventory check pending — set after Line Manager approval.'}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="form-grid-2">
              <div className="form-group"><label>Requester</label><input className="form-control" disabled value={detail.requester_name || ''} /></div>
              <div className="form-group"><label>Department</label><input className="form-control" disabled value={detail.department || ''} /></div>
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label>Type</label><input className="form-control" disabled value={detail.type || ''} /></div>
              <div className="form-group"><label>Item</label><input className="form-control" disabled value={detail.item || ''} /></div>
            </div>
            <div className="form-group"><label>Justification</label><textarea className="form-control" disabled value={detail.justification || ''} /></div>
            {detail.attachment_url ? (
              <div className="form-group">
                <label>Attachment</label>
                <div className="attachment-display-card">
                  <i className="fa-solid fa-paperclip" style={{ color: 'var(--primary)' }} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        await uploadsApi.open(detail.attachment_url);
                      } catch (err) {
                        showToast('Error', err.message || 'Could not open file', 'error');
                      }
                    }}
                  >
                    View File
                  </button>
                </div>
              </div>
            ) : null}
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
