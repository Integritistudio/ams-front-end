'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import DateRangeFilter from '../../components/DateRangeFilter';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ticketsApi, departmentsApi, usersApi, uploadsApi, aiApi } from '../../services/api';
import UserAvatar from '../../components/UserAvatar';
import { useAvatarDirectory } from '../../hooks/useAvatarDirectory';
import { emptyDateRange, rowInDateRange } from '../../lib/dateRange';

const PAGE_SIZE = 10;
const CATEGORIES = [
  { value: 'Microsoft 365', label: 'Microsoft 365 / Outlook / Teams' },
  { value: 'Network / VPN', label: 'Network / Fortinet VPN / Wi-Fi' },
  { value: 'Hardware', label: 'Hardware / PC / Monitor / Peripheral' },
  { value: 'Software / OS', label: 'Software / Windows / macOS Issue' },
  { value: 'User Account', label: 'Access / Credentials / Password Reset' },
  { value: 'Other', label: 'Other (Specify Below)' },
];
const DEFAULT_DEPTS = [
  'Executive Board',
  'Management',
  'Operations',
  'Human Resources',
  'Corporate Service',
  'Finance',
  'IT & Software Engineering',
  'Business Development',
  'Sales & Digital Marketing',
  'Sales',
  'SAP',
  'People Growth',
];

function pid(t) {
  return t?.public_id || t?.publicId || t?.id;
}

const TRIAGE = 'Pending IT Triage';
const WORKING = ['Assigned', 'In Progress', 'On Hold'];
const CLOSED = ['Completed', 'Rejected'];

function slaInfo(ticket) {
  const status = (ticket.status || '').toLowerCase();
  if (status.includes('completed') || status.includes('reject')) return { text: 'Closed', cls: 'badge badge-sla' };
  if (status.includes('resolved')) return { text: 'Resolved', cls: 'badge badge-sla' };
  if (status.includes('hold')) return { text: 'Paused', cls: 'badge badge-sla-warning' };
  const due = ticket.due_timestamp || ticket.dueTimestamp;
  if (!due) return { text: 'SLA Active', cls: 'badge badge-sla' };
  const ms = new Date(due) - Date.now();
  if (ms < 0) return { text: 'Overdue', cls: 'badge badge-sla-overdue' };
  const hrs = Math.ceil(ms / 3600000);
  if (hrs <= 4) return { text: `${hrs}h left`, cls: 'badge badge-sla-warning' };
  return { text: `${hrs}h left`, cls: 'badge badge-sla' };
}

function priorityClass(p) {
  if (p === 'High') return 'p-high';
  if (p === 'Low') return 'p-low';
  return 'p-medium';
}

const emptyForm = {
  department: '',
  category: '',
  other_category: '',
  subject: '',
  description: '',
  attachment_url: null,
  behalf_name: '',
  requester_name: '',
  requester_email: '',
};

export default function TicketsPage() {
  return (
    <Suspense fallback={<DataLoader label="Loading tickets..." />}>
      <TicketsPageInner />
    </Suspense>
  );
}

