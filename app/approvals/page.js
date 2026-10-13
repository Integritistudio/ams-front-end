'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { statusBadgeClass, Pagination, EmptyState, TableExportButtons } from '../../components/uiHelpers';
import DataLoader from '../../components/DataLoader';
import DateRangeFilter from '../../components/DateRangeFilter';
import InventorySourceBadge from '../../components/InventorySourceBadge';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { requisitionsApi, uploadsApi } from '../../services/api';
import UserAvatar from '../../components/UserAvatar';
import { useAvatarDirectory } from '../../hooks/useAvatarDirectory';
import { emptyDateRange, rowInDateRange } from '../../lib/dateRange';
import { inventorySourceLabel } from '../../lib/inventorySource';

const PAGE_SIZE = 10;

const IT_QUEUE_STATUSES = [
  'Approved - Sent to IT',
  'In Progress',
  'In Procurement',
  'On Hold',
];

const ALL_PENDING = [
  'Pending Line Manager Approval',
  'Pending Manager Approval',
  'Pending IT Inventory Check',
  'Pending IT Pricing',
  'Pending HR Approval',
  'Pending Price Approval',
  'Pending Finance Processing',
  // Legacy stages
  'Pending Finance Approval',
  'Pending GM Approval',
  'Pending Executive Approval',
];

/** Stage action the signed-in user can take on this row — computed by the API. */
function workflowAction(r) {
  return r?.workflow?.can_act ? r.workflow.action : null;
}

function fmtAmount(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : String(value);
}

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

