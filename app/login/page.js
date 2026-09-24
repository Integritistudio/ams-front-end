'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authApi } from '../../services/api';
import DataLoader from '../../components/DataLoader';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem('integriti_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const remembered = localStorage.getItem('remember_email');
    if (remembered) {
      setEmail(remembered);
      setRemember(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated) router.replace('/dashboard');
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return <DataLoader variant="page" label="Checking session…" />;
  }

  if (isAuthenticated) {
    return <DataLoader variant="page" label="Opening dashboard…" />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      if (remember) localStorage.setItem('remember_email', email.trim());
      else localStorage.removeItem('remember_email');
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid corporate credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot() {
    if (!email.trim()) {
      setError('Enter your official email first, then click Forgot password.');
      return;
    }
    try {
      await authApi.forgotPassword(email.trim());
      setSuccess('If that email exists, a password reset link has been sent.');
      setError('');
      showToast('Password Reset', 'Check your email (or server console if SMTP is not configured).', 'info');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section id="section-login" style={{ display: 'flex' }}>
      <div className="login-container">
        <div className="brand-header">
          <img src="/integriti-logo.png" alt="Integriti Logo" className="brand-logo-img" />
          <h2>IT Service Desk</h2>
          <p>Log in with your corporate credentials</p>
        </div>

        {error ? <div className="alert-box alert-error" style={{ display: 'block' }}>{error}</div> : null}
        {success ? <div className="alert-box alert-success" style={{ display: 'block' }}>{success}</div> : null}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="userEmail">Official Email / User ID</label>
            <div className="input-wrapper">
              <i className="fa-regular fa-envelope input-icon" />
              <input
                type="text"
                id="userEmail"
                placeholder="name@integriti.io or integritistudio.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="userPassword">Password</label>
            <div className="input-wrapper">
              <i className="fa-solid fa-lock input-icon" />
              <input
                type={showPass ? 'text' : 'password'}
                id="userPassword"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <i
                className={`fa-regular ${showPass ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                onClick={() => setShowPass((v) => !v)}
              />
            </div>
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember me</span>
            </label>
            <a href="#" className="forgot-link" onClick={(e) => { e.preventDefault(); handleForgot(); }}>
              Forgot password?
            </a>
          </div>

          <button type="submit" className="btn btn-primary btn-submit" disabled={submitting}>
            {submitting ? (
              <><i className="fa-solid fa-spinner fa-spin" /><span>Signing In…</span></>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="login-footer">
          Supported corporate email domains are managed by your administrator.
        </div>
      </div>
    </section>
  );
}
