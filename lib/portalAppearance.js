/** Portal appearance CSS variables — shared by Settings and app bootstrap. */

export const PORTAL_APPEARANCE_DEFAULTS = {
  color_primary: '#2563eb',
  color_accent: '#06b6d4',
};

/** Auth screens use light/dark theme tokens only (see #section-login in CSS). */
export const AUTH_PATH_PREFIXES = ['/login', '/setup-password', '/reset-password'];

const CACHE_KEY = 'integriti_portal_appearance';

export function isAuthPath(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  return AUTH_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function darkenHex(hex, amount = 0.15) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Apply brand colors. Text always follows light/dark theme CSS — never Settings. */
export function applyPortalAppearance(colors = {}) {
  if (typeof document === 'undefined') return;
  const primary = colors.color_primary || PORTAL_APPEARANCE_DEFAULTS.color_primary;
  const accent = colors.color_accent || PORTAL_APPEARANCE_DEFAULTS.color_accent;
  const root = document.documentElement;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-hover', darkenHex(primary));
  root.style.setProperty('--info', accent);
  // Clear any legacy inline --text-main from older builds / cache
  root.style.removeProperty('--text-main');
}

export function cachePortalAppearance(colors) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        color_primary: colors.color_primary || PORTAL_APPEARANCE_DEFAULTS.color_primary,
        color_accent: colors.color_accent || PORTAL_APPEARANCE_DEFAULTS.color_accent,
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
    };
  } catch (_e) {
    return null;
  }
}
