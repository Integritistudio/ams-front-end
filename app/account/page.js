'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authApi } from '../../services/api';

export default function AccountPage() {
  const { hasPermission, user, role, refresh } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState({ name: '', phone: '', department: '', email: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name || '',
      phone: user.phone || '',
      department: user.department || '',
      email: user.email || '',
    });
  }, [user]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      await authApi.updateProfile({
        name: profile.name,
        phone: profile.phone,
      });
      await refresh();
      showToast('Profile Saved', 'Your profile details were updated.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not update profile', 'danger');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (passwords.newPassword.length < 6) {
      showToast('Invalid', 'New password must be at least 6 characters.', 'warning');
      return;
    }
    if (passwords.newPassword !== passwords.confirm) {
      showToast('Mismatch', 'New password and confirmation do not match.', 'warning');
      return;
    }
    setSavingPass(true);
    try {
      await authApi.changePassword(passwords.currentPassword, passwords.newPassword);
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      showToast('Password Updated', 'Your corporate password was changed.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not change password', 'error');
    } finally {
      setSavingPass(false);
    }
  }

  if (!hasPermission('account')) {
    return (
      <AppShell title="My Account" subtitle="Profile and password settings.">
        <AccessDenied moduleName="My Account" />
      </AppShell>
    );
  }

  return (
    <AppShell title="My Account" subtitle="Manage your profile and corporate password.">
      <div className="account-card-grid">
        <div className="account-sidebar-box">
          <div className="avatar-wrapper">
            <img
              className="avatar-preview-img"
              alt="Profile"
              src={
                user?.avatar_url ||
                "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>"
              }
            />
          </div>
          <h3 style={{ fontSize: 18, marginBottom: 4, color: 'var(--text-main)' }}>{user?.name}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{user?.department || '—'}</p>
          <span className="badge badge-open">{role?.name || 'User'}</span>
        </div>

        <div className="account-main-box">
          <div className="account-section-heading">
            <i className="fa-regular fa-id-badge" /><span>Personal & Work Details</span>
          </div>
          <form onSubmit={saveProfile} autoComplete="off" style={{ marginBottom: 32 }}>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  className="form-control"
                  required
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Official Email</label>
                <input className="form-control" disabled value={profile.email} />
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Department</label>
                <input className="form-control" disabled value={profile.department} />
              </div>
              <div className="form-group">
                <label>Contact Phone / Extension</label>
                <input
                  className="form-control"
                  placeholder="+92 300 1234567"
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                <i className="fa-solid fa-floppy-disk" />
                <span>{savingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>

          <div className="account-section-heading">
            <i className="fa-solid fa-key" /><span>Change Corporate Password</span>
          </div>
          <form onSubmit={changePassword} autoComplete="off">
            <div className="form-group">
              <label>Current Password *</label>
              <input
                type="password"
                className="form-control"
                required
                placeholder="••••••••"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>New Password *</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="At least 6 characters"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password *</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="Re-enter new password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={savingPass}>
                <i className="fa-solid fa-shield" />
                <span>{savingPass ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
