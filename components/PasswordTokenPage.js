'use client';

import { Suspense, useState } from 'react';
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
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
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
