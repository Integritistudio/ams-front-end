'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { requisitionsApi, uploadsApi } from '../../services/api';
import UserAvatar from '../../components/UserAvatar';
import { useAvatarDirectory } from '../../hooks/useAvatarDirectory';

const PAGE_SIZE = 10;

const IT_QUEUE_STATUSES = [
  'Approved - Sent to IT',
  'In Progress',
  'In Procurement',
  'On Hold',
];

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

function slaInfo(row) {
  const status = (row?.status || '').toLowerCase();
  if (status.includes('completed') || status.includes('fulfilled') || status.includes('reject')) {
    return { text: 'Closed', cls: 'badge badge-sla' };
  }
  if (status.includes('hold')) return { text: 'Paused', cls: 'badge badge-sla-warning' };
  const due = row?.due_timestamp || row?.dueTimestamp;
  if (!due) return { text: 'SLA Active', cls: 'badge badge-sla' };
  const ms = new Date(due) - Date.now();
  if (ms < 0) return { text: 'Overdue', cls: 'badge badge-sla-overdue' };
  const hrs = Math.ceil(ms / 3600000);
  if (hrs <= 4) return { text: `${hrs}h left`, cls: 'badge badge-sla-warning' };
  return { text: `${hrs}h left`, cls: 'badge badge-sla' };
}

function isPendingManager(status) {
  return (status || '').toLowerCase().includes('pending');
}

function isItQueueStatus(status) {
  return IT_QUEUE_STATUSES.includes(status);
}

function isExecutivePriority(r) {
  if (!r) return false;
  if (r.requester_is_executive === true || r.requesterIsExecutive === true) return true;
  const hist = String(r.decision_history || r.decisionHistory || '');
  return hist.includes('EXECUTIVE_PRIORITY');
}

