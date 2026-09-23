'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { requisitionsApi } from '../../services/api';

const PAGE_SIZE = 10;

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

export default function ApprovalsPage() {
  const { hasPermission, user, role } = useAuth();
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

  const isDesignatedApprover = Boolean(role?.is_approver) && !Boolean(role?.is_it_admin);
  const isExecutiveSigner = Boolean(role?.is_executive) && !Boolean(role?.is_it_admin);
  const canSignPending = isDesignatedApprover || isExecutiveSigner;
  const canSeeAllPending =
    Boolean(role?.is_it_admin) ||
    Boolean(role?.is_approver) ||
    Boolean(role?.is_executive);

  const isApproverCreatedRequest = (r) => {
    if (!r) return false;
    if (r.requester_is_approver === true || r.requesterIsApprover === true) return true;
    const myEmail = (user?.email || '').toLowerCase();
    const requesterEmail = (r.requester_email || r.requesterEmail || '').toLowerCase();
    // Approver viewing their own pending request
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
      const status = (r.status || '').toLowerCase();
      if (!status.includes('pending')) return false;
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
  }, [rows, search, canSeeAllPending, mineOnly, user?.email]);

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

  const needsExecutiveSign = isApproverCreatedRequest(detail);
  const canActOnDetail = Boolean(
    detail &&
    canSignPending &&
    (detail.status || '').toLowerCase().includes('pending') &&
    user?.id &&
    Number(detail.approver_id ?? detail.approverId) === Number(user.id) &&
    // Approver-created → Executive only (Approver cannot self-approve)
    (!needsExecutiveSign || isExecutiveSigner)
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
        'Only the assigned Approver or Executive can approve or reject. IT Admin is view-only here.',
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
        `Requisition ${id} has been ${action === 'approve' ? 'approved' : 'rejected'}.`,
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

  return (
    <AppShell
      title="Pending Approvals"
      subtitle={
        canSignPending
          ? 'Review pending requisitions and approve or reject when you are the assigned signer.'
          : canSeeAllPending
            ? 'View pending asset requisitions (approve/reject is Approver or Executive only).'
            : 'View your own pending asset requisitions.'
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
                    {r.requester_name || r.requesterName}
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.department}</span>
                  </td>
                  <td>{r.type}</td>
                  <td>{r.item}</td>
                  <td>{r.urgency}</td>
                  <td>{r.project || '—'}</td>
                  <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
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
        title={`Approval Review — #${detail ? pid(detail) : ''}`}
        icon="fa-clipboard-check"
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
            ) : detail && (detail.status || '').toLowerCase().includes('pending') ? (
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
            <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div className="summary-item"><span className="label">Requester</span><span className="val">{detail.requester_name || detail.requesterName}</span></div>
              <div className="summary-item"><span className="label">Department</span><span className="val">{detail.department}</span></div>
              <div className="summary-item"><span className="label">Type</span><span className="val">{detail.type}</span></div>
              <div className="summary-item"><span className="label">Item</span><span className="val">{detail.item}</span></div>
              <div className="summary-item"><span className="label">Urgency</span><span className="val">{detail.urgency}</span></div>
              <div className="summary-item"><span className="label">Project</span><span className="val">{detail.project || '—'}</span></div>
            </div>
            <div className="form-group">
              <label>Justification</label>
              <textarea className="form-control" disabled value={detail.justification || ''} />
            </div>
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
                <textarea className="form-control" rows={2} placeholder="Ask a question or leave a note..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
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
