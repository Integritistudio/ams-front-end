'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { settingsApi } from '../services/api';
import { isAuthPath } from '../lib/portalAppearance';
import {
  isSessionIdle,
  loadCachedSessionTimeoutMinutes,
  setSessionTimeoutMinutes,
  touchSessionActivity,
  SESSION_TIMEOUT_DEFAULT_MINUTES,
} from '../lib/sessionActivity';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

/**
 * Ends the session when there is no user interaction and no successful
 * authenticated API activity for session_timeout_minutes (Settings).
 */
export default function SessionIdleGuard() {
  const { isAuthenticated, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const loggingOut = useRef(false);

  useEffect(() => {
    loadCachedSessionTimeoutMinutes();
  }, []);

  useEffect(() => {
    if (loading || !isAuthenticated || isAuthPath(pathname || '')) return undefined;

    let cancelled = false;
    settingsApi
      .get()
      .then((res) => {
        if (cancelled) return;
        const minutes = Number(res.data?.session_timeout_minutes);
        setSessionTimeoutMinutes(
          Number.isFinite(minutes) && minutes > 0 ? minutes : SESSION_TIMEOUT_DEFAULT_MINUTES
        );
      })
      .catch(() => {
        if (!cancelled) setSessionTimeoutMinutes(SESSION_TIMEOUT_DEFAULT_MINUTES);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading, pathname]);

  useEffect(() => {
    if (loading || !isAuthenticated || isAuthPath(pathname || '')) return undefined;

    touchSessionActivity();
    loggingOut.current = false;

    let throttleUntil = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now < throttleUntil) return;
      throttleUntil = now + 1000;
      touchSessionActivity();
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));

    const tick = window.setInterval(async () => {
      if (loggingOut.current || !isSessionIdle()) return;
      loggingOut.current = true;
      try {
        await logout();
      } catch (_e) {
        /* ignore */
      }
      try {
        sessionStorage.setItem('integriti_session_timeout', '1');
      } catch (_e) {
        /* ignore */
      }
      router.replace('/login');
    }, 15000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      window.clearInterval(tick);
    };
  }, [isAuthenticated, loading, pathname, logout, router]);

  return null;
}