export default function ApprovalsPage() {
  const { hasPermission, user, role } = useAuth();
  const { avatarFor } = useAvatarDirectory();
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [holdPrompt, setHoldPrompt] = useState(false);
  const [holdReason, setHoldReason] = useState('');

  const isItAdmin = Boolean(role?.is_it_admin);
  const isDesignatedApprover = Boolean(role?.is_approver) && !isItAdmin;
  const isExecutiveSigner = Boolean(role?.is_executive) && !isItAdmin;
  const canSignPending = isDesignatedApprover || isExecutiveSigner;
  // Approver/Executive already signed off → IT-queue lives on Asset Requests for them.
  // Staff + IT Admin keep IT-queue under Pending Approvals until Completed.
  const seesItQueueOnPending = isItAdmin || (!isDesignatedApprover && !isExecutiveSigner);
  const canSeeAllPending =
    isItAdmin ||
    Boolean(role?.is_approver) ||
    Boolean(role?.is_executive);

  const isApproverCreatedRequest = (r) => {
    if (!r) return false;
    if (r.requester_is_approver === true || r.requesterIsApprover === true) return true;
    const myEmail = (user?.email || '').toLowerCase();
    const requesterEmail = (r.requester_email || r.requesterEmail || '').toLowerCase();
    if (isDesignatedApprover && myEmail && requesterEmail === myEmail) return true;
    if (isDesignatedApprover && user?.id && Number(r.requester_id ?? r.requesterId) === Number(user.id)) {
      return true;
    }
    return false;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await requisitionsApi.list();
      setRows(res.data || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load approvals', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('approvals')) return;
    load();
  }, [hasPermission, load]);

  const pending = useMemo(() => {
    const q = search.trim().toLowerCase();
    const myEmail = (user?.email || '').toLowerCase();
    return rows.filter((r) => {
      const status = r.status || '';
      // Approver/Executive: manager-pending only (their approved items move to Asset Requests)
      // IT Admin + Staff: manager-pending + IT action queue (still in approval until Completed)
      if (seesItQueueOnPending) {
        if (!isPendingManager(status) && !isItQueueStatus(status)) return false;
      } else if (!isPendingManager(status)) {
        return false;
      }

      // Executive Pending Approvals: only requests submitted by the Approver
      if (isExecutiveSigner && !isApproverCreatedRequest(r)) {
        return false;
      }

      const requesterEmail = (r.requester_email || r.requesterEmail || '').toLowerCase();
      if (!canSeeAllPending) {
        if (!myEmail || requesterEmail !== myEmail) return false;
      } else if (mineOnly) {
        if (!myEmail || requesterEmail !== myEmail) return false;
      }
      if (!q) return true;
      const hay = [pid(r), r.item, r.requester_name || r.requesterName, r.project].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, canSeeAllPending, mineOnly, user?.email, seesItQueueOnPending, isExecutiveSigner]);

  const pageRows = pending.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: ['Request ID', 'Requester', 'Department', 'Type', 'Item', 'Urgency', 'Project', 'Status', 'Approver'],
    rows: pending.map((r) => [
      pid(r),
      r.requester_name || r.requesterName || '',
      r.department || '',
      r.type || '',
      r.item || '',
      r.urgency || '',
      r.project || '',
      r.status || '',
      r.approver_name || r.approverName || '',
    ]),
  }), [pending]);

  const detailStatus = detail?.status || '';
  const detailStatusLower = detailStatus.toLowerCase();
  const needsExecutiveSign = isApproverCreatedRequest(detail);
  const canActOnDetail = Boolean(
    detail &&
    canSignPending &&
    isPendingManager(detailStatus) &&
    user?.id &&
    Number(detail.approver_id ?? detail.approverId) === Number(user.id) &&
    (!needsExecutiveSign || isExecutiveSigner)
  );
  const canItActOnDetail = Boolean(
    detail &&
    isItAdmin &&
    isItQueueStatus(detailStatus) &&
    !detailStatusLower.includes('completed') &&
    !detailStatusLower.includes('fulfilled')
  );

  async function openDetail(id) {
    try {
      const res = await requisitionsApi.get(id);
      setDetail(res.data);
      setReplyText('');
      setOpen(true);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load requisition', 'error');
    }
  }

  async function act(action) {
    if (!detail) return;
    if (!canSignPending) {
      showToast(
        'Not allowed',
        'Only the assigned Approver or Executive can approve or reject. IT Admin is view-only for manager approval.',
        'warning'
      );
      return;
    }
    if (isApproverCreatedRequest(detail) && !isExecutiveSigner) {
      showToast(
        'Not allowed',
        'Approver-created requests must be approved by an Executive. You cannot approve your own request.',
        'warning'
      );
      return;
    }
    const approverId = detail.approver_id ?? detail.approverId;
    if (!user?.id || Number(approverId) !== Number(user.id)) {
      showToast('Not allowed', 'Only the assigned signer can approve or reject this request.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = pid(detail);
      if (action === 'approve') await requisitionsApi.approve(id);
      if (action === 'reject') await requisitionsApi.reject(id);
      showToast(
        action === 'approve' ? 'Approved' : 'Rejected',
        action === 'approve'
          ? `Requisition ${id} approved and sent to IT Admin for action.`
          : `Requisition ${id} has been rejected.`,
        action === 'approve' ? 'success' : 'warning'
      );
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runItAction(action) {
    if (!detail || !canItActOnDetail) return;
    const id = pid(detail);
    setBusy(true);
    try {
      if (action === 'inProgress') await requisitionsApi.inProgress(id);
      if (action === 'resume') await requisitionsApi.resume(id);
      if (action === 'complete') await requisitionsApi.complete(id);
      if (action === 'hold') {
        if (!holdReason.trim()) {
          showToast('Hold Reason', 'Please enter a hold reason.', 'warning');
          setBusy(false);
          return;
        }
        await requisitionsApi.hold(id, holdReason.trim());
        setHoldPrompt(false);
        setHoldReason('');
      }
      showToast('Updated', 'Asset request status updated.', 'success');
      if (action === 'complete') {
        setOpen(false);
        await load();
      } else {
        await openDetail(id);
        await load();
      }
    } catch (err) {
      showToast('Error', err.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function postReply() {
    if (!detail || !replyText.trim()) return;
    try {
      await requisitionsApi.reply(pid(detail), replyText.trim());
      setReplyText('');
      showToast('Reply Posted', 'Reply added.', 'success');
      await openDetail(pid(detail));
    } catch (err) {
      showToast('Error', err.message || 'Reply failed', 'error');
    }
  }

  if (!hasPermission('approvals')) {
    return (
      <AppShell title="Pending Approvals" subtitle="Review pending asset requisitions.">
        <AccessDenied moduleName="Pending Approvals" />
      </AppShell>
    );
  }

  const sla = detail ? slaInfo(detail) : null;

  return (
    <AppShell
      title="Pending Approvals"
      subtitle={
        isItAdmin
          ? 'Review manager-pending requests and action approved asset requests (In Progress, On Hold, Completed).'
          : canSignPending
            ? isExecutiveSigner
              ? 'Review Approver-submitted requests awaiting your sign-off. All other asset requests are viewable under Asset Requests.'
              : 'Review pending requisitions and approve or reject when you are the assigned signer.'
            : canSeeAllPending
              ? 'View pending asset requisitions (approve/reject is Approver or Executive only).'
              : 'Track your asset requests while they await manager or IT Admin approval.'
      }
    >
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info"><h3>Pending Approvals</h3><div className="counter">{pending.length}</div></div>
          <div className="metric-icon icon-urgent"><i className="fa-solid fa-stamp" /></div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Pending Manager Approvals</h2></div>
        <div className="toolbar-controls-group">
          {canSeeAllPending ? (
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
              My Pending Approvals
            </label>
          ) : null}
          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search pending requests..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <TableExportButtons
            filename="pending-approvals"
            title="Pending Approvals"
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
              <th>Project</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={8} label="Loading approvals..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8}><EmptyState text="No pending approvals." /></td></tr>
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
                  <td>{r.project || '—'}</td>
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
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(pid(r))}>
                      <i className="fa-solid fa-clipboard-check" /><span>Review</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={pending.length} onChange={setPage} />

      <Modal
        open={open}
        title={detail ? `Asset Requisition Details — #${pid(detail)}` : 'Asset Requisition Details'}
        icon="fa-box-archive"
        onClose={() => setOpen(false)}
        maxWidth={680}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
            {canActOnDetail ? (
              <>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act('reject')}>
                  <i className="fa-solid fa-xmark" /><span>Reject</span>
                </button>
                <button type="button" className="btn btn-success" disabled={busy} onClick={() => act('approve')}>
                  <i className="fa-solid fa-check" /><span>Approve (Send to IT)</span>
                </button>
              </>
            ) : null}
            {canItActOnDetail ? (
              <>
                {!detailStatusLower.includes('progress') && !detailStatusLower.includes('hold') ? (
                  <button type="button" className="btn btn-info" disabled={busy} onClick={() => runItAction('inProgress')}>
                    <i className="fa-solid fa-spinner" /><span>Mark In Progress</span>
                  </button>
                ) : null}
                {!detailStatusLower.includes('hold') ? (
                  <button type="button" className="btn btn-warning" disabled={busy} onClick={() => setHoldPrompt(true)}>
                    <i className="fa-solid fa-pause" /><span>Put on Hold</span>
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => runItAction('resume')}>
                    <i className="fa-solid fa-play" /><span>Resume Work</span>
                  </button>
                )}
                <button type="button" className="btn btn-success" disabled={busy} onClick={() => runItAction('complete')}>
                  <i className="fa-solid fa-circle-check" /><span>Mark Completed</span>
                </button>
              </>
            ) : null}
            {detail && isPendingManager(detailStatus) && !canActOnDetail ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                {isApproverCreatedRequest(detail)
                  ? 'View only — Approver-created requests must be approved by an Executive'
                  : 'View only — only the assigned Approver or Executive can approve or reject'}
              </span>
            ) : null}
          </>
        )}
      >
        {detail ? (
          <>
            <div className="ticket-status-banner">
              <div>
                <strong>Requisition:</strong>{' '}
                <span style={{ color: 'var(--primary)', fontWeight: 700 }}>#{pid(detail)}</span>
              </div>
              <div>
                <strong>Status:</strong>{' '}
                <span className={statusBadgeClass(detail.status)}>{detail.status}</span>
                {isExecutivePriority(detail) ? (
                  <>
                    {' '}
                    <span className="badge badge-sla-warning">Executive Priority</span>
                  </>
                ) : null}
              </div>
              <div><span className={sla.cls}>{sla.text}</span></div>
            </div>

            {isExecutivePriority(detail) ? (
              <div
                className="hold-notice-box"
                style={{
                  background: 'rgba(245,158,11,0.12)',
                  borderColor: 'var(--warning)',
                }}
              >
                <i className="fa-solid fa-flag" style={{ marginTop: 2, color: 'var(--warning)' }} />
                <div>
                  <strong>Executive Priority:</strong>
                  <div style={{ marginTop: 2 }}>
                    Manager approval was skipped. This request was auto-approved by an Executive and sent directly to IT Admin.
                  </div>
                </div>
              </div>
            ) : null}

            {detailStatusLower.includes('hold') ? (
              <div className="hold-notice-box">
                <i className="fa-solid fa-pause" style={{ marginTop: 2 }} />
                <div>
                  <strong>On Hold:</strong>
                  <div style={{ marginTop: 2 }}>{detail.hold_reason || detail.holdReason || '—'}</div>
                </div>
              </div>
            ) : null}

            {canItActOnDetail ? (
              <div className="admin-ticket-action-bar">
                <div className="admin-action-info">
                  <i className="fa-solid fa-user-shield" /><span>IT Admin Actions:</span>
                </div>
                <div className="admin-action-buttons">
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Use the footer buttons to update status (In Progress / On Hold / Completed).
                  </span>
                </div>
              </div>
            ) : null}

            <div className="approval-summary-grid">
              <div className="summary-item">
                <span className="label">Requester</span>
                <span className="val">{detail.requester_name || detail.requesterName || '—'}</span>
              </div>
              <div className="summary-item">
                <span className="label">Department</span>
                <span className="val">{detail.department || '—'}</span>
              </div>
              <div className="summary-item">
                <span className="label">Approver</span>
                <span className="val">{detail.approver_name || detail.approverName || '—'}</span>
              </div>
              <div className="summary-item">
                <span className="label">Type</span>
                <span className="val">{detail.type || '—'}</span>
              </div>
              <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
                <span className="label">Item</span>
                <span className="val">{detail.item || '—'}</span>
              </div>
              <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
                <span className="label">Project</span>
                <span className="val">{detail.project || '—'}</span>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 14 }}>
              <label>Justification</label>
              <div className="read-only-box">{detail.justification || '—'}</div>
            </div>

            {detail.attachment_url || detail.attachmentUrl ? (
              <div className="form-group">
                <label>Attachment</label>
                <div className="attachment-display-card">
                  <i className="fa-solid fa-paperclip" style={{ color: 'var(--primary)' }} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        await uploadsApi.open(detail.attachment_url || detail.attachmentUrl);
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
              <h4 className="thread-heading"><i className="fa-solid fa-comments" /> Queries &amp; Discussion</h4>
              <div className="timeline-thread-box" style={{ maxHeight: 160 }}>
                {(detail.replies || []).length === 0 ? (
                  <div className="empty-state" style={{ padding: 16 }}>No replies yet.</div>
                ) : (
                  (detail.replies || []).map((r) => (
                    <div key={r.id || r.created_at} className="thread-msg">
                      <div className="thread-msg-header">
                        <strong>{r.author_name || r.authorName || r.author || 'User'}</strong>
                        <span>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="thread-msg-body">{r.text || r.message}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="reply-input-wrapper">
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Write message..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={postReply}>
                  <i className="fa-solid fa-reply" /><span>Post Message</span>
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={holdPrompt}
        title="Put Asset Request On Hold"
        icon="fa-pause"
        onClose={() => setHoldPrompt(false)}
        maxWidth={420}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setHoldPrompt(false)}>Cancel</button>
            <button type="button" className="btn btn-warning" disabled={busy} onClick={() => runItAction('hold')}>
              Confirm Hold
            </button>
          </>
        )}
      >
        <div className="form-group">
          <label>Mandatory Reason for Hold *</label>
          <textarea
            className="form-control"
            rows={3}
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Waiting on vendor / budget / requester confirmation..."
          />
        </div>
      </Modal>
    </AppShell>
  );
}
