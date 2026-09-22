'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { notificationsApi } from '../services/api';
import DataLoader from './DataLoader';
import LoginNoticeModal from './LoginNoticeModal';
const NAV_ITEMS = [
  { href: '/dashboard', slug: 'dashboard', label: 'Home Dashboard', icon: 'fa-house' },
  { href: '/tickets', slug: 'tickets', label: 'My Tickets', icon: 'fa-ticket', adminLabel: 'All Tickets' },
  { href: '/requisitions', slug: 'requisitions', label: 'Asset Requests', icon: 'fa-cart-flatbed' },
  { href: '/approvals', slug: 'approvals', label: 'Pending Approvals', icon: 'fa-clipboard-check', badge: true },
  { href: '/my-assets', slug: 'my_assets', label: 'Assigned Assets', icon: 'fa-laptop-code' },
  { href: '/procurement', slug: 'procurement_log', label: 'Procurement Log', icon: 'fa-file-invoice-dollar' },
  { href: '/logs', slug: 'logs', label: 'My Logs', icon: 'fa-clock-rotate-left' },
  { href: '/account', slug: 'account', label: 'My Account', icon: 'fa-user-gear' },
  { href: '/knowledge-base', slug: 'knowledge_base', label: 'Knowledge Base', icon: 'fa-book-open' },
];

const ADMIN_ITEMS = [
  { href: '/assign-assets', slug: 'assign_assets', label: 'Assign Assets', icon: 'fa-box-open' },
  { href: '/vendors', slug: 'vendors', label: 'Approved Vendors', icon: 'fa-store' },
  { href: '/settings', slug: 'settings', label: 'Settings', icon: 'fa-gear' },
  { href: '/users', slug: 'users', label: 'User Management', icon: 'fa-users-gear' },
  { href: '/roles', slug: 'roles', label: 'Role Management', icon: 'fa-user-shield' },
  { href: '/email-settings', slug: 'email_settings', label: 'Email Settings', icon: 'fa-envelope-open-text' },
];