function isPendingStage(status) {
  return ALL_PENDING.includes(status) || (status || '').toLowerCase().includes('pending');
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
  const [dateRange, setDateRange] = useState(emptyDateRange);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [holdPrompt, setHoldPrompt] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [vendorQuotes, setVendorQuotes] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [finance, setFinance] = useState({ quote_amount: '', vendor: '', invoice_ref: '', payment_ref: '' });

  const isItAdmin = Boolean(role?.is_it_admin);
  const isHrManager = Boolean(role?.is_hr_manager);
  const isFinanceManager = Boolean(role?.is_finance_manager);
  const isGm = Boolean(role?.is_gm);
  const isExecutive = Boolean(role?.is_executive);
  const isSuperAdmin = Boolean(user?.is_super_admin);
  /** Inventory / purchase flag — decision makers only (not Staff). */
  const canSeeInventoryFlag =
    isSuperAdmin || isItAdmin || isHrManager || isFinanceManager || isGm || isExecutive;

  const canSeeAllPending =
    isItAdmin ||
    isExecutive ||
    isHrManager ||
    isFinanceManager ||
    isGm ||
    isSuperAdmin;

  // Staff + IT Admin keep IT-queue under Pending Approvals until Completed.
  // Stage signers focus on pending stages (pricing / LM / Finance / HR / GM / Exec).
  const seesItQueueOnPending =
    isItAdmin ||
    (!isExecutive && !isHrManager && !isFinanceManager && !isGm);

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

      if (seesItQueueOnPending) {
        if (!isPendingStage(status) && !isItQueueStatus(status)) return false;
      } else if (!isPendingStage(status)) {
        return false;
      }

      const requesterEmail = (r.requester_email || r.requesterEmail || '').toLowerCase();
      const isMine = Boolean(myEmail) && requesterEmail === myEmail;
      if (mineOnly) {
        if (!isMine) return false;
      } else {
        // Oversight roles see the whole queue; everyone else sees what they must act on + their own.
        const oversees = isItAdmin || isExecutive || isSuperAdmin;
        if (!oversees && !isMine && !workflowAction(r)) return false;
      }
      if (!rowInDateRange(r, dateRange)) return false;
      if (!q) return true;
      const hay = [pid(r), r.item, r.requester_name || r.requesterName, r.project].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [
    rows, search, dateRange, mineOnly, user?.email, seesItQueueOnPending, isItAdmin, isExecutive, isSuperAdmin,
  ]);

  const pageRows = pending.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportPack = useMemo(() => ({
    headers: canSeeInventoryFlag
      ? ['Request ID', 'Requester', 'Department', 'Type', 'Item', 'Urgency', 'Project', 'Status', 'Inventory', 'Line Manager']
      : ['Request ID', 'Requester', 'Department', 'Type', 'Item', 'Urgency', 'Project', 'Status', 'Line Manager'],
    rows: pending.map((r) => {
      const base = [
        pid(r),
        r.requester_name || r.requesterName || '',
        r.department || '',
        r.type || '',
        r.item || '',
        r.urgency || '',
        r.project || '',
        r.status || '',
      ];
      if (canSeeInventoryFlag) base.push(inventorySourceLabel(r));
      base.push(r.line_manager_name || r.lineManagerName || '');
      return base;
    }),
  }), [pending, canSeeInventoryFlag]);

  const detailStatus = detail?.status || '';
  const detailStatusLower = detailStatus.toLowerCase();
  const detailAction = workflowAction(detail);
  const canActOnDetail = detailAction === 'approve';
  const canRejectDetail = Boolean(detail?.workflow?.can_act && detail?.workflow?.can_reject);
  const canCheckInventory = detailAction === 'inventory_check';
  const canSubmitPricing = detailAction === 'pricing';
  const canFinanceProcess = detailAction === 'finance_process';
  const hasStageAction =
    canActOnDetail || canRejectDetail || canCheckInventory || canSubmitPricing || canFinanceProcess;
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
      const data = res.data;
      setDetail(data);
      setReplyText('');
      setStageNote('');
      setFinance({
        quote_amount: data?.approved_amount != null ? String(data.approved_amount) : '',
        vendor: '',
        invoice_ref: '',
        payment_ref: '',
      });
      setTotalPrice(data?.total_price != null ? String(data.total_price) : '');
      const quotes = data?.vendor_quotes ?? data?.vendorQuotes;
      setVendorQuotes(
        typeof quotes === 'string'
          ? quotes
          : quotes
            ? JSON.stringify(quotes, null, 2)
            : ''
      );
      setOpen(true);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load requisition', 'error');
    }
  }

  async function act(action) {
    if (!detail) return;
    if (action === 'approve' ? !canActOnDetail : !canRejectDetail) {
      showToast('Not allowed', 'You are not the current stage approver for this request.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const id = pid(detail);
      if (action === 'approve') await requisitionsApi.approve(id);
      if (action === 'reject') await requisitionsApi.reject(id, stageNote.trim() || undefined);
      showToast(
        action === 'approve' ? 'Approved' : 'Rejected',
        action === 'approve'
          ? `Requisition ${id} approved and advanced to the next stage.`
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

  async function submitPricing() {
    if (!detail || !canSubmitPricing) return;
    const price = Number(totalPrice);
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Required', 'Enter a valid initial price.', 'warning');
      return;
    }
    setBusy(true);
    try {
      let quotesPayload = vendorQuotes.trim();
      try {
        if (quotesPayload.startsWith('[') || quotesPayload.startsWith('{')) {
          quotesPayload = JSON.parse(quotesPayload);
        }
      } catch (_e) {
        /* keep as string */
      }
      await requisitionsApi.submitPricing(pid(detail), {
        total_price: price,
        vendor_quotes: quotesPayload || null,
      });
      showToast('Price Submitted', 'Initial price saved and routed for approval by amount.', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not submit pricing', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitInventoryCheck(available) {
    if (!detail || !canCheckInventory) return;
    setBusy(true);
    try {
      const res = await requisitionsApi.inventoryCheck(pid(detail), {
        available,
        note: stageNote.trim() || undefined,
      });
      showToast(
        'Inventory Confirmed',
        available
          ? `In stock — request is now "${res.data?.status}".`
          : 'Not in stock — submit the initial price to start procurement.',
        'success'
      );
      if (available) {
        setOpen(false);
      } else {
        await openDetail(pid(detail));
      }
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not confirm inventory', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitFinance() {
    if (!detail || !canFinanceProcess) return;
    const quote = Number(finance.quote_amount);
    if (!Number.isFinite(quote) || quote <= 0) {
      showToast('Required', 'Enter the vendor quotation amount.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await requisitionsApi.financeProcess(pid(detail), {
        quote_amount: quote,
        vendor: finance.vendor.trim() || undefined,
        invoice_ref: finance.invoice_ref.trim() || undefined,
        payment_ref: finance.payment_ref.trim() || undefined,
        notes: stageNote.trim() || undefined,
      });
      const reapproval = res.data?.status !== 'Approved - Sent to IT';
      showToast(
        reapproval ? 'Re-approval Required' : 'Payment Recorded',
        reapproval
          ? `Quotation exceeds the approved price — request is now "${res.data?.status}".`
          : 'Quotation and payment recorded. Sent to IT for delivery.',
        reapproval ? 'warning' : 'success'
      );
      setOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Could not record finance processing', 'error');
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
  const approveLabel =
    detail?.workflow?.stage === 'price_approval'
      ? `Approve Price (${fmtAmount(detail.total_price)})`
      : detail?.workflow?.stage === 'line_manager'
        ? 'Approve (Next Stage)'
        : 'Approve';

  return (
    <AppShell
      title="Pending Approvals"
      subtitle={
        isItAdmin
          ? 'Inventory checks, initial pricing, and fulfilment actions for approved requests.'
          : canSeeAllPending
            ? 'Review requests waiting on you (Line Manager / HR / price approval / Finance processing).'
            : 'Track your asset requests while they await approval or IT action.'
      }
    >
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-info"><h3>Pending Approvals</h3><div className="counter">{pending.length}</div></div>
          <div className="metric-icon icon-urgent"><i className="fa-solid fa-stamp" /></div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="toolbar-left"><h2>Approval Queue</h2></div>
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
          <DateRangeFilter
            value={dateRange}
            onChange={(next) => { setDateRange(next); setPage(1); }}
          />
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
              {canSeeInventoryFlag ? <th>Stock</th> : null}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <DataLoader colSpan={canSeeInventoryFlag ? 9 : 8} label="Loading approvals..." />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={canSeeInventoryFlag ? 9 : 8}><EmptyState text="No pending approvals." /></td></tr>
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
                        <span className="badge badge-sla-warning" title="Executive request — Line Manager and price approval skipped">
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
        maxWidth={720}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
            {canRejectDetail ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act('reject')}>
                <i className="fa-solid fa-xmark" /><span>Reject</span>
              </button>
            ) : null}
            {canActOnDetail ? (
              <button type="button" className="btn btn-success" disabled={busy} onClick={() => act('approve')}>
                <i className="fa-solid fa-check" /><span>{approveLabel}</span>
              </button>
            ) : null}
            {canCheckInventory ? (
              <>
                <button type="button" className="btn btn-warning" disabled={busy} onClick={() => submitInventoryCheck(false)}>
                  <i className="fa-solid fa-cart-shopping" /><span>Not In Stock</span>
                </button>
                <button type="button" className="btn btn-success" disabled={busy} onClick={() => submitInventoryCheck(true)}>
                  <i className="fa-solid fa-boxes-stacked" /><span>In Stock</span>
                </button>
              </>
            ) : null}
            {canFinanceProcess ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitFinance}>
                <i className="fa-solid fa-file-invoice-dollar" /><span>{busy ? 'Saving...' : 'Record Quotation & Payment'}</span>
              </button>
            ) : null}
            {canSubmitPricing ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitPricing}>
                <i className="fa-solid fa-calculator" /><span>{busy ? 'Submitting...' : 'Submit Pricing'}</span>
              </button>
            ) : null}
            {canItActOnDetail ? (
              <>
                {!detailStatusLower.includes('progress') && !detailStatusLower.includes('hold') && !detailStatusLower.includes('procurement') ? (
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
            {detail && isPendingStage(detailStatus) && !hasStageAction ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                View only — awaiting {detail.approval_tier_role_name || 'the current stage approver'}
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
              {canSeeInventoryFlag ? (
                <div>
                  <strong>Stock:</strong>{' '}
                  <InventorySourceBadge row={detail} />
                </div>
              ) : null}
              <div><span className={sla.cls}>{sla.text}</span></div>
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
                      ? 'Available in Inventory — prefer assigning from stock (no vendor purchase needed).'
                      : detail.inventory_available === false || detail.inventoryAvailable === false
                        ? 'Need Purchase — item not in stock; IT pricing / procurement path applies.'
                        : 'Inventory check pending — IT Admin confirms stock after Line Manager approval.'}
                  </div>
                </div>
              </div>
            ) : null}

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
                    Executive request — Line Manager approval skipped and price approval is automatic.
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

            {canCheckInventory ? (
              <div className="admin-ticket-action-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                <div className="admin-action-info">
                  <i className="fa-solid fa-boxes-stacked" /><span>IT Inventory Check:</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Confirm whether &quot;{detail.item}&quot; is available in inventory. In stock goes to HR approval
                  (or straight to delivery when HR approval does not apply); not in stock starts procurement.
                </span>
              </div>
            ) : null}

            {canFinanceProcess ? (
              <div className="admin-ticket-action-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                <div className="admin-action-info">
                  <i className="fa-solid fa-file-invoice-dollar" />
                  <span>Finance Processing — approved price {fmtAmount(detail.approved_amount)}:</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  A vendor quotation above the approved price is sent back for re-approval at the new amount.
                </span>
                <div className="form-grid-2" style={{ width: '100%' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Vendor Quotation Amount *</label>
                    <input
                      type="number"
                      className="form-control"
                      min={0}
                      step="0.01"
                      value={finance.quote_amount}
                      onChange={(e) => setFinance((f) => ({ ...f, quote_amount: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Vendor</label>
                    <input
                      type="text"
                      className="form-control"
                      value={finance.vendor}
                      onChange={(e) => setFinance((f) => ({ ...f, vendor: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Invoice Reference</label>
                    <input
                      type="text"
                      className="form-control"
                      value={finance.invoice_ref}
                      onChange={(e) => setFinance((f) => ({ ...f, invoice_ref: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Payment Reference</label>
                    <input
                      type="text"
                      className="form-control"
                      value={finance.payment_ref}
                      onChange={(e) => setFinance((f) => ({ ...f, payment_ref: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {canCheckInventory || canRejectDetail || canFinanceProcess ? (
              <div className="form-group">
                <label>{canRejectDetail ? 'Note / rejection reason' : 'Note'}</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={stageNote}
                  onChange={(e) => setStageNote(e.target.value)}
                  placeholder="Optional — recorded in the request history"
                />
              </div>
            ) : null}

            {canSubmitPricing ? (
              <div
                className="admin-ticket-action-bar"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
              >
                <div className="admin-action-info">
                  <i className="fa-solid fa-tags" /><span>Initial Price (routed to HR / GM / Executive by amount):</span>
                </div>
                <div className="form-grid-2" style={{ width: '100%' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Initial Price *</label>
                    <input
                      type="number"
                      className="form-control"
                      min={0}
                      step="0.01"
                      value={totalPrice}
                      onChange={(e) => setTotalPrice(e.target.value)}
                      placeholder="e.g. 125000"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Vendor Quotes</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={vendorQuotes}
                      onChange={(e) => setVendorQuotes(e.target.value)}
                      placeholder="Vendor names, amounts, notes (or JSON array)"
                    />
                  </div>
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
                    Use the footer buttons (In Progress / On Hold / Completed). Reject is not available at this stage.
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
                <span className="label">Line Manager</span>
                <span className="val">
                  {detail.line_manager_name || detail.lineManagerName || '—'}
                </span>
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
              {detail.total_price != null || detail.totalPrice != null ? (
                <div className="summary-item">
                  <span className="label">Price</span>
                  <span className="val">{fmtAmount(detail.total_price ?? detail.totalPrice)}</span>
                </div>
              ) : null}
              {detail.approved_amount != null ? (
                <div className="summary-item">
                  <span className="label">Approved Amount</span>
                  <span className="val">{fmtAmount(detail.approved_amount)}</span>
                </div>
              ) : null}
              {detail.approver_name ? (
                <div className="summary-item">
                  <span className="label">Current / Last Approver</span>
                  <span className="val">{detail.approver_name}</span>
                </div>
              ) : null}
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
