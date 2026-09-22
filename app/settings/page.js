'use client';

import { useCallback, useEffect, useState } from 'react';
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

  const [encStatus, setEncStatus] = useState({ key_set: false, key_preview: null, source: 'fallback' });
  const [encLoading, setEncLoading] = useState(true);
  const [encSaving, setEncSaving] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [showKey, setShowKey] = useState(false);

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
        setForm({
          color_primary: data.color_primary || DEFAULTS.color_primary,
          color_accent: data.color_accent || DEFAULTS.color_accent,
          color_text: data.color_text || DEFAULTS.color_text,
        });
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

  async function generateAndSaveKey() {
    if (encStatus.key_set) {
      const ok = window.confirm(
        'Generating a new key will make previously uploaded attachments unreadable. Continue?'
      );
      if (!ok) return;
    }
    setEncSaving(true);
    setGeneratedKey('');
    try {
      const res = await settingsApi.updateFileEncryption({ generate: true });
      setEncStatus(res.data || {});
      if (res.data?.generated_key) {
        setGeneratedKey(res.data.generated_key);
        setShowKey(true);
      }
      showToast('Key Saved', res.message || 'Encryption key generated and saved.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not generate key', 'error');
    } finally {
      setEncSaving(false);
    }
  }

  async function saveManualKey(e) {
    e.preventDefault();
    if (!manualKey.trim() || manualKey.trim().length < 16) {
      showToast('Invalid', 'Key must be at least 16 characters.', 'warning');
      return;
    }
    if (encStatus.key_set) {
      const ok = window.confirm(
        'Changing the key will make previously uploaded attachments unreadable. Continue?'
      );
      if (!ok) return;
    }
    setEncSaving(true);
    try {
      const res = await settingsApi.updateFileEncryption({ encryption_key: manualKey.trim() });
      setEncStatus(res.data || {});
      setManualKey('');
      setGeneratedKey('');
      showToast('Saved', res.message || 'Encryption key saved.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not save key', 'error');
    } finally {
      setEncSaving(false);
    }
  }

  async function clearKey() {
    const ok = window.confirm('Clear the database encryption key? New uploads will use env/fallback until you set a key again.');
    if (!ok) return;
    setEncSaving(true);
    try {
      const res = await settingsApi.clearFileEncryption();
      setEncStatus(res.data || {});
      setGeneratedKey('');
      showToast('Cleared', res.message || 'Key cleared.', 'success');
    } catch (err) {
      showToast('Error', err.message || 'Could not clear key', 'error');
    } finally {
      setEncSaving(false);
    }
  }

  async function copyGenerated() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      showToast('Copied', 'Encryption key copied to clipboard.', 'success');
    } catch (_e) {
      showToast('Copy failed', 'Select and copy the key manually.', 'warning');
    }
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
            <i className="fa-solid fa-key" /><span>Ticket Attachment Encryption Key</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Uploaded ticket files are encrypted (AES-256-GCM) in the database. Set the key here as an admin — no need to put it in <code>.env</code>.
            Changing or regenerating the key will prevent decrypting older attachments.
          </p>

          {encLoading ? (
            <DataLoader label="Loading encryption settings..." />
          ) : (
            <>
              <div className="form-grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label>Status</label>
                  <input
                    className="form-control"
                    readOnly
                    value={encStatus.key_set ? `Configured (${encStatus.key_preview || '••••'})` : 'Not set in database'}
                  />
                </div>
                <div className="form-group">
                  <label>Active Source</label>
                  <input
                    className="form-control"
                    readOnly
                    value={
                      encStatus.source === 'database'
                        ? 'Database (admin UI)'
                        : encStatus.source === 'env'
                          ? 'Environment (.env fallback)'
                          : 'Built-in fallback (set a key)'
                    }
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={encSaving}
                  onClick={generateAndSaveKey}
                >
                  <i className="fa-solid fa-wand-magic-sparkles" />
                  <span>{encSaving ? 'Saving...' : 'Generate & Save New Key'}</span>
                </button>
                {encStatus.key_set ? (
                  <button type="button" className="btn btn-secondary" disabled={encSaving} onClick={clearKey}>
                    <i className="fa-solid fa-trash" /><span>Clear DB Key</span>
                  </button>
                ) : null}
              </div>

              {generatedKey ? (
                <div
                  className="form-group"
                  style={{
                    background: 'rgba(37,99,235,0.06)',
                    border: '1px solid rgba(37,99,235,0.2)',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <label style={{ fontWeight: 700, color: 'var(--primary)' }}>
                    New key (copy & store securely — shown once)
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="form-control"
                      readOnly
                      type={showKey ? 'text' : 'password'}
                      value={generatedKey}
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowKey((v) => !v)}>
                      <i className={`fa-solid ${showKey ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copyGenerated}>
                      <i className="fa-solid fa-copy" />
                    </button>
                  </div>
                </div>
              ) : null}

              <form onSubmit={saveManualKey} autoComplete="off">
                <div className="form-group">
                  <label>Or paste your own key (min. 16 characters)</label>
                  <input
                    className="form-control"
                    type="password"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    placeholder="Paste existing key or create your own secret string"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={encSaving || !manualKey.trim()}>
                    <i className="fa-solid fa-floppy-disk" /><span>{encSaving ? 'Saving...' : 'Save Key'}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
