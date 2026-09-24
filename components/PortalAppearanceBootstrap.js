'use client';

import { useEffect } from 'react';
import { settingsApi } from '../services/api';
import {
  applyPortalAppearance,
  cachePortalAppearance,
  readCachedPortalAppearance,
} from '../lib/portalAppearance';

/**
 * Loads saved portal colors from the API (and local cache) so appearance
 * survives a full page refresh — Settings only applied vars in-session before.
 */
export default function PortalAppearanceBootstrap() {
  useEffect(() => {
    const cached = readCachedPortalAppearance();
    if (cached) applyPortalAppearance(cached);

    let cancelled = false;
    settingsApi
      .get()
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        const colors = {
          color_primary: data.color_primary,
          color_accent: data.color_accent,
          color_text: data.color_text,
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