function TicketsPageInner() {
  const { hasPermission, canViewAll, user, role } = useAuth();
  const { avatarFor } = useAvatarDirectory();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const canSeeAll =
    canViewAll('tickets') ||
    Boolean(role?.is_it_admin) ||
    Boolean(role?.is_executive);
  const isItAdmin = Boolean(role?.is_it_admin);
  const isElevated =
    Boolean(role?.is_it_admin) ||
    Boolean(role?.is_executive) ||
    Boolean(role?.is_hr_manager) ||
    Boolean(role?.is_finance_manager) ||
    Boolean(role?.is_gm);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateRange, setDateRange] = useState(emptyDateRange);
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState(DEFAULT_DEPTS);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [attachFile, setAttachFile] = useState(null);
  const [aiBusy, setAiBusy] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [replyText, setReplyText] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdPrompt, setHoldPrompt] = useState(false);
  const [lmPriority, setLmPriority] = useState('Medium');
  const [lmReason, setLmReason] = useState('');
  const [lmBusy, setLmBusy] = useState(false);
  const [assignees, setAssignees] = useState([]);
  const [assignForm, setAssignForm] = useState({ assignee_id: '', priority: '' });
  const [assignBusy, setAssignBusy] = useState(false);
  const [resolvePrompt, setResolvePrompt] = useState(false);
  const [resolutionText, setResolutionText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketsApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load tickets', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('tickets')) return;
    load();
    departmentsApi.list().then((res) => {
      const list = (res.data || []).map((d) => d.name || d).filter(Boolean);
      if (list.length) setDepartments(list);
    }).catch(() => {});
    usersApi.directory().then((res) => {
      setDirectory((res.data || []).filter((u) => (u.status || 'Active') === 'Active'));
    }).catch(() => {});
    if (isItAdmin) {
      ticketsApi.assignees().then((res) => setAssignees(res.data || [])).catch(() => {});
    }
  }, [hasPermission, load, isItAdmin]);

  function openCreateForm() {
    setForm({
      ...emptyForm,
      department: user?.department || '',
      requester_name: user?.name || '',
      requester_email: user?.email || '',
    });
    setAttachFile(null);
    setCreateOpen(true);
  }

  useEffect(() => {
    if (searchParams.get('create') === '1' && hasPermission('tickets') && !user?.is_super_admin) {
      openCreateForm();
      router.replace('/tickets');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, hasPermission, user, router]);

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
      }));
    }
  }

  async function improveField(field, type) {
    const draft = (form[field] || '').trim();
    if (!draft) {
      showToast('Draft needed', 'Please write a draft first.', 'warning');
      return;
    }
    setAiBusy(field);
    try {
      const res = await aiApi.improve(draft, type);
      setForm((f) => ({ ...f, [field]: res.data?.text || draft }));
      showToast('Improved', res.message || 'Text improved.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'AI improve failed', 'error');
    } finally {
      setAiBusy('');
    }
  }

  async function submitCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let attachment_url = null;
      if (attachFile) {
        const up = await uploadsApi.upload(attachFile);
        attachment_url = up.data?.url || null;
      }
      await ticketsApi.create({
        department: form.department,
        category: form.category,
        other_category: form.category === 'Other' ? form.other_category : null,
        subject: form.subject,
        description: form.description,
        requester_name: form.requester_name || user?.name,
        requester_email: form.requester_email || user?.email,
        attachment_url,
        on_behalf: Boolean(form.behalf_name?.trim()),
      });
      showToast('Ticket Created', 'Ticket submitted. Your Line Manager sets the priority before IT picks it up.', 'success');
      setCreateOpen(false);
      setForm(emptyForm);
      setAttachFile(null);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not create ticket', 'error');
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const myEmail = (user?.email || '').toLowerCase();
    const myName = (user?.name || '').toLowerCase();
    return rows.filter((t) => {
      if (statusFilter !== 'All' && t.status !== statusFilter) return false;
      if (!rowInDateRange(t, dateRange)) return false;
      if (mineOnly && isElevated) {
        const requesterEmail = (t.requester_email || t.requesterEmail || '').toLowerCase();
        const assigned = String(t.assigned_to || t.assignedTo || '').toLowerCase();
        const isMine =
          (myEmail && requesterEmail === myEmail) ||
          (myEmail && assigned === myEmail) ||
          (myName && assigned === myName);
        if (!isMine) return false;
      }
      if (!q) return true;
      const hay = [
        pid(t),
        t.subject,
        t.requester_name || t.requesterName,
        t.category,
        t.requester_email || t.requesterEmail,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, dateRange, mineOnly, isElevated, user?.email, user?.name]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Ticket ID', 'Requester', 'Department', 'Subject', 'Category', 'Priority', 'Status', 'SLA', 'Assigned To'],
    rows: filtered.map((t) => [
      pid(t),
      t.requester_name || t.requesterName || '',
      t.department || '',
      t.subject || '',
      t.category || '',
      t.priority || '',
      t.status || '',
      slaInfo(t).text,
      t.assigned_to || t.assignedTo || '',
    ]),
  }), [filtered]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const progress = filtered.filter((t) => ['Assigned', 'In Progress'].includes(t.status)).length;
    const resolved = filtered.filter((t) => ['Resolved', 'Completed'].includes(t.status)).length;
    const overdue = filtered.filter((t) => slaInfo(t).text === 'Overdue').length;
    return { total, progress, resolved, overdue };
  }, [filtered]);

  async function openDetail(id) {
    try {
      const res = await ticketsApi.get(id);
      const t = res.data;
      setDetail(t);
      setEditForm({
        category: t.category || '',
        other_category: t.other_category || t.otherCategory || '',
        subject: t.subject || '',
        description: t.description || '',
      });
      setLmPriority(t.priority || 'Medium');
      setLmReason('');
      setAssignForm({ assignee_id: t.assigned_to_id ? String(t.assigned_to_id) : '', priority: '' });
      setResolutionText('');
      setReplyText('');
      setDetailOpen(true);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load ticket', 'error');
    }
  }

  async function saveDetail() {
    if (!detail) return;
    setSaving(true);
    try {
      await ticketsApi.update(pid(detail), editForm);
      showToast('Saved', 'Ticket updated.', 'success');
      await openDetail(pid(detail));
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action) {
    if (!detail) return;
    const id = pid(detail);
    try {
      if (action === 'inProgress') await ticketsApi.inProgress(id);
      if (action === 'resume') await ticketsApi.resume(id);
      if (action === 'complete') await ticketsApi.complete(id);
      if (action === 'resolve') {
        if (!resolutionText.trim()) {
          showToast('Resolution', 'Please describe how the issue was resolved.', 'warning');
          return;
        }
        await ticketsApi.resolve(id, resolutionText.trim());
        setResolvePrompt(false);
        setResolutionText('');
      }
      if (action === 'hold') {
        if (!holdReason.trim()) {
          showToast('Hold Reason', 'Please enter a hold reason.', 'warning');
          return;
        }
        await ticketsApi.hold(id, holdReason.trim());
        setHoldPrompt(false);
        setHoldReason('');
      }
      showToast('Updated', 'Ticket status updated.', 'success');
      await openDetail(id);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Action failed', 'error');
    }
  }

  async function postReply() {
    if (!detail || !replyText.trim()) return;
    try {
      await ticketsApi.reply(pid(detail), replyText.trim());
      setReplyText('');
      showToast('Reply Posted', 'Your reply was added.', 'success');
      await openDetail(pid(detail));
    } catch (err) {
      showToast('Error', err.message || 'Reply failed', 'error');
    }
  }

  function isPendingLineManager(ticket) {
    const s = (ticket?.status || '').toLowerCase();
    return s.includes('pending line manager') || s === 'pending line manager';
  }

  function isLineManagerFor(ticket) {
    if (!ticket || !user?.id) return false;
    const lmId = ticket.line_manager_id ?? ticket.lineManagerId;
    return Number(lmId) === Number(user.id);
  }

  function isAssigneeFor(ticket) {
    if (!ticket || !user?.id || ticket.assigned_to_id == null) return false;
    return Number(ticket.assigned_to_id) === Number(user.id);
  }

  async function submitAssign() {
    if (!detail) return;
    if (!assignForm.assignee_id) {
      showToast('Required', 'Select the IT resource to assign.', 'warning');
      return;
    }
    if (!detail.priority && !assignForm.priority) {
      showToast('Required', 'This ticket had no Line Manager review — set a priority.', 'warning');
      return;
    }
    setAssignBusy(true);
    try {
      await ticketsApi.assign(pid(detail), {
        assignee_id: Number(assignForm.assignee_id),
        ...(!detail.priority ? { priority: assignForm.priority } : {}),
      });
      showToast('Assigned', 'Ticket assigned.', 'success');
      await openDetail(pid(detail));
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Assignment failed', 'error');
    } finally {
      setAssignBusy(false);
    }
  }

  async function submitLmReview(action) {
    if (!detail) return;
    if (!lmPriority) {
      showToast('Required', 'Please set a priority level.', 'warning');
      return;
    }
    if (action === 'reject' && !lmReason.trim()) {
      showToast('Required', 'Please enter a rejection reason.', 'warning');
      return;
    }
    setLmBusy(true);
    try {
      await ticketsApi.lineManagerReview(pid(detail), {
        action,
        priority: lmPriority,
        ...(action === 'reject' ? { reason: lmReason.trim() } : {}),
      });
      showToast(
        action === 'send_to_it' ? 'Sent to IT' : 'Rejected',
        action === 'send_to_it'
          ? 'Ticket prioritized and sent to IT Support.'
          : 'Ticket rejected by Line Manager.',
        action === 'send_to_it' ? 'success' : 'warning'
      );
      setDetailOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Review failed', 'error');
    } finally {
      setLmBusy(false);
    }
  }

  if (!hasPermission('tickets')) {
    return (
      <AppShell title="Support Tickets" subtitle="Raise and track IT support requests.">
        <AccessDenied moduleName="Support Tickets" />
      </AppShell>
    );
  }

  const status = (detail?.status || '').toLowerCase();
  const detailStatus = detail?.status || '';
  const showLmReview = Boolean(detail && isPendingLineManager(detail) && isLineManagerFor(detail));
  // Step 3: Admin/IT triage & (re)assignment.
  const showTriage = Boolean(detail && isItAdmin && (detailStatus === TRIAGE || WORKING.includes(detailStatus)));
  // Step 4: only the assigned IT resource records progress / resolution.
  const showItActions = Boolean(detail && isAssigneeFor(detail) && WORKING.includes(detailStatus));
  // Step 5: Admin/IT completes a resolved ticket.
  const showComplete = Boolean(detail && isItAdmin && detailStatus === 'Resolved');
  const canEditDetails = showTriage;
  const isClosed = CLOSED.includes(detailStatus);

  return (
    <AppShell
      title={canSeeAll ? 'All Tickets' : 'My Tickets'}
      subtitle="Raise technical support requests and track SLA progress."
      actions={user?.is_super_admin ? null : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreateForm}
        >
          <i className="fa-solid fa-plus" /><span>Create New Ticket</span>
        </button>
      )}
    >
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info">
            <h3>{canSeeAll && !mineOnly ? 'Total Tickets' : 'My Tickets'}</h3>
            <div className="counter">{kpis.total}</div>
          </div>
          <div className="metric-icon icon-total"><i className="fa-solid fa-ticket" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <h3>Assigned / In Progress</h3>
            <div className="counter">{kpis.progress}</div>
          </div>
          <div className="metric-icon icon-progress"><i className="fa-solid fa-spinner" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <h3>Resolved / Completed</h3>
            <div className="counter">{kpis.resolved}</div>
          </div>
          <div className="metric-icon icon-resolved"><i className="fa-solid fa-circle-check" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <h3>SLA Overdue</h3>
            <div className="counter">{kpis.overdue}</div>
          </div>
          <div className="metric-icon icon-urgent"><i className="fa-solid fa-triangle-exclamation" /></div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Support Tickets</h2></div>
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
              My Tickets
            </label>
          ) : null}
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search by ID, requester, title..."
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
              <option value="Pending Line Manager">Pending Line Manager</option>
              <option value={TRIAGE}>{TRIAGE}</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Resolved">Resolved</option>
              <option value="Completed">Completed</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <DateRangeFilter
            value={dateRange}
            onChange={(next) => { setDateRange(next); setPage(1); }}
          />
          <TableExportButtons
            filename="tickets"
            title="Support Tickets"
            headers={exportPack.headers}
            rows={exportPack.rows}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="helpdesk-table">
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Requester</th>
              <th>Subject</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>SLA Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={8} label="Loading tickets..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8}><EmptyState text="No support tickets found." /></td></tr>
            ) : (
              pageRows.map((t) => {
                const sla = slaInfo(t);
                return (
                  <tr key={pid(t)}>
                    <td><strong>#{pid(t)}</strong></td>
                    <td>
                      <UserAvatar
                        name={t.requester_name || t.requesterName}
                        src={avatarFor({
                          email: t.requester_email || t.requesterEmail,
                          name: t.requester_name || t.requesterName,
                        })}
                        size="table"
                        sub={t.department}
                      />
                    </td>
                    <td>{t.subject}</td>
                    <td>{t.category}</td>
                    <td>
                      {t.priority ? (
                        <>
                          <span className={`priority-indicator ${priorityClass(t.priority)}`} />
                          {t.priority}
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td><span className={statusBadgeClass(t.status)}>{t.status}</span></td>
                    <td><span className={sla.cls}>{sla.text}</span></td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(pid(t))}>
                        <i className="fa-solid fa-eye" /><span>Details</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />

      <Modal
        open={createOpen}
        title="Create New Support Ticket"
        icon="fa-ticket"
        onClose={() => setCreateOpen(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" form="newTicketForm" className="btn btn-primary" disabled={saving}>
              <i className="fa-solid fa-paper-plane" /><span>{saving ? 'Submitting...' : 'Submit Ticket'}</span>
            </button>
          </>
        )}
      >
        <form id="newTicketForm" onSubmit={submitCreate} autoComplete="off">
          {isItAdmin ? (
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
                <i className="fa-solid fa-user-gear" /> Raise Ticket on Behalf of Employee (IT Support Override)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Search and select employee name (leave blank if for yourself)..."
                list="behalfEmployeeList"
                value={form.behalf_name}
                onChange={(e) => applyBehalf(e.target.value)}
              />
              <datalist id="behalfEmployeeList">
                {directory.map((u) => (
                  <option key={u.id || u.email} value={u.name}>{u.email}</option>
                ))}
              </datalist>
            </div>
          ) : null}
          <div className="form-grid-2">
            <div className="form-group">
              <label>Requester Name</label>
              <input className="form-control" value={form.requester_name || user?.name || ''} readOnly />
            </div>
            <div className="form-group">
              <label>Requester Email</label>
              <input className="form-control" value={form.requester_email || user?.email || ''} readOnly />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Department *</label>
              <select
                className="form-control form-control-select"
                required
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              >
                <option value="">Select Department</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Priority Level</label>
              <input
                className="form-control"
                readOnly
                value="Set by the Line Manager after review"
              />
            </div>
          </div>
          <p style={{ margin: '-4px 0 14px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />
            New tickets start as <strong>Pending Line Manager</strong>: the manager sets the priority, then Admin/IT
            assigns the ticket. Without a Line Manager, the ticket goes straight to IT triage.
          </p>
          <div className="form-group">
            <label>Issue Category *</label>
            <select
              className="form-control form-control-select"
              required
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="">Select Category</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {form.category === 'Other' ? (
            <div className="form-group">
              <label>Specify Custom Category *</label>
              <input
                className="form-control"
                required
                placeholder="Describe category..."
                value={form.other_category}
                onChange={(e) => setForm((f) => ({ ...f, other_category: e.target.value }))}
              />
            </div>
          ) : null}
          <div className="form-group">
            <div className="label-with-ai">
              <label>Subject / Short Summary *</label>
              <button
                type="button"
                className="btn-ai"
                disabled={Boolean(aiBusy)}
                onClick={() => improveField('subject', 'subject')}
              >
                <i className={`fa-solid ${aiBusy === 'subject' ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} />
                <span>{aiBusy === 'subject' ? 'Improving...' : 'Improve with AI'}</span>
              </button>
            </div>
            <input
              className="form-control"
              required
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. vpn disconnecting"
            />
          </div>
          <div className="form-group">
            <div className="label-with-ai">
              <label>Detailed Description *</label>
              <button
                type="button"
                className="btn-ai"
                disabled={Boolean(aiBusy)}
                onClick={() => improveField('description', 'description')}
              >
                <i className={`fa-solid ${aiBusy === 'description' ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} />
                <span>{aiBusy === 'description' ? 'Improving...' : 'Improve with AI'}</span>
              </button>
            </div>
            <textarea
              className="form-control"
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe issue..."
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
        title={`Ticket Details — #${detail ? pid(detail) : ''}`}
        icon="fa-pen-to-square"
        onClose={() => setDetailOpen(false)}
        maxWidth={720}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDetailOpen(false)}>Close</button>
            {canEditDetails ? (
              <button type="button" className="btn btn-primary" disabled={saving} onClick={saveDetail}>
                <i className="fa-solid fa-floppy-disk" /><span>Save Changes</span>
              </button>
            ) : null}
          </>
        )}
      >
        {detail ? (
          <>
            <div className="ticket-status-banner">
              <div><strong>Status:</strong> <span className={statusBadgeClass(detail.status)}>{detail.status}</span></div>
              <div>
                <strong>Assigned To:</strong>{' '}
                <strong style={{ color: 'var(--primary)' }}>{detail.assigned_to || detail.assignedTo || 'Not assigned yet'}</strong>
              </div>
              <div><span className={slaInfo(detail).cls}>{slaInfo(detail).text}</span></div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, width: '100%', marginTop: 4 }}>
                Created: {detail.created_timestamp || detail.createdTimestamp
                  ? new Date(detail.created_timestamp || detail.createdTimestamp).toLocaleString()
                  : '—'}
              </div>
            </div>

            {showLmReview ? (
              <div
                className="admin-ticket-action-bar"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
              >
                <div className="admin-action-info">
                  <i className="fa-solid fa-user-tie" /><span>Line Manager Review:</span>
                </div>
                <div className="form-grid-2" style={{ width: '100%' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Set Priority *</label>
                    <select
                      className="form-control form-control-select"
                      value={lmPriority}
                      onChange={(e) => setLmPriority(e.target.value)}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Reject Reason (if rejecting)</label>
                    <input
                      className="form-control"
                      value={lmReason}
                      onChange={(e) => setLmReason(e.target.value)}
                      placeholder="Optional unless rejecting"
                    />
                  </div>
                </div>
                <div className="admin-action-buttons">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={lmBusy}
                    onClick={() => submitLmReview('reject')}
                  >
                    <i className="fa-solid fa-xmark" /><span>Reject</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={lmBusy}
                    onClick={() => submitLmReview('send_to_it')}
                  >
                    <i className="fa-solid fa-paper-plane" /><span>Send to IT</span>
                  </button>
                </div>
              </div>
            ) : null}

            {showTriage ? (
              <div
                className="admin-ticket-action-bar"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
              >
                <div className="admin-action-info">
                  <i className="fa-solid fa-sitemap" />
                  <span>{detailStatus === TRIAGE ? 'IT Triage — assign to an IT resource:' : 'Reassign ticket:'}</span>
                </div>
                <div className="form-grid-2" style={{ width: '100%' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Assign To *</label>
                    <select
                      className="form-control form-control-select"
                      value={assignForm.assignee_id}
                      onChange={(e) => setAssignForm((f) => ({ ...f, assignee_id: e.target.value }))}
                    >
                      <option value="">Select IT resource</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={String(a.id)}>{a.name} ({a.email})</option>
                      ))}
                    </select>
                  </div>
                  {!detail.priority ? (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Set Priority * (no Line Manager review)</label>
                      <select
                        className="form-control form-control-select"
                        value={assignForm.priority}
                        onChange={(e) => setAssignForm((f) => ({ ...f, priority: e.target.value }))}
                      >
                        <option value="">Select priority</option>
                        <option value="Low">Low (48h SLA)</option>
                        <option value="Medium">Medium (24h SLA)</option>
                        <option value="High">High (4h SLA)</option>
                      </select>
                    </div>
                  ) : null}
                </div>
                <div className="admin-action-buttons">
                  <button type="button" className="btn btn-success btn-sm" disabled={assignBusy} onClick={submitAssign}>
                    <i className="fa-solid fa-user-check" />
                    <span>{detail.assigned_to_id ? 'Reassign' : 'Assign'}</span>
                  </button>
                </div>
              </div>
            ) : null}

            {showItActions ? (
              <div className="admin-ticket-action-bar">
                <div className="admin-action-info">
                  <i className="fa-solid fa-user-shield" /><span>Assignee Actions:</span>
                </div>
                <div className="admin-action-buttons">
                  {detailStatus === 'Assigned' ? (
                    <button type="button" className="btn btn-info btn-sm" onClick={() => runAction('inProgress')}>
                      <i className="fa-solid fa-spinner" /><span>Mark In Progress</span>
                    </button>
                  ) : null}
                  {detailStatus !== 'On Hold' ? (
                    <button type="button" className="btn btn-warning btn-sm" onClick={() => setHoldPrompt(true)}>
                      <i className="fa-solid fa-pause" /><span>Put on Hold</span>
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => runAction('resume')}>
                      <i className="fa-solid fa-play" /><span>Resume Work</span>
                    </button>
                  )}
                  {detailStatus !== 'On Hold' ? (
                    <button type="button" className="btn btn-success btn-sm" onClick={() => setResolvePrompt(true)}>
                      <i className="fa-solid fa-circle-check" /><span>Mark Resolved</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showComplete ? (
              <div className="admin-ticket-action-bar">
                <div className="admin-action-info">
                  <i className="fa-solid fa-flag-checkered" /><span>Resolution recorded — complete the ticket:</span>
                </div>
                <div className="admin-action-buttons">
                  <button type="button" className="btn btn-success btn-sm" onClick={() => runAction('complete')}>
                    <i className="fa-solid fa-circle-check" /><span>Mark Completed</span>
                  </button>
                </div>
              </div>
            ) : null}

            {status.includes('hold') ? (
              <div className="hold-notice-box">
                <i className="fa-solid fa-pause" style={{ marginTop: 2 }} />
                <div>
                  <strong>Ticket Currently On Hold:</strong>
                  <div style={{ marginTop: 2 }}>{detail.hold_reason || detail.holdReason || '—'}</div>
                </div>
              </div>
            ) : null}

            {detailStatus === 'Resolved' || detailStatus === 'Completed' ? (
              <div className="resolved-notice">
                <i className="fa-solid fa-circle-check" />
                <span>
                  {detailStatus === 'Completed'
                    ? `Completed${detail.completed_at ? ` on ${new Date(detail.completed_at).toLocaleString()}` : ''}.`
                    : 'Resolved — awaiting completion by Admin/IT.'}
                  {detail.resolution ? ` Resolution: ${detail.resolution}` : ''}
                </span>
              </div>
            ) : null}

            <div className="form-grid-2">
              <div className="form-group">
                <label>Requester Name</label>
                <input className="form-control" disabled value={detail.requester_name || detail.requesterName || ''} />
              </div>
              <div className="form-group">
                <label>Department</label>
                <input className="form-control" disabled value={detail.department || ''} />
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Priority Level (set by Line Manager)</label>
                <input className="form-control" disabled value={detail.priority || 'Not set yet'} />
              </div>
              <div className="form-group">
                <label>Issue Category</label>
                <select
                  className="form-control form-control-select"
                  disabled={!canEditDetails}
                  value={editForm.category || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Subject</label>
              <input
                className="form-control"
                disabled={!canEditDetails}
                value={editForm.subject || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                disabled={!canEditDetails}
                value={editForm.description || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
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

            {(detail.status_history || []).length ? (
              <div className="ticket-thread-section">
                <h4 className="thread-heading"><i className="fa-solid fa-clock-rotate-left" /> Status History</h4>
                <div className="timeline-thread-box">
                  {detail.status_history.map((h) => (
                    <div key={h.id} className="thread-msg">
                      <div className="thread-msg-header">
                        <strong>
                          {h.from_status ? `${h.from_status} → ` : ''}{h.to_status}
                        </strong>
                        <span>{h.created_at ? new Date(h.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="thread-msg-body">
                        {h.changed_by_name || 'System'}{h.note ? ` — ${h.note}` : ''}
                      </div>
                    </div>
                  ))}
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
                        <strong>{r.author_name || r.authorName || r.author_email || 'User'}</strong>
                        <span>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="thread-msg-body">{r.text || r.message || r.body}</div>
                    </div>
                  ))
                )}
              </div>
              {!isClosed ? (
                <div className="reply-input-wrapper">
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Write reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={postReply}>
                    <i className="fa-solid fa-reply" /><span>Post Reply</span>
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={holdPrompt}
        title="Put Ticket On Hold"
        icon="fa-pause"
        onClose={() => setHoldPrompt(false)}
        maxWidth={420}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setHoldPrompt(false)}>Cancel</button>
            <button type="button" className="btn btn-warning" onClick={() => runAction('hold')}>Confirm Hold</button>
          </>
        )}
      >
        <div className="form-group">
          <label>Hold Reason *</label>
          <textarea
            className="form-control"
            rows={3}
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Waiting on requester / vendor / parts..."
          />
        </div>
      </Modal>

      <Modal
        open={resolvePrompt}
        title="Record Resolution"
        icon="fa-circle-check"
        onClose={() => setResolvePrompt(false)}
        maxWidth={480}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setResolvePrompt(false)}>Cancel</button>
            <button type="button" className="btn btn-success" onClick={() => runAction('resolve')}>Mark Resolved</button>
          </>
        )}
      >
        <div className="form-group">
          <label>Resolution Details *</label>
          <textarea
            className="form-control"
            rows={4}
            value={resolutionText}
            onChange={(e) => setResolutionText(e.target.value)}
            placeholder="What was the cause and how was it fixed?"
          />
        </div>
      </Modal>
    </AppShell>
  );
}
