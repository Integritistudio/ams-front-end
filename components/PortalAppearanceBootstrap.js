'use client';

import { useEffect } from 'react';
import { settingsApi } from '../services/api';
import {
  applyPortalAppearance,
  cachePortalAppearance,
  readCachedPortalAppearance,
} from '../lib/portalAppearance';

/**
 * Loads saved portal brand colors (primary / accent) so appearance survives refresh.
 * Text color is never taken from Settings — only light/dark theme CSS.
 */
export default function PortalAppearanceBootstrap() {
  useEffect(() => {
    const cached = readCachedPortalAppearance();
    if (cached) applyPortalAppearance(cached);
    // Always clear legacy --text-main even if cache is empty
    else document.documentElement.style.removeProperty('--text-main');

    let cancelled = false;
    settingsApi
      .get()
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        const colors = {
          color_primary: data.color_primary,
          color_accent: data.color_accent,
        };
        applyPortalAppearance(colors);
        cachePortalAppearance(colors);
      })
      .catch(() => {
        /* keep CSS defaults / cache */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
