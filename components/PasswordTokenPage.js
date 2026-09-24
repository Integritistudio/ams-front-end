'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import DataLoader from './DataLoader';

function PasswordForm({ mode }) {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const router = useRouter();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem('integriti_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Missing or invalid token.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'setup') await authApi.setupPassword(token, password);
      else await authApi.resetPassword(token, password);
      showToast('Success', 'Password updated. You can sign in now.', 'success');
      router.push('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="section-login" style={{ display: 'flex' }}>
      <div className="login-container">
        <div className="brand-header">
          <img src="/integriti-logo.png" alt="Integriti Logo" className="brand-logo-img" />
          <h2>{mode === 'setup' ? 'Set Up Password' : 'Reset Password'}</h2>
          <p>Choose a secure password for your IT Service Desk account</p>
        </div>
        {error ? <div className="alert-box alert-error" style={{ display: 'block' }}>{error}</div> : null}
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <div className="input-wrapper">
              <i className="fa-solid fa-lock input-icon" />
              <input
                type={showPass ? 'text' : 'password'}
                id="newPassword"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <i
                className={`fa-regular ${showPass ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                onClick={() => setShowPass((v) => !v)}
                role="button"
                tabIndex={0}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowPass((v) => !v);
                  }
                }}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-wrapper">
              <i className="fa-solid fa-lock input-icon" />
              <input
                type={showConfirm ? 'text' : 'password'}
                id="confirmPassword"
                placeholder="••••••••"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <i
                className={`fa-regular ${showConfirm ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                onClick={() => setShowConfirm((v) => !v)}
                role="button"
                tabIndex={0}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowConfirm((v) => !v);
                  }
                }}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-submit" disabled={submitting}>
            {submitting ? (
              <><i className="fa-solid fa-spinner fa-spin" /><span>Saving…</span></>
            ) : (
              'Save Password'
            )}
          </button>
        </form>
      </div>
    </section>
  );
}

export function PasswordTokenPage({ mode }) {
  return (
    <Suspense fallback={<DataLoader variant="page" label="Loading…" />}>
      <PasswordForm mode={mode} />
    </Suspense>
  );
}
