'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import DataLoader from '../../components/DataLoader';
import AccessDenied from '../../components/AccessDenied';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { settingsApi } from '../../services/api';

const DEFAULTS = {
  color_primary: '#2563eb',
  color_accent: '#06b6d4',
  color_text: '#f8fafc',
};

function applyCssVars(colors) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (colors.color_primary) root.style.setProperty('--primary', colors.color_primary);
  if (colors.color_accent) root.style.setProperty('--info', colors.color_accent);
  if (colors.color_text) root.style.setProperty('--text-main', colors.color_text);
}

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasPermission('settings')) return;
    settingsApi.get()
      .then((res) => {
        const data = res.data || DEFAULTS;
        setForm({
          color_primary: data.color_primary || DEFAULTS.color_primary,
          color_accent: data.color_accent || DEFAULTS.color_accent,
          color_text: data.color_text || DEFAULTS.color_text,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hasPermission]);

  function syncColor(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function applyColors(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update(form);
      applyCssVars(form);
      showToast('Applied', 'Portal colors updated.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Failed to apply settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetColors() {
    setForm(DEFAULTS);
    applyCssVars(DEFAULTS);
  }

  if (!hasPermission('settings')) {
    return (
      <AppShell title="Settings" subtitle="Portal appearance customization.">
        <AccessDenied moduleName="Settings" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" subtitle="Portal appearance & color customization.">
      <div className="account-card-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="account-main-box">
          <div className="account-section-heading">
            <i className="fa-solid fa-gear" /><span>Portal Appearance & Color Customization</span>
          </div>
          {loading ? (
            <DataLoader label="Loading settings..." />
          ) : (
            <form onSubmit={applyColors} autoComplete="off">
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Primary Color</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={form.color_primary}
                      onChange={(e) => syncColor('color_primary', e.target.value)}
                      style={{ width: 48, height: 38, borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={form.color_primary}
                      onChange={(e) => syncColor('color_primary', e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Accent Color</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={form.color_accent}
                      onChange={(e) => syncColor('color_accent', e.target.value)}
                      style={{ width: 48, height: 38, borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={form.color_accent}
                      onChange={(e) => syncColor('color_accent', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Text Color</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 320 }}>
                  <input
                    type="color"
                    value={form.color_text}
                    onChange={(e) => syncColor('color_text', e.target.value)}
                    style={{ width: 48, height: 38, borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    className="form-control"
                    value={form.color_text}
                    onChange={(e) => syncColor('color_text', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ margin: '20px 0' }}>
                <label style={{ marginBottom: 8, display: 'block' }}>Live Preview</label>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ flex: 1, height: 50, borderRadius: 8, background: form.color_primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13 }}>PRIMARY</div>
                  <div style={{ flex: 1, height: 50, borderRadius: 8, background: form.color_accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13 }}>ACCENT</div>
                  <div style={{ flex: 1, height: 50, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: form.color_text }}>TEXT COLOR</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={resetColors}>
                  <i className="fa-solid fa-rotate-left" /> Reset
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <i className="fa-solid fa-check" /> {saving ? 'Applying...' : 'Apply Colors'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
