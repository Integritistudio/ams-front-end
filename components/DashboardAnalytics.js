'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ticketsApi,
  requisitionsApi,
  assetsApi,
  procurementApi,
  usersApi,
} from '../services/api';
import { exportRowsToCsv, statusBadgeClass } from './uiHelpers';
import UserAvatar from './UserAvatar';
import {
  CHART_COLORS,
  buildTimeSeries,
  countBy,
  filterOwn,
  isPendingStatus,
  isOpenTicket,
  seriesToExport,
} from '../lib/dashboardAnalytics';

function ChartCard({ title, subtitle, exportName, exportHeaders, exportRows, children, actions, className = '' }) {
  function onExport() {
    if (!exportHeaders?.length || !exportRows?.length) return;
    exportRowsToCsv(`${exportName || 'chart'}.csv`, exportHeaders, exportRows);
  }

  return (
    <div className={`analytics-card ${className}`.trim()}>
      <div className="analytics-card-header">
        <div>
          <h4 className="analytics-card-title">{title}</h4>
          {subtitle ? <p className="analytics-card-sub">{subtitle}</p> : null}
        </div>
        <div className="analytics-card-actions">
          {actions}
          <button
            type="button"
            className="btn btn-secondary btn-sm analytics-export-btn"
            title="Export CSV"
            disabled={!exportRows?.length}
            onClick={onExport}
          >
            <i className="fa-solid fa-download" />
          </button>
        </div>
      </div>
      <div className="analytics-card-body">{children}</div>
    </div>
  );
}

function PeriodToggle({ value, onChange }) {
  return (
    <div className="analytics-period-toggle">
      {['daily', 'weekly', 'monthly'].map((p) => (
        <button
          key={p}
          type="button"
          className={`analytics-period-btn ${value === p ? 'active' : ''}`}
          onClick={() => onChange(p)}
        >
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </button>
      ))}
    </div>
  );
}

function ScopeToggle({ value, onChange }) {
  return (
    <div className="analytics-period-toggle" role="group" aria-label="Analytics scope">
      <button
        type="button"
        className={`analytics-period-btn ${value === 'all' ? 'active' : ''}`}
        onClick={() => onChange('all')}
      >
        All Analytics
      </button>
      <button
        type="button"
        className={`analytics-period-btn ${value === 'mine' ? 'active' : ''}`}
        onClick={() => onChange('mine')}
      >
        My Analytics
      </button>
    </div>
  );
}

