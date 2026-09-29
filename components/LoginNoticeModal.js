'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { ticketsApi, requisitionsApi } from '../services/api';
import { markLoginNoticeSeen, wasLoginNoticeSeen } from '../lib/loginNotice';

function isOpenTicket(t) {
  return !(t.status || '').toLowerCase().includes('resolved')
    && !(t.status || '').toLowerCase().includes('reject');
}

function isPendingReq(r) {
  return (r.status || '').toLowerCase().includes('pending');
}

function isProcQueue(r) {
  const s = (r.status || '').toLowerCase();
  return s.includes('approved') || s.includes('procurement') || s.includes('progress') || s.includes('hold');
}

export default function LoginNoticeModal() {
  const { user, role, isAuthenticated, loading, canViewAll, hasPermission } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('Welcome Overview');
  const [message, setMessage] = useState('');
  const [actionLabel, setActionLabel] = useState('Continue to Portal');
  const [actionHref, setActionHref] = useState('/dashboard');

  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (wasLoginNoticeSeen()) return;

    let cancelled = false;
    (async () => {
      try {
        const [tRes, rRes] = await Promise.all([
          hasPermission('tickets') ? ticketsApi.list({ silent: true }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          hasPermission('requisitions') || hasPermission('approvals') || hasPermission('procurement_log')
            ? requisitionsApi.list({ silent: true }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;

        const tickets = tRes.data || [];
        const reqs = rRes.data || [];
        const name = user.name || 'User';
        const email = (user.email || '').toLowerCase();
        const isSuperAdmin = Boolean(user.is_super_admin);
        const isItAdmin = Boolean(role?.is_it_admin);
        const nextItems = [];
        let nextAction = '/dashboard';
        let nextActionLabel = 'Continue to Portal';

        if (isSuperAdmin) {
          const activeTickets = tickets.filter(isOpenTicket);
          const pendingApprovals = reqs.filter(isPendingReq);
          const pendingProc = reqs.filter(isProcQueue);
          nextItems.push({
            tag: 'Super Admin Summary',
            icon: 'fa-crown',
            lines: [
              `Active / Open Tickets in System: ${activeTickets.length}`,
              `Pending Approvals in Queue: ${pendingApprovals.length}`,
              `IT / Procurement Queue Requests: ${pendingProc.length}`,
            ],
          });
          nextAction = '/dashboard';
        } else if (isItAdmin) {
          const activeTickets = tickets.filter(isOpenTicket);
          const pendingProc = reqs.filter(isProcQueue);
          nextItems.push({
            tag: 'IT Admin Summary',
            icon: 'fa-shield-halved',
            lines: [
              `Active / Open Tickets in System: ${activeTickets.length}`,
              `Pending Procurement Requests: ${pendingProc.length}`,
            ],
          });
          nextAction = '/tickets';
        } else if (canViewAll('tickets')) {
          const activeTickets = tickets.filter(isOpenTicket);
          const pendingApprovals = reqs.filter(isPendingReq);
          nextItems.push({
            tag: 'Management Overview',
            icon: 'fa-chart-line',
            lines: [
              `Active / Open Tickets: ${activeTickets.length}`,
              `Pending Approvals: ${pendingApprovals.length}`,
            ],
          });
          nextAction = hasPermission('approvals') ? '/approvals' : '/tickets';
          nextActionLabel = hasPermission('approvals') ? 'View Action Desk' : 'Continue to Portal';
        } else if (hasPermission('approvals')) {
          const pendingApprovals = reqs.filter((r) => {
            if (!isPendingReq(r)) return false;
            const lmId = r.line_manager_id ?? r.lineManagerId ?? r.approver_id ?? r.approverId;
            if (lmId && user.id && Number(lmId) === Number(user.id)) return true;
            return (r.approver_email || '').toLowerCase() === email
              || (r.line_manager_email || '').toLowerCase() === email;
          });
          nextItems.push({
            tag: 'Approval Queue',
            icon: 'fa-stamp',
            lines: [`Pending Requisitions for Your Sign-off: ${pendingApprovals.length}`],
          });
          nextAction = '/approvals';
          nextActionLabel = 'View Action Desk';
        } else {
          const userTickets = tickets.filter(
            (t) => (t.requester_email || '').toLowerCase() === email && isOpenTicket(t)
          );
          const userReqs = reqs.filter((r) => {
            const s = (r.status || '').toLowerCase();
            return (r.requester_email || '').toLowerCase() === email
              && !s.includes('fulfilled')
              && !s.includes('completed')
              && !s.includes('reject');
          });
          nextItems.push({
            tag: 'Your Personal Desk Summary',
            icon: 'fa-user-check',
            lines: [
              `Your Active Support Tickets: ${userTickets.length}`,
              `Your Open Asset Requisitions: ${userReqs.length}`,
            ],
          });
          nextAction = '/tickets';
        }

        setTitle(`Welcome Overview — ${name}`);
        setMessage(`Hello ${name}, here is your current IT Service Desk & Portal status:`);
        setItems(nextItems);
        setActionHref(nextAction);
        setActionLabel(nextActionLabel);
        setOpen(true);
      } catch (_e) {
        /* ignore notice failures */
      }
    })();

    return () => { cancelled = true; };
  }, [loading, isAuthenticated, user, role, canViewAll, hasPermission]);

  function dismiss() {
    markLoginNoticeSeen();
    setOpen(false);
  }

  function goAction() {
    markLoginNoticeSeen();
    setOpen(false);
    router.push(actionHref);
  }

  return (
    <Modal
      open={open}
      title={title}
      icon="fa-chart-line"
      onClose={dismiss}
      maxWidth={640}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={dismiss}>Dismiss</button>
          <button type="button" className="btn btn-primary" onClick={goAction}>
            <i className="fa-solid fa-arrow-right" /><span>{actionLabel}</span>
          </button>
        </>
      )}
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-main)', marginBottom: 14, lineHeight: 1.5 }}>{message}</p>
      <div className="exec-notice-list">
        {items.map((section) => (
          <div key={section.tag}>
            <div className="notice-section-tag">
              <i className={`fa-solid ${section.icon}`} /> {section.tag}
            </div>
            {section.lines.map((line) => (
              <div key={line} className="notice-card-item">
                <div><strong>{line.split(':')[0]}:</strong>{line.includes(':') ? line.slice(line.indexOf(':') + 1) : ''}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
