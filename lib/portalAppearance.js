/** Portal appearance CSS variables — shared by Settings and app bootstrap. */

export const PORTAL_APPEARANCE_DEFAULTS = {
  color_primary: '#2563eb',
  color_accent: '#06b6d4',
  color_text: '#f8fafc',
};

const CACHE_KEY = 'integriti_portal_appearance';

function darkenHex(hex, amount = 0.15) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function applyPortalAppearance(colors = {}) {
  if (typeof document === 'undefined') return;
  const primary = colors.color_primary || PORTAL_APPEARANCE_DEFAULTS.color_primary;
  const accent = colors.color_accent || PORTAL_APPEARANCE_DEFAULTS.color_accent;
  const text = colors.color_text || PORTAL_APPEARANCE_DEFAULTS.color_text;
  const root = document.documentElement;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-hover', darkenHex(primary));
  root.style.setProperty('--info', accent);
  root.style.setProperty('--text-main', text);
}

export function cachePortalAppearance(colors) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        color_primary: colors.color_primary || PORTAL_APPEARANCE_DEFAULTS.color_primary,
        color_accent: colors.color_accent || PORTAL_APPEARANCE_DEFAULTS.color_accent,
        color_text: colors.color_text || PORTAL_APPEARANCE_DEFAULTS.color_text,
      })
    );
  } catch (_e) {
    /* ignore quota */
  }
}

export function readCachedPortalAppearance() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      color_primary: parsed.color_primary || PORTAL_APPEARANCE_DEFAULTS.color_primary,
      color_accent: parsed.color_accent || PORTAL_APPEARANCE_DEFAULTS.color_accent,
      color_text: parsed.color_text || PORTAL_APPEARANCE_DEFAULTS.color_text,
    };
  } catch (_e) {
    return null;
  }
}