function Kpi({ label, value, icon, tone, hint }) {
  return (
    <div className={`analytics-kpi analytics-kpi-${tone || 'blue'}`}>
      <div className="analytics-kpi-icon"><i className={`fa-solid ${icon}`} /></div>
      <div>
        <div className="analytics-kpi-label">{label}</div>
        <div className="analytics-kpi-value">{value}</div>
        {hint ? <div className="analytics-kpi-hint">{hint}</div> : null}
      </div>
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

function pid(r) {
  return r?.public_id || r?.publicId || r?.id;
}

export default function DashboardAnalytics() {
  const { hasPermission, user, role } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [scope, setScope] = useState('all'); // 'all' | 'mine' — elevated roles only
  const [allTickets, setAllTickets] = useState([]);
  const [allReqs, setAllReqs] = useState([]);
  const [allAssets, setAllAssets] = useState([]);
  const [allProcurement, setAllProcurement] = useState([]);
  const [people, setPeople] = useState([]);

  const isElevated =
    Boolean(role?.is_it_admin) ||
    Boolean(role?.is_approver) ||
    Boolean(role?.is_executive);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tasks = [];
        if (hasPermission('tickets')) {
          tasks.push(ticketsApi.list().then((r) => ({ k: 't', r })).catch(() => ({ k: 't', r: { data: [] } })));
        }
        if (hasPermission('requisitions') || hasPermission('approvals')) {
          tasks.push(requisitionsApi.list().then((r) => ({ k: 'q', r })).catch(() => ({ k: 'q', r: { data: [] } })));
        }
        if (hasPermission('my_assets') || hasPermission('assign_assets')) {
          const assetCall = hasPermission('assign_assets')
            ? assetsApi.list()
            : assetsApi.mine();
          tasks.push(assetCall.then((r) => ({ k: 'a', r })).catch(() => ({ k: 'a', r: { data: [] } })));
        }
        if (hasPermission('procurement_log') && isElevated) {
          tasks.push(procurementApi.list().then((r) => ({ k: 'p', r })).catch(() => ({ k: 'p', r: { data: [] } })));
        }
        if (isElevated || hasPermission('users') || hasPermission('tickets')) {
          tasks.push(
            usersApi.directory().then((r) => ({ k: 'u', r })).catch(() => ({ k: 'u', r: { data: [] } }))
          );
        }

        const results = await Promise.all(tasks);
        if (cancelled) return;
        const map = Object.fromEntries(results.map((x) => [x.k, x.r?.data || []]));
        setAllTickets(map.t || []);
        setAllReqs(map.q || []);
        setAllAssets(map.a || []);
        setAllProcurement(map.p || []);
        setPeople(map.u || []);
      } catch (err) {
        showToast('Error', err.message || 'Failed to load analytics', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasPermission, user, role, isElevated, showToast]);

  const useMine = !isElevated || scope === 'mine';

  const tickets = useMemo(
    () => (useMine ? filterOwn(allTickets, user) : allTickets),
    [allTickets, user, useMine]
  );
  const reqs = useMemo(
    () => (useMine ? filterOwn(allReqs, user) : allReqs),
    [allReqs, user, useMine]
  );
  const assets = useMemo(
    () => (useMine ? filterOwn(allAssets, user) : allAssets),
    [allAssets, user, useMine]
  );
  const procurement = useMemo(
    () => (useMine ? filterOwn(allProcurement, user) : allProcurement),
    [allProcurement, user, useMine]
  );

  const avatarByEmail = useMemo(() => {
    const m = new Map();
    people.forEach((p) => {
      if (p.email) m.set(String(p.email).toLowerCase(), p.avatar_url || null);
    });
    if (user?.email) m.set(String(user.email).toLowerCase(), user.avatar_url || m.get(String(user.email).toLowerCase()));
    return m;
  }, [people, user]);

  const avatarByName = useMemo(() => {
    const m = new Map();
    people.forEach((p) => {
      if (p.name) m.set(String(p.name).toLowerCase(), p.avatar_url || null);
    });
    return m;
  }, [people]);

  function avatarOf(row) {
    const email = (row.requester_email || row.requesterEmail || row.email || '').toLowerCase();
    const name = (row.requester_name || row.requesterName || row.name || '').toLowerCase();
    return (email && avatarByEmail.get(email)) || (name && avatarByName.get(name)) || null;
  }

  const kpis = useMemo(() => {
    const openTickets = tickets.filter((t) => isOpenTicket(t.status)).length;
    const pendingReqs = reqs.filter((r) => isPendingStatus(r.status)).length;
    const fulfilled = reqs.filter((r) => {
      const s = String(r.status || '').toLowerCase();
      return s.includes('fulfill') || s.includes('completed');
    }).length;
    const approved = reqs.filter((r) => String(r.status || '').toLowerCase().includes('approved')).length;
    const resolved = tickets.filter((t) => String(t.status || '').toLowerCase().includes('resolved')).length;
    return {
      tickets: tickets.length,
      openTickets,
      resolved,
      reqs: reqs.length,
      pendingReqs,
      assets: assets.length,
      fulfilled,
      approved,
      procurement: procurement.length,
    };
  }, [tickets, reqs, assets, procurement]);

  const combinedTrend = useMemo(() => {
    const tSeries = buildTimeSeries(tickets, period, [{ key: 'tickets', pick: () => 1 }]);
    const rSeries = buildTimeSeries(reqs, period, [{ key: 'requests', pick: () => 1 }]);
    const tMap = Object.fromEntries(tSeries.map((x) => [x.key, x.tickets]));
    return rSeries.map((r) => ({
      label: r.label,
      key: r.key,
      tickets: tMap[r.key] || 0,
      requests: r.requests,
    }));
  }, [tickets, reqs, period]);

  const forecastBars = useMemo(() => {
    const hw = reqs.filter((r) => String(r.type || '').toLowerCase().includes('hardware')).length;
    const sw = reqs.filter((r) => String(r.type || '').toLowerCase().includes('software')).length;
    const other = Math.max(0, reqs.length - hw - sw);
    return [
      { name: 'Hardware', value: hw, fill: '#405189' },
      { name: 'Software', value: sw, fill: '#0ab39c' },
      { name: 'Other', value: other, fill: '#f7b84b' },
    ];
  }, [reqs]);

  const radarData = useMemo(() => {
    const cats = ['Microsoft 365', 'Network / VPN', 'Hardware', 'Software / OS', 'User Account'];
    return cats.map((cat) => ({
      subject: cat.replace(' / ', '\n').split(' ')[0],
      full: cat,
      count: tickets.filter((t) => String(t.category || '').includes(cat.split(' ')[0]) || t.category === cat).length,
    }));
  }, [tickets]);

  const ticketStatus = useMemo(() => countBy(tickets, (t) => t.status || 'Open', { top: 6 }), [tickets]);
  const ticketPriority = useMemo(() => countBy(tickets, (t) => t.priority || 'Normal', { top: 5 }), [tickets]);
  const topVendors = useMemo(
    () => countBy(procurement, (p) => p.vendor_name || p.vendorName || p.vendor || 'Unknown', { top: 6 }),
    [procurement]
  );

  const activityTable = useMemo(() => {
    const rows = [
      ...tickets.map((t) => ({
        id: pid(t),
        kind: 'Ticket',
        title: t.subject || 'Ticket',
        name: t.requester_name || t.requesterName || '—',
        email: t.requester_email || t.requesterEmail,
        status: t.status,
        when: t.created_timestamp || t.created_at,
        avatar: avatarOf(t),
      })),
      ...reqs.map((r) => ({
        id: pid(r),
        kind: 'Asset Request',
        title: r.item || 'Request',
        name: r.requester_name || r.requesterName || '—',
        email: r.requester_email || r.requesterEmail,
        status: r.status,
        when: r.created_timestamp || r.created_at,
        avatar: avatarOf(r),
      })),
    ]
      .sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))
      .slice(0, 8);
    return rows;
  }, [tickets, reqs, avatarByEmail, avatarByName]);

  const topUsersTable = useMemo(() => {
    const map = new Map();
    function bump(row, field) {
      const name = row.requester_name || row.requesterName || 'Unknown';
      const email = (row.requester_email || row.requesterEmail || '').toLowerCase();
      const key = email || name.toLowerCase();
      const cur = map.get(key) || {
        name,
        email,
        avatar: avatarOf(row),
        tickets: 0,
        requests: 0,
      };
      cur[field] += 1;
      map.set(key, cur);
    }
    tickets.forEach((t) => bump(t, 'tickets'));
    reqs.forEach((r) => bump(r, 'requests'));
    return [...map.values()]
      .map((u) => ({ ...u, total: u.tickets + u.requests }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [tickets, reqs, avatarByEmail, avatarByName]);

  const pendingQueue = useMemo(
    () => reqs.filter((r) => isPendingStatus(r.status)).slice(0, 6),
    [reqs]
  );

  const openTicketTasks = useMemo(
    () => tickets.filter((t) => isOpenTicket(t.status)).slice(0, 6),
    [tickets]
  );

  if (loading) {
    return (
      <div className="analytics-loading">
        <i className="fa-solid fa-chart-line fa-spin" />
        <span>Building analytics…</span>
      </div>
    );
  }

  const scopeLabel = !isElevated
    ? 'Your personal analytics'
    : scope === 'mine'
      ? 'Your personal analytics'
      : 'Organization-wide analytics';
  const showOrgTables = isElevated && scope === 'all';
  const combinedExport = seriesToExport(
    combinedTrend.map((r) => ({ Period: r.label, Tickets: r.tickets, 'Asset Requests': r.requests }))
  );

  return (
    <section className="analytics-section">
      <div className="analytics-section-header">
        <div>
          <h3 className="analytics-section-title">
            <i className="fa-solid fa-chart-pie" /> Analytics Hub
          </h3>
          <p className="analytics-section-sub">{scopeLabel}</p>
        </div>
        <div className="analytics-header-controls">
          {isElevated ? <ScopeToggle value={scope} onChange={setScope} /> : null}
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* KPI strip — 5 equal cards like Velzon */}
      <div className="analytics-kpi-grid analytics-kpi-grid-5">
        <Kpi label={useMine ? 'My Tickets' : 'Total Tickets'} value={kpis.tickets} icon="fa-ticket" tone="blue" hint={`${kpis.openTickets} open`} />
        <Kpi label="Resolved" value={kpis.resolved} icon="fa-circle-check" tone="green" hint="Closed successfully" />
        <Kpi label={useMine ? 'My Requests' : 'Asset Requests'} value={kpis.reqs} icon="fa-laptop" tone="cyan" hint={`${kpis.pendingReqs} pending`} />
        <Kpi label="Pending Approvals" value={kpis.pendingReqs} icon="fa-stamp" tone="amber" hint="Needs action" />
        <Kpi label={useMine ? 'My Assets' : 'Assets Assigned'} value={kpis.assets} icon="fa-boxes-stacked" tone="teal" hint="In inventory" />
      </div>

      {/* Row: 1/4 + 1/4 + 1/2 */}
      <div className="analytics-row analytics-row-1-1-2">
        <ChartCard
          title="Request Forecast"
          subtitle="By asset type"
          className="span-1"
          exportName="request-forecast"
          exportHeaders={['Type', 'Count']}
          exportRows={forecastBars.map((x) => [x.name, x.value])}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={forecastBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {forecastBars.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Ticket Mix"
          subtitle="Category radar"
          className="span-1"
          exportName="ticket-radar"
          exportHeaders={['Category', 'Count']}
          exportRows={radarData.map((x) => [x.full, x.count])}
        >
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border-color)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Radar name="Tickets" dataKey="count" stroke="#405189" fill="#405189" fillOpacity={0.45} />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Balance Overview"
          subtitle={`Tickets vs asset requests (${period})`}
          className="span-2"
          exportName={`balance-${period}`}
          exportHeaders={combinedExport.headers}
          exportRows={combinedExport.rows}
          actions={(
            <div className="analytics-mini-stats">
              <span><i className="fa-solid fa-ticket" style={{ color: '#2563eb' }} /> {kpis.tickets}</span>
              <span><i className="fa-solid fa-laptop" style={{ color: '#f59e0b' }} /> {kpis.reqs}</span>
            </div>
          )}
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={combinedTrend}>
              <defs>
                <linearGradient id="gBalT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gBalR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="tickets" name="Tickets" stroke="#2563eb" fill="url(#gBalT)" strokeWidth={2} />
              <Area type="monotone" dataKey="requests" name="Asset Requests" stroke="#f59e0b" fill="url(#gBalR)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: 2/3 table + 1/3 tasks */}
      <div className="analytics-row analytics-row-2-1">
        <ChartCard
          title={useMine ? 'My Recent Activity' : 'Recent Activity'}
          subtitle="Tickets & asset requests"
          className="span-2 analytics-card-table"
          exportName="recent-activity"
          exportHeaders={['ID', 'Type', 'Title', 'User', 'Status']}
          exportRows={activityTable.map((r) => [r.id, r.kind, r.title, r.name, r.status])}
        >
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>User</th>
                  <th>Title</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activityTable.length === 0 ? (
                  <tr><td colSpan={5} className="analytics-empty">No activity yet.</td></tr>
                ) : (
                  activityTable.map((r) => (
                    <tr key={`${r.kind}-${r.id}`}>
                      <td><strong>#{r.id}</strong></td>
                      <td><span className="analytics-chip">{r.kind}</span></td>
                      <td><UserAvatar name={r.name} src={r.avatar} size="table" /></td>
                      <td className="analytics-ellipsis">{r.title}</td>
                      <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title={useMine ? 'My Open Items' : 'Open Queue'}
          subtitle="Needs attention"
          className="span-1 analytics-card-list"
          exportName="open-queue"
          exportHeaders={['Type', 'ID', 'Title']}
          exportRows={[
            ...openTicketTasks.map((t) => ['Ticket', pid(t), t.subject || '']),
            ...pendingQueue.map((r) => ['Request', pid(r), r.item || '']),
          ]}
        >
          <ul className="analytics-task-list">
            {openTicketTasks.map((t) => (
              <li key={`t-${pid(t)}`}>
                <span className="analytics-task-dot blue" />
                <div>
                  <div className="analytics-task-title">{t.subject}</div>
                  <div className="analytics-task-meta">Ticket #{pid(t)} · {t.priority || 'Normal'}</div>
                </div>
              </li>
            ))}
            {pendingQueue.map((r) => (
              <li key={`r-${pid(r)}`}>
                <span className="analytics-task-dot amber" />
                <div>
                  <div className="analytics-task-title">{r.item}</div>
                  <div className="analytics-task-meta">Request #{pid(r)} · Pending</div>
                </div>
              </li>
            ))}
            {!openTicketTasks.length && !pendingQueue.length ? (
              <li className="analytics-empty">All clear — nothing pending.</li>
            ) : null}
          </ul>
        </ChartCard>
      </div>

      {/* Row: half + half */}
      <div className="analytics-row analytics-row-1-1">
        <ChartCard
          title="Ticket Status"
          subtitle="Distribution"
          className="span-1"
          exportName="ticket-status"
          exportHeaders={['Status', 'Count']}
          exportRows={ticketStatus.map((x) => [x.name, x.value])}
        >
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={ticketStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                {ticketStatus.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Priority Breakdown"
          subtitle="Support urgency"
          className="span-1"
          exportName="ticket-priority"
          exportHeaders={['Priority', 'Count']}
          exportRows={ticketPriority.map((x) => [x.name, x.value])}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ticketPriority} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {ticketPriority.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Full-width top users table (org-wide) or personal trend */}
      {showOrgTables ? (
        <div className="analytics-row analytics-row-2-1">
          <ChartCard
            title="Top Requesters"
            subtitle="Users by ticket + asset request volume"
            className="span-2 analytics-card-table"
            exportName="top-requesters"
            exportHeaders={['User', 'Email', 'Tickets', 'Requests', 'Total']}
            exportRows={topUsersTable.map((u) => [u.name, u.email, u.tickets, u.requests, u.total])}
          >
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Tickets</th>
                    <th>Asset Requests</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsersTable.length === 0 ? (
                    <tr><td colSpan={4} className="analytics-empty">No requesters yet.</td></tr>
                  ) : (
                    topUsersTable.map((u) => (
                      <tr key={u.email || u.name}>
                        <td><UserAvatar name={u.name} src={u.avatar} size="table" sub={u.email} /></td>
                        <td>{u.tickets}</td>
                        <td>{u.requests}</td>
                        <td><strong>{u.total}</strong></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {hasPermission('procurement_log') ? (
            <ChartCard
              title="Top Vendors"
              subtitle="Procurement"
              className="span-1"
              exportName="top-vendors"
              exportHeaders={['Vendor', 'Count']}
              exportRows={topVendors.map((x) => [x.name, x.value])}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topVendors}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="#ec4899" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : (
            <ChartCard
              title="Approved / Fulfilled"
              subtitle="Request outcomes"
              className="span-1"
              exportName="outcomes"
              exportHeaders={['Metric', 'Count']}
              exportRows={[['Approved', kpis.approved], ['Fulfilled', kpis.fulfilled], ['Pending', kpis.pendingReqs]]}
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={combinedTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      ) : (
        <ChartCard
          title="My Activity Trend"
          subtitle={`Daily / weekly / monthly (${period})`}
          className="span-full"
          exportName={`my-trend-${period}`}
          exportHeaders={combinedExport.headers}
          exportRows={combinedExport.rows}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={combinedTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="tickets" stroke="#2563eb" strokeWidth={2} />
              <Line type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </section>
  );
}
