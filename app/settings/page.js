'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import DataLoader from '../../components/DataLoader';
import AccessDenied from '../../components/AccessDenied';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { settingsApi } from '../../services/api';
import {
  PORTAL_APPEARANCE_DEFAULTS,
  applyPortalAppearance,
  cachePortalAppearance,
} from '../../lib/portalAppearance';

const DEFAULTS = PORTAL_APPEARANCE_DEFAULTS;

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [encStatus, setEncStatus] = useState({ key_set: false, key_preview: null, source: 'none', message: '' });
  const [encLoading, setEncLoading] = useState(true);

  const [aiStatus, setAiStatus] = useState({ key_set: false, model: 'gemini-3.6-flash', source: 'none', provider: 'gemini' });
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiProvider, setAiProvider] = useState('gemini');
  const [aiModel, setAiModel] = useState('gemini-3.6-flash');
  const [showAiKey, setShowAiKey] = useState(false);

  const loadEnc = useCallback(async () => {
    setEncLoading(true);
    try {
      const res = await settingsApi.getFileEncryption();
      setEncStatus(res.data || { key_set: false });
    } catch (err) {
      showToast('Error', err.message || 'Failed to load encryption settings', 'error');
    } finally {
      setEncLoading(false);
    }
  }, [showToast]);

  const loadAi = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await settingsApi.getOpenAI();
      const data = res.data || {};
      setAiStatus(data);
      setAiProvider(data.provider || 'gemini');
      setAiModel(data.model || (data.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.6-flash'));
      setAiKey('');
    } catch (err) {
      showToast('Error', err.message || 'Failed to load AI settings', 'error');
    } finally {
      setAiLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!hasPermission('settings')) return;
    settingsApi.get()
      .then((res) => {
        const data = res.data || DEFAULTS;
        const colors = {
          color_primary: data.color_primary || DEFAULTS.color_primary,
          color_accent: data.color_accent || DEFAULTS.color_accent,
        };
        setForm(colors);
        applyPortalAppearance(colors);
        cachePortalAppearance(colors);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadEnc();
    loadAi();
  }, [hasPermission, loadEnc, loadAi]);

  function syncColor(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function applyColors(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update(form);
      applyPortalAppearance(form);
      cachePortalAppearance(form);
      showToast('Applied', 'Portal colors updated.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Failed to apply settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetColors() {
    setForm(DEFAULTS);
    applyPortalAppearance(DEFAULTS);
    cachePortalAppearance(DEFAULTS);
  }

  if (!hasPermission('settings')) {
    return (
      <AppShell title="Settings" subtitle="Portal appearance customization.">
        <AccessDenied moduleName="Settings" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" subtitle="Portal appearance, security & attachment encryption.">
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

              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>
                Text color follows Light / Dark mode automatically and is not customizable.
              </p>

              <div style={{ margin: '20px 0' }}>
                <label style={{ marginBottom: 8, display: 'block' }}>Live Preview</label>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ flex: 1, height: 50, borderRadius: 8, background: form.color_primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13 }}>PRIMARY</div>
                  <div style={{ flex: 1, height: 50, borderRadius: 8, background: form.color_accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13 }}>ACCENT</div>
                  <div style={{ flex: 1, height: 50, borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>THEME TEXT</div>
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

        <div className="account-main-box" style={{ marginTop: 20 }}>
          <div className="account-section-heading">
            <i className="fa-solid fa-wand-magic-sparkles" /><span>AI API Key (Improve with AI)</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Choose <strong>Gemini</strong> or <strong>OpenAI</strong>, then paste your API key for Subject / Description &quot;Improve with AI&quot;.
            Gemini keys often look like <code>AIza...</code> or <code>AQ....</code>; OpenAI keys start with <code>sk-</code>.
          </p>

          {aiLoading ? (
            <DataLoader label="Loading AI settings..." />
          ) : (
            <form
              autoComplete="off"
              onSubmit={async (e) => {
                e.preventDefault();
                setAiSaving(true);
                try {
                  const body = { model: aiModel, provider: aiProvider };
                  if (aiKey.trim()) body.api_key = aiKey.trim();
                  const res = await settingsApi.updateOpenAI(body);
                  setAiStatus(res.data || {});
                  setAiKey('');
                  showToast('Saved', res.message || 'AI settings saved.', 'success');
                } catch (err) {
                  showToast('Error', err.message || 'Could not save AI settings', 'error');
                } finally {
                  setAiSaving(false);
                }
              }}
            >
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Provider *</label>
                  <select
                    className="form-control form-control-select"
                    value={aiProvider}
                    onChange={(e) => {
                      const p = e.target.value;
                      setAiProvider(p);
                      setAiModel(p === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini');
                    }}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <input
                    className="form-control"
                    readOnly
                    value={
                      aiStatus.key_set
                        ? `Configured (${aiStatus.key_preview || '••••'})`
                        : aiStatus.source === 'env'
                          ? 'Using .env fallback'
                          : 'Not configured'
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Model</label>
                <input
                  className="form-control"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder={aiProvider === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4o-mini'}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {aiProvider === 'gemini'
                    ? 'Recommended: gemini-3.6-flash (older gemini-2.0-flash is deprecated)'
                    : 'Examples: gpt-4o-mini, gpt-4o'}
                </small>
              </div>
              <div className="form-group">
                <label>{aiStatus.key_set ? 'Replace API Key (leave blank to keep current)' : 'API Key *'}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-control"
                    type={showAiKey ? 'text' : 'password'}
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder={aiProvider === 'gemini' ? 'AIza... or AQ....' : 'sk-...'}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAiKey((v) => !v)}>
                    <i className={`fa-solid ${showAiKey ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                {aiStatus.key_set ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={aiSaving}
                    onClick={async () => {
                      if (!window.confirm('Clear AI API key from the database?')) return;
                      setAiSaving(true);
                      try {
                        const res = await settingsApi.updateOpenAI({
                          clear_key: true,
                          model: aiModel,
                          provider: aiProvider,
                        });
                        setAiStatus(res.data || {});
                        setAiKey('');
                        showToast('Cleared', res.message || 'Key cleared.', 'success');
                      } catch (err) {
                        showToast('Error', err.message || 'Could not clear key', 'error');
                      } finally {
                        setAiSaving(false);
                      }
                    }}
                  >
                    <i className="fa-solid fa-trash" /><span>Clear Key</span>
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={aiSaving || (!aiStatus.key_set && !aiKey.trim())}
                >
                  <i className="fa-solid fa-floppy-disk" />
                  <span>{aiSaving ? 'Saving...' : 'Save AI Settings'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="account-main-box" style={{ marginTop: 20 }}>
          <div className="account-section-heading">
            <i className="fa-solid fa-key" /><span>Attachment Encryption</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Ticket, requisition, and avatar files are encrypted (AES-256-GCM) in the database using
            {' '}<code>FILE_ENCRYPTION_KEY</code> from the server environment. The key is not stored in the UI.
            If the key is missing, uploads with attachments are blocked so documents are never saved under a weak fallback.
            Keep the same key — changing it makes older attachments unreadable.
          </p>

          {encLoading ? (
            <DataLoader label="Loading encryption status..." />
          ) : (
            <>
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Status</label>
                  <input
                    className="form-control"
                    readOnly
                    value={
                      encStatus.key_set
                        ? `Configured (${encStatus.key_preview || '••••'})`
                        : 'Not configured — set FILE_ENCRYPTION_KEY'
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Source</label>
                  <input
                    className="form-control"
                    readOnly
                    value={encStatus.key_set ? 'Environment (.env / hosting)' : 'None'}
                  />
                </div>
              </div>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  margin: 0,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${encStatus.key_set ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
                  background: encStatus.key_set ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  color: 'var(--text-main)',
                }}
              >
                {encStatus.message
                  || (encStatus.key_set
                    ? 'Encryption is ready. Attachments can be uploaded.'
                    : 'Set FILE_ENCRYPTION_KEY in backend .env (min. 16 characters), restart the API, then refresh this page.')}
              </p>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