export default function AppShell({ children, title, subtitle, actions }) {
  const { user, role, loading, isAuthenticated, hasPermission, canViewAll, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [clock, setClock] = useState('');
  const [theme, setTheme] = useState('dark');
  const [shiftStart] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/login');
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    const t = localStorage.getItem('integriti_theme') || 'dark';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const elapsedMs = Date.now() - shiftStart;
      const hrs = Math.floor(elapsedMs / 3600000).toString().padStart(2, '0');
      const mins = Math.floor((elapsedMs % 3600000) / 60000).toString().padStart(2, '0');
      setClock(`${timeStr} (Shift: ${hrs}h ${mins}m)`);
    }, 1000);
    return () => clearInterval(id);
  }, [shiftStart]);

  useEffect(() => {
    if (!isAuthenticated) return;
    notificationsApi.list().then((res) => setNotifs(res.data || [])).catch(() => {});
  }, [isAuthenticated, pathname]);

  const adminVisible = useMemo(
    () => ADMIN_ITEMS.some((i) => hasPermission(i.slug)),
    [hasPermission]
  );

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('integriti_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  async function confirmLogout() {
    await logout();
    setLogoutOpen(false);
    router.replace('/login');
  }

  async function clearNotifs() {
    await notificationsApi.clear();
    setNotifs([]);
    showToast('Cleared', 'Notifications cleared.', 'info');
  }

  if (loading || !isAuthenticated) {
    return <DataLoader variant="page" label="Loading portal…" />;
  }

  const ticketsLabel = canViewAll('tickets') ? 'All Tickets' : 'My Tickets';

  return (
    <section id="section-dashboard" style={{ display: 'flex' }}>
      <header className="dashboard-header">
        <div className="nav-brand-container">
          <button
            className="menu-toggle-btn"
            aria-label="Toggle Navigation Menu"
            onClick={() => {
              if (window.innerWidth <= 960) setSidebarOpen((v) => !v);
              else setSidebarCollapsed((v) => !v);
            }}
          >
            <i className="fa-solid fa-bars" />
          </button>
          <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => router.push('/dashboard')} title="Go to Dashboard">
            <img src="/integriti-logo.png" alt="Integriti" className="nav-logo" />
            <div className="nav-title">Integriti IT Helpdesk</div>
          </div>
        </div>

        <div className="header-right-actions">
          <button className="header-icon-btn" onClick={() => router.push('/dashboard')} title="Home Dashboard">
            <i className="fa-solid fa-house" />
          </button>
          <div className="live-clock-badge" title="Real-time Clock & Active Shift Elapsed Time">
            <i className="fa-solid fa-clock-rotate-left" />
            <span>{clock || '00:00:00'}</span>
          </div>

          <div className={`notif-dropdown-container ${notifOpen ? 'open' : ''}`}>
            <button className="header-icon-btn" title="Notifications" onClick={(e) => { e.stopPropagation(); setNotifOpen((v) => !v); setProfileOpen(false); }}>
              <i className="fa-regular fa-bell" />
              {notifs.length > 0 ? <span className="notif-badge">{notifs.length}</span> : null}
            </button>
            <div className="notif-dropdown-menu">
              <div className="notif-header">
                <div className="notif-title"><i className="fa-solid fa-bell" /> Notifications</div>
                <button className="btn-clear-notifs" onClick={clearNotifs}>Clear All</button>
              </div>
              <div className="notif-list">
                {notifs.length === 0 ? (
                  <div className="notif-empty">No recent notifications.</div>
                ) : (
                  notifs.map((n) => (
                    <div className="notif-item" key={n.id || n.public_id}>
                      <div className={`notif-icon ${n.type || 'info'}`}><i className="fa-solid fa-bell" /></div>
                      <div className="notif-content">
                        <div className="notif-subject">{n.subject}</div>
                        <div className="notif-text">{n.text}</div>
                        <div className="notif-time">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={`user-dropdown-container ${profileOpen ? 'open' : ''}`}>
            <div className="user-profile-widget" onClick={(e) => { e.stopPropagation(); setProfileOpen((v) => !v); setNotifOpen(false); }}>
              <img
                className="header-avatar"
                alt="User"
                src={user.avatar_url || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>"}
              />
              <div className="user-details">
                <div className="user-name">{user.name}</div>
                <div className="user-dept">{user.email}</div>
              </div>
              <i className="fa-solid fa-chevron-down dropdown-arrow" />
            </div>
            <div className="profile-dropdown-menu">
              <div className="dropdown-header">
                <div className="dropdown-user-title">{user.name}</div>
                <div className="dropdown-user-sub">{user.email}</div>
              </div>
              <div className="dropdown-divider" />
              <Link href="/dashboard" className="dropdown-item" onClick={() => setProfileOpen(false)}>
                <i className="fa-solid fa-house" /><span>Home Dashboard</span>
              </Link>
              <Link href="/account" className="dropdown-item" onClick={() => setProfileOpen(false)}>
                <i className="fa-solid fa-user-gear" /><span>My Account</span>
              </Link>
              <a href="#" className="dropdown-item" onClick={(e) => { e.preventDefault(); toggleTheme(); }}>
                <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`} />
                <span>{theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}</span>
              </a>
              <div className="dropdown-divider" />
              <a href="#" className="dropdown-item text-danger" onClick={(e) => { e.preventDefault(); setLogoutOpen(true); setProfileOpen(false); }}>
                <i className="fa-solid fa-arrow-right-from-bracket" /><span>Logout</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="app-workspace" onClick={() => { setProfileOpen(false); setNotifOpen(false); }}>
        <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'open' : ''}`} id="appSidebar">
          <div className="sidebar-heading">Navigation</div>
          <ul className="sidebar-menu">
            {NAV_ITEMS.filter((i) => hasPermission(i.slug)).map((item) => (
              <li key={item.href} className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}>
                <Link href={item.href} className="sidebar-nav-link" onClick={() => setSidebarOpen(false)}>
                  <i className={`fa-solid ${item.icon}`} />
                  <span className="nav-text">{item.slug === 'tickets' ? ticketsLabel : item.label}</span>
                </Link>
              </li>
            ))}

            {adminVisible ? (
              <>
                <div className="sidebar-heading" style={{ marginTop: 14 }}>IT Admin Controls</div>
                {ADMIN_ITEMS.filter((i) => hasPermission(i.slug)).map((item) => (
                  <li key={item.href} className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}>
                    <Link href={item.href} className="sidebar-nav-link" onClick={() => setSidebarOpen(false)}>
                      <i className={`fa-solid ${item.icon}`} />
                      <span className="nav-text">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </>
            ) : null}

            <li className="sidebar-item" style={{ marginTop: 12 }}>
              <a href="#" className="sidebar-nav-link" onClick={(e) => { e.preventDefault(); toggleTheme(); }}>
                <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`} />
                <span className="nav-text">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
              </a>
            </li>
          </ul>
        </aside>

        <main className="dashboard-body">
          <div className="greeting-banner">
            <div>
              <h1>{title || `Welcome, ${(user.name || 'User').split(' ')[0]}`}</h1>
              <p>{subtitle || 'Centralized IT Helpdesk & Asset Procurement Portal.'}</p>
            </div>
            {actions ? <div className="action-button-group">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>

      {logoutOpen ? (
        <div className="modal-overlay active">
          <div className="modal-card" style={{ maxWidth: 380, textAlign: 'center', borderRadius: 14 }}>
            <div className="modal-body" style={{ padding: '26px 20px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24, color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-question" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Logout?</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 24 }}>Are you sure you want to logout?</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setLogoutOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={confirmLogout}>Yes, Logout</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <LoginNoticeModal />
    </section>
  );
}
