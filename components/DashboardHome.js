'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ticketsApi,
  requisitionsApi,
  notificationsApi,
  logsApi,
  usersApi,
} from '../services/api';
import { statusBadgeClass } from './uiHelpers';
import UserAvatar from './UserAvatar';
import Modal from './Modal';
import {
  CHART_COLORS,
  buildTimeSeries,
  countBy,
  isPendingStatus,
} from '../lib/dashboardAnalytics';

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

/** Same count for every recent list so paired cards stay equal height. */
const RECENT_LIMIT = 5;

function EmptyCard({ icon = 'fa-inbox', message = 'Nothing to show right now.' }) {
  return (
    <div className="dash-hub-empty-state">
      <i className={`fa-solid ${icon}`} />
      <p>{message}</p>
    </div>
  );
}

function DashCard({ title, icon, action, children, className = '', bodyClassName = '' }) {
  return (
    <div className={`dash-hub-card ${className}`.trim()}>
      <div className="dash-hub-card-head">
        <h3>
          {icon ? <i className={`fa-solid ${icon}`} /> : null}
          {title}
        </h3>
        {action || null}
      </div>
      <div className={`dash-hub-card-body ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}

function emailOf(row) {
  return String(row?.requester_email || row?.requesterEmail || row?.email || '').toLowerCase();
}

function isMineRow(row, user) {
  const my = String(user?.email || '').toLowerCase();
  if (!my) return false;
  return emailOf(row) === my;
}

function isDirectReportRow(row, user, directoryByEmail) {
  if (!user?.id) return false;
  const lmId = row?.line_manager_id ?? row?.lineManagerId;
  if (lmId && Number(lmId) === Number(user.id)) return true;
  const person = directoryByEmail.get(emailOf(row));
  return Boolean(person && Number(person.manager_id || person.managerId) === Number(user.id));
}

function canApproveReq(row, user, role) {
  if (!row || !user) return false;
  const status = row.status || '';
  if (status === 'Pending Line Manager Approval' || status === 'Pending Manager Approval') {
    const lmId = row.line_manager_id ?? row.lineManagerId ?? row.approver_id ?? row.approverId;
    return Number(lmId) === Number(user.id);
  }
  if (status === 'Pending Finance Approval') return Boolean(role?.is_finance_manager);
  if (status === 'Pending HR Approval') return Boolean(role?.is_hr_manager);
  if (status === 'Pending GM Approval') return Boolean(role?.is_gm || role?.is_executive);
  if (status === 'Pending Executive Approval') return Boolean(role?.is_executive);
  return false;
}

function HubTabs({ tabs, value, onChange }) {
  if (!tabs?.length || tabs.length <= 1) return null;
  return (
    <div className="dash-hub-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`dash-hub-tab ${value === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {typeof t.count === 'number' ? <span className="dash-hub-tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  color: 'var(--text-main)',
  fontSize: 12,
};

export default function DashboardHome() {
  const { user, role, hasPermission, canViewAll } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [ticketTab, setTicketTab] = useState('mine');
  const [reqTab, setReqTab] = useState('mine');
  const [busyId, setBusyId] = useState(null);

  const [ticketDetail, setTicketDetail] = useState(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [reqDetail, setReqDetail] = useState(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);

  const isDecisionMaker =
    Boolean(user?.is_super_admin) ||
    Boolean(role?.is_it_admin) ||
    Boolean(role?.is_hr_manager) ||
    Boolean(role?.is_finance_manager) ||
    Boolean(role?.is_gm) ||
    Boolean(role?.is_executive);

  const canSeeAllTickets =
    isDecisionMaker || canViewAll('tickets') || canViewAll('requisitions');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tasks = [];
      if (hasPermission('tickets')) {
        tasks.push(ticketsApi.list({ silent: true }).then((r) => ({ k: 't', r })).catch(() => ({ k: 't', r: { data: [] } })));
      }
      if (hasPermission('requisitions') || hasPermission('approvals')) {
        tasks.push(requisitionsApi.list({ silent: true }).then((r) => ({ k: 'q', r })).catch(() => ({ k: 'q', r: { data: [] } })));
      }
      tasks.push(notificationsApi.list().then((r) => ({ k: 'n', r })).catch(() => ({ k: 'n', r: { data: [] } })));
      if (hasPermission('logs')) {
        tasks.push(logsApi.list().then((r) => ({ k: 'l', r })).catch(() => ({ k: 'l', r: { data: [] } })));
      }
      tasks.push(usersApi.directory().then((r) => ({ k: 'u', r })).catch(() => ({ k: 'u', r: { data: [] } })));

      const results = await Promise.all(tasks);
      const map = Object.fromEntries(results.map((x) => [x.k, x.r?.data || []]));
      setTickets(map.t || []);
      setReqs(map.q || []);
      setNotifs((map.n || []).slice(0, RECENT_LIMIT));
      setLogs((map.l || []).slice(0, RECENT_LIMIT));
      setDirectory(map.u || []);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [hasPermission, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const directoryByEmail = useMemo(() => {
    const m = new Map();
    directory.forEach((u) => {
      if (u.email) m.set(String(u.email).toLowerCase(), u);
    });
    return m;
  }, [directory]);

  const hasDirectReports = useMemo(
    () => directory.some((u) => Number(u.manager_id || u.managerId) === Number(user?.id)),
    [directory, user?.id]
  );

  const ticketTabs = useMemo(() => {
    const tabs = [{ id: 'mine', label: 'My Tickets' }];
    if (hasDirectReports || canSeeAllTickets) tabs.push({ id: 'reports', label: 'Direct Reports' });
    if (canSeeAllTickets) tabs.push({ id: 'all', label: 'All Tickets' });
    return tabs;
  }, [hasDirectReports, canSeeAllTickets]);

  const reqTabs = useMemo(() => {
    const tabs = [{ id: 'mine', label: 'My Requests' }];
    if (hasDirectReports || canSeeAllTickets) tabs.push({ id: 'reports', label: 'Direct Reports' });
    if (canSeeAllTickets) tabs.push({ id: 'all', label: 'All Requests' });
    return tabs;
  }, [hasDirectReports, canSeeAllTickets]);

  useEffect(() => {
    if (!ticketTabs.some((t) => t.id === ticketTab)) setTicketTab(ticketTabs[0]?.id || 'mine');
  }, [ticketTabs, ticketTab]);

  useEffect(() => {
    if (!reqTabs.some((t) => t.id === reqTab)) setReqTab(reqTabs[0]?.id || 'mine');
  }, [reqTabs, reqTab]);

  const scopedTickets = useMemo(() => {
    let list = tickets;
    if (ticketTab === 'mine') list = tickets.filter((t) => isMineRow(t, user));
    else if (ticketTab === 'reports') list = tickets.filter((t) => isDirectReportRow(t, user, directoryByEmail));
    return [...list]
      .sort((a, b) => new Date(b.created_at || b.created_timestamp || 0) - new Date(a.created_at || a.created_timestamp || 0))
      .slice(0, RECENT_LIMIT);
  }, [tickets, ticketTab, user, directoryByEmail]);

  const scopedReqs = useMemo(() => {
    let list = reqs;
    if (reqTab === 'mine') list = reqs.filter((r) => isMineRow(r, user));
    else if (reqTab === 'reports') list = reqs.filter((r) => isDirectReportRow(r, user, directoryByEmail));
    return [...list]
      .sort((a, b) => new Date(b.created_at || b.created_timestamp || 0) - new Date(a.created_at || a.created_timestamp || 0))
      .slice(0, RECENT_LIMIT);
  }, [reqs, reqTab, user, directoryByEmail]);

  const pendingForMe = useMemo(() => {
    return reqs
      .filter((r) => isPendingStatus(r.status) && canApproveReq(r, user, role))
      .slice(0, RECENT_LIMIT);
  }, [reqs, user, role]);

  const ticketStatusPie = useMemo(
    () => countBy(
      tickets.filter((t) => isMineRow(t, user) || (canSeeAllTickets && ticketTab === 'all')),
      (t) => t.status || 'Open',
      { top: 5 }
    ),
    [tickets, user, canSeeAllTickets, ticketTab]
  );

  const weekTrend = useMemo(() => {
    const base = canSeeAllTickets && ticketTab === 'all'
      ? tickets
      : tickets.filter((t) => isMineRow(t, user) || isDirectReportRow(t, user, directoryByEmail));
    return buildTimeSeries(base, 'daily', [{ key: 'tickets', pick: () => 1 }]).slice(-7);
  }, [tickets, user, canSeeAllTickets, ticketTab, directoryByEmail]);

  async function openTicketDetail(id) {
    setTicketLoading(true);
    setTicketOpen(true);
    try {
      const res = await ticketsApi.get(id);
      setTicketDetail(res.data);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load ticket', 'error');
      setTicketOpen(false);
    } finally {
      setTicketLoading(false);
    }
  }

  async function openReqDetail(id) {
    setReqLoading(true);
    setReqOpen(true);
    try {
      const res = await requisitionsApi.get(id);
      setReqDetail(res.data);
    } catch (err) {
      showToast('Error', err.message || 'Failed to load request', 'error');
      setReqOpen(false);
    } finally {
      setReqLoading(false);
    }
  }

  async function approve(id) {
    setBusyId(id);
    try {
      await requisitionsApi.approve(id);
      showToast('Approved', `Request #${id} approved.`, 'success');
      setReqOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id) {
    if (!window.confirm(`Reject request #${id}?`)) return;
    setBusyId(id);
    try {
      await requisitionsApi.reject(id);
      showToast('Rejected', `Request #${id} rejected.`, 'info');
      setReqOpen(false);
      await load();
    } catch (err) {
      showToast('Error', err.message || 'Reject failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="analytics-loading">
        <i className="fa-solid fa-spinner fa-spin" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  const canActOnOpenReq = reqDetail && canApproveReq(reqDetail, user, role);

  return (
    <div className="dash-hub">
      {/* Row 1: compact charts */}
      <div className="dash-hub-grid">
        {hasPermission('tickets') ? (
          <DashCard title="Ticket Status Mix" icon="fa-chart-pie" bodyClassName="dash-hub-card-body-chart">
            {ticketStatusPie.length === 0 ? (
              <EmptyCard icon="fa-chart-pie" message="No ticket data yet." />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ticketStatusPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {ticketStatusPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </DashCard>
        ) : null}

        {hasPermission('tickets') ? (
          <DashCard title="7-Day Ticket Trend" icon="fa-chart-line" bodyClassName="dash-hub-card-body-chart">
            {weekTrend.every((p) => !p.tickets) ? (
              <EmptyCard icon="fa-chart-line" message="No ticket trend for the last 7 days." />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weekTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="tickets" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </DashCard>
        ) : null}

        {/* Row 2: approvals + notifications */}
        {hasPermission('approvals') ? (
          <DashCard
            title="Pending Approvals"
            icon="fa-clipboard-check"
            action={(
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push('/approvals')}>
                View All
              </button>
            )}
          >
            {pendingForMe.length === 0 ? (
              <EmptyCard icon="fa-clipboard-check" message="No items waiting for your approval." />
            ) : (
              <ul className="dash-hub-list">
                {pendingForMe.map((r) => (
                  <li key={pid(r)}>
                    <div className="dash-hub-list-main">
                      <strong>#{pid(r)}</strong>
                      <span className="dash-hub-list-title">{r.item || 'Asset request'}</span>
                      <span className={statusBadgeClass(r.status)}>{r.status}</span>
                    </div>
                    <div className="dash-hub-list-meta">
                      {r.requester_name || r.requesterName || '—'} · {r.department || '—'}
                    </div>
                    <div className="dash-hub-list-actions">
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={busyId === pid(r)}
                        onClick={(e) => { e.stopPropagation(); approve(pid(r)); }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyId === pid(r)}
                        onClick={(e) => { e.stopPropagation(); reject(pid(r)); }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); openReqDetail(pid(r)); }}
                      >
                        Details
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        ) : null}

        <DashCard
          title="Recent Notifications"
          icon="fa-bell"
          action={(
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>
              Refresh
            </button>
          )}
        >
          {notifs.length === 0 ? (
            <EmptyCard icon="fa-bell-slash" message="No recent notifications." />
          ) : (
            <ul className="dash-hub-list">
              {notifs.map((n) => (
                <li key={n.id || `${n.subject}-${n.created_at}`}>
                  <div className="dash-hub-list-main">
                    <span className="dash-hub-list-title">{n.subject || 'Notification'}</span>
                  </div>
                  <div className="dash-hub-list-meta">
                    {(n.text || '').slice(0, 100)}
                    {n.created_at ? ` · ${new Date(n.created_at).toLocaleString()}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* Row 3: tickets + asset requests */}
        {hasPermission('tickets') ? (
          <DashCard
            title="Recent Tickets"
            icon="fa-ticket"
            action={(
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push('/tickets')}>
                View All
              </button>
            )}
          >
            <HubTabs
              tabs={ticketTabs.map((t) => ({
                ...t,
                count: t.id === 'mine'
                  ? tickets.filter((x) => isMineRow(x, user)).length
                  : t.id === 'reports'
                    ? tickets.filter((x) => isDirectReportRow(x, user, directoryByEmail)).length
                    : tickets.length,
              }))}
              value={ticketTab}
              onChange={setTicketTab}
            />
            {scopedTickets.length === 0 ? (
              <EmptyCard icon="fa-ticket" message="No tickets in this view." />
            ) : (
              <ul className="dash-hub-list">
                {scopedTickets.map((t) => (
                  <li
                    key={pid(t)}
                    className="dash-hub-list-click"
                    onClick={() => openTicketDetail(pid(t))}
                  >
                    <div className="dash-hub-list-main">
                      <strong>#{pid(t)}</strong>
                      <span className="dash-hub-list-title">{t.subject || 'Ticket'}</span>
                      <span className={statusBadgeClass(t.status)}>{t.status}</span>
                    </div>
                    <div className="dash-hub-list-meta">
                      <UserAvatar
                        name={t.requester_name || t.requesterName}
                        src={directoryByEmail.get(emailOf(t))?.avatar_url}
                        size="table"
                        showName={false}
                      />
                      {t.requester_name || t.requesterName || '—'} · {t.priority || '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        ) : null}

        {hasPermission('requisitions') ? (
          <DashCard
            title="Recent Asset Requests"
            icon="fa-cart-flatbed"
            action={(
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push('/requisitions')}>
                View All
              </button>
            )}
          >
            <HubTabs
              tabs={reqTabs.map((t) => ({
                ...t,
                count: t.id === 'mine'
                  ? reqs.filter((x) => isMineRow(x, user)).length
                  : t.id === 'reports'
                    ? reqs.filter((x) => isDirectReportRow(x, user, directoryByEmail)).length
                    : reqs.length,
              }))}
              value={reqTab}
              onChange={setReqTab}
            />
            {scopedReqs.length === 0 ? (
              <EmptyCard icon="fa-cart-flatbed" message="No asset requests in this view." />
            ) : (
              <ul className="dash-hub-list">
                {scopedReqs.map((r) => (
                  <li
                    key={pid(r)}
                    className="dash-hub-list-click"
                    onClick={() => openReqDetail(pid(r))}
                  >
                    <div className="dash-hub-list-main">
                      <strong>#{pid(r)}</strong>
                      <span className="dash-hub-list-title">{r.item || 'Request'}</span>
                      <span className={statusBadgeClass(r.status)}>{r.status}</span>
                    </div>
                    <div className="dash-hub-list-meta">
                      {r.requester_name || r.requesterName || '—'} · {r.type || '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        ) : null}

        {hasPermission('logs') ? (
          <DashCard
            title="My Recent Activities"
            icon="fa-clock-rotate-left"
            action={(
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push('/logs')}>
                View All
              </button>
            )}
          >
            {logs.length === 0 ? (
              <EmptyCard icon="fa-clock-rotate-left" message="No recent activity." />
            ) : (
              <ul className="dash-hub-list">
                {logs.map((log) => (
                  <li key={log.id || `${log.action}-${log.created_at}`}>
                    <div className="dash-hub-list-main">
                      <span className="dash-hub-list-title">{log.action || 'Action'}</span>
                      {log.target_id || log.targetId ? (
                        <span className="analytics-chip">#{log.target_id || log.targetId}</span>
                      ) : null}
                    </div>
                    <div className="dash-hub-list-meta">
                      {(log.details || '').slice(0, 90)}
                      {log.created_at || log.createdAt
                        ? ` · ${new Date(log.created_at || log.createdAt).toLocaleString()}`
                        : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        ) : null}
      </div>

      {/* Ticket detail modal */}
      <Modal
        open={ticketOpen}
        title={ticketDetail ? `Ticket Details — #${pid(ticketDetail)}` : 'Ticket Details'}
        icon="fa-ticket"
        onClose={() => { setTicketOpen(false); setTicketDetail(null); }}
        maxWidth={680}
        footer={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setTicketOpen(false); setTicketDetail(null); }}
          >
            Close
          </button>
        )}
      >
        {ticketLoading || !ticketDetail ? (
          <div className="dash-hub-empty">Loading ticket…</div>
        ) : (
          <>
            <div className="ticket-status-banner">
              <div>
                <strong>Status:</strong>{' '}
                <span className={statusBadgeClass(ticketDetail.status)}>{ticketDetail.status}</span>
              </div>
              <div>
                <strong>Priority:</strong> {ticketDetail.priority || '—'}
              </div>
              <div>
                <strong>Assigned:</strong> {ticketDetail.assigned_to || ticketDetail.assignedTo || '—'}
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Requester</label>
                <input className="form-control" disabled value={ticketDetail.requester_name || ticketDetail.requesterName || ''} />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input className="form-control" disabled value={ticketDetail.category || ''} />
              </div>
            </div>
            <div className="form-group">
              <label>Subject</label>
              <input className="form-control" disabled value={ticketDetail.subject || ''} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" disabled rows={4} value={ticketDetail.description || ''} />
            </div>
            {(ticketDetail.replies || []).length > 0 ? (
              <div className="ticket-thread-section">
                <h4 className="thread-heading"><i className="fa-solid fa-comments" /> Discussion</h4>
                <div className="timeline-thread-box" style={{ maxHeight: 200, overflow: 'auto' }}>
                  {(ticketDetail.replies || []).slice(-5).map((r) => (
                    <div key={r.id || r.created_at} className="thread-msg">
                      <div className="thread-msg-head">
                        <strong>{r.author_name || r.authorName || r.author || 'User'}</strong>
                        <span>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div>{r.message || r.body || r.text || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Modal>

      {/* Asset request / approval detail modal */}
      <Modal
        open={reqOpen}
        title={reqDetail ? `Asset Request — #${pid(reqDetail)}` : 'Asset Request'}
        icon="fa-cart-flatbed"
        onClose={() => { setReqOpen(false); setReqDetail(null); }}
        maxWidth={680}
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setReqOpen(false); setReqDetail(null); }}
            >
              Close
            </button>
            {canActOnOpenReq ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busyId === pid(reqDetail)}
                  onClick={() => reject(pid(reqDetail))}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={busyId === pid(reqDetail)}
                  onClick={() => approve(pid(reqDetail))}
                >
                  Approve
                </button>
              </>
            ) : null}
          </>
        )}
      >
        {reqLoading || !reqDetail ? (
          <div className="dash-hub-empty">Loading request…</div>
        ) : (
          <>
            <div className="ticket-status-banner">
              <div>
                <strong>Status:</strong>{' '}
                <span className={statusBadgeClass(reqDetail.status)}>{reqDetail.status}</span>
              </div>
              <div>
                <strong>Type:</strong> {reqDetail.type || '—'}
              </div>
              <div>
                <strong>Urgency:</strong> {reqDetail.urgency || '—'}
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Requester</label>
                <input className="form-control" disabled value={reqDetail.requester_name || reqDetail.requesterName || ''} />
              </div>
              <div className="form-group">
                <label>Department</label>
                <input className="form-control" disabled value={reqDetail.department || ''} />
              </div>
            </div>
            <div className="form-group">
              <label>Item</label>
              <input className="form-control" disabled value={reqDetail.item || ''} />
            </div>
            <div className="form-group">
              <label>Project</label>
              <input className="form-control" disabled value={reqDetail.project || ''} />
            </div>
            <div className="form-group">
              <label>Justification</label>
              <textarea className="form-control" disabled rows={3} value={reqDetail.justification || ''} />
            </div>
            {(reqDetail.replies || []).length > 0 ? (
              <div className="ticket-thread-section">
                <h4 className="thread-heading"><i className="fa-solid fa-comments" /> Discussion</h4>
                <div className="timeline-thread-box" style={{ maxHeight: 180, overflow: 'auto' }}>
                  {(reqDetail.replies || []).slice(-5).map((r) => (
                    <div key={r.id || r.created_at} className="thread-msg">
                      <div className="thread-msg-head">
                        <strong>{r.author_name || r.authorName || r.author || 'User'}</strong>
                        <span>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div>{r.message || r.body || r.text || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Modal>
    </div>
  );
}
