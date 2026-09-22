'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { ticketsApi, requisitionsApi } from '../../services/api';
import DataLoader from '../../components/DataLoader';

const HUB_TILES = [
  {
    href: '/tickets',
    slug: 'tickets',
    title: 'Support Tickets Desk',
    desc: 'Raise technical support requests, track SLA progress, and communicate with IT.',
    icon: 'fa-ticket',
    color: 'rgba(37,99,235,0.15)',
    iconColor: 'var(--primary)',
  },
  {
    href: '/requisitions',
    slug: 'requisitions',
    title: 'Asset Requests',
    desc: 'Requisition hardware equipment or software licenses with management approval.',
    icon: 'fa-laptop',
    color: 'rgba(16,185,129,0.15)',
    iconColor: 'var(--success)',
  },
  {
    href: '/approvals',
    slug: 'approvals',
    title: 'Pending Approvals',
    desc: 'Review pending requisitions, approve for IT procurement, or manage fulfillment.',
    icon: 'fa-clipboard-check',
    color: 'rgba(245,158,11,0.15)',
    iconColor: 'var(--warning)',
  },
  {
    href: '/my-assets',
    slug: 'my_assets',
    title: 'Assigned Assets',
    desc: 'View physical assets and software licenses assigned to your user account.',
    icon: 'fa-laptop-code',
    color: 'rgba(6,182,212,0.15)',
    iconColor: 'var(--info)',
  },
  {
    href: '/procurement',
    slug: 'procurement_log',
    title: 'Procurement Log',
    desc: 'Inspect vendor purchase records, asset delivery confirmations, and history.',
    icon: 'fa-file-invoice-dollar',
    color: 'rgba(139,92,246,0.15)',
    iconColor: '#8b5cf6',
  },
  {
    href: '/logs',
    slug: 'logs',
    title: 'My Activity Logs',
    desc: 'Inspect full audit trail of state updates, SLA holds, and approvals.',
    icon: 'fa-clock-rotate-left',
    color: 'rgba(239,68,68,0.15)',
    iconColor: 'var(--danger)',
  },
];

export default function DashboardPage() {
  const { hasPermission, user } = useAuth();
  const router = useRouter();
  const [ticketCount, setTicketCount] = useState(0);
  const [reqCount, setReqCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ticketDisclaimer, setTicketDisclaimer] = useState(false);
  const [reqDisclaimer, setReqDisclaimer] = useState(false);

  useEffect(() => {
    if (!hasPermission('dashboard')) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tRes, rRes] = await Promise.all([
          hasPermission('tickets') ? ticketsApi.list() : Promise.resolve({ data: [] }),
          hasPermission('requisitions') || hasPermission('approvals')
            ? requisitionsApi.list()
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const tickets = tRes.data || [];
        const reqs = rRes.data || [];
        setTicketCount(tickets.length);
        setReqCount(reqs.length);
        const pending = reqs.filter((r) => {
          const status = r.status || '';
          const isPending = status.toLowerCase().includes('pending');
          if (!isPending) return false;
          if (hasPermission('approvals')) {
            const approverId = r.approver_id ?? r.approverId;
            if (approverId && user?.id && Number(approverId) === Number(user.id)) return true;
            return true;
          }
          return false;
        });
        setPendingCount(pending.length);
      } catch (_e) {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasPermission, user]);

  const visibleTiles = useMemo(
    () => HUB_TILES.filter((t) => hasPermission(t.slug)),
    [hasPermission]
  );

  if (!hasPermission('dashboard')) {
    return (
      <AppShell title="Home Dashboard" subtitle="Centralized IT Helpdesk & Asset Procurement Portal.">
        <AccessDenied moduleName="the Home Dashboard" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Welcome, ${(user?.name || 'User').split(' ')[0]}`}
      subtitle="Centralized IT Helpdesk & Asset Procurement Portal."
      actions={(
        <>
          {hasPermission('tickets') ? (
            <button type="button" className="btn btn-primary" onClick={() => setTicketDisclaimer(true)}>
              <i className="fa-solid fa-plus" /><span>Create New Ticket</span>
            </button>
          ) : null}
          {hasPermission('requisitions') ? (
            <button type="button" className="btn btn-primary" onClick={() => setReqDisclaimer(true)}>
              <i className="fa-solid fa-plus" /><span>New Request</span>
            </button>
          ) : null}
        </>
      )}
    >
      {loading ? (
        <DataLoader label="Loading dashboard…" />
      ) : (
      <>
      <div className="metrics-grid" style={{ marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-info">
            <h3>My / All Tickets</h3>
            <div className="counter">{ticketCount}</div>
          </div>
          <div className="metric-icon icon-total"><i className="fa-solid fa-ticket" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <h3>Asset Requisitions</h3>
            <div className="counter">{reqCount}</div>
          </div>
          <div className="metric-icon icon-progress"><i className="fa-solid fa-cart-flatbed" /></div>
        </div>
        <div className="metric-card">
          <div className="metric-info">
            <h3>Pending Actions</h3>
            <div className="counter">{pendingCount}</div>
          </div>
          <div className="metric-icon icon-urgent"><i className="fa-solid fa-stamp" /></div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'var(--text-main)' }}>
        Portal Modules & Quick Hub
      </h3>
      <div className="hub-tiles-grid">
        {visibleTiles.map((tile) => (
          <div
            key={tile.href}
            className="hub-tile-card"
            role="button"
            tabIndex={0}
            onClick={() => router.push(tile.href)}
            onKeyDown={(e) => { if (e.key === 'Enter') router.push(tile.href); }}
          >
            <div className="hub-tile-icon" style={{ background: tile.color, color: tile.iconColor }}>
              <i className={`fa-solid ${tile.icon}`} />
            </div>
            <div className="hub-tile-title">{tile.title}</div>
            <div className="hub-tile-desc">{tile.desc}</div>
          </div>
        ))}
      </div>
      </>
      )}

      <Modal
        open={ticketDisclaimer}
        title="Support Ticket Disclaimer"
        icon="fa-circle-info"
        onClose={() => setTicketDisclaimer(false)}
        maxWidth={440}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setTicketDisclaimer(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setTicketDisclaimer(false);
                router.push('/tickets?create=1');
              }}
            >
              Proceed to Ticket Form
            </button>
          </>
        )}
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-main)' }}>
          Please use this button only if you encounter a technical or IT-related issue while performing your work,
          such as problems with VPN access, Outlook, laptop functionality, or software errors, and require assistance from IT Support.
        </p>
      </Modal>

      <Modal
        open={reqDisclaimer}
        title="Asset Request Disclaimer"
        icon="fa-circle-info"
        onClose={() => setReqDisclaimer(false)}
        maxWidth={440}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setReqDisclaimer(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setReqDisclaimer(false);
                router.push('/requisitions?create=1');
              }}
            >
              Proceed to Request Form
            </button>
          </>
        )}
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-main)' }}>
          Please utilize this button exclusively for submitting requests related to the acquisition of new hardware,
          the procurement of new software licenses, or gaining access to software or systems that have already been purchased.
        </p>
      </Modal>
    </AppShell>
  );
}
