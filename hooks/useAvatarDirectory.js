'use client';

import { useEffect, useMemo, useState } from 'react';
import { usersApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Loads active directory (when permitted) and exposes avatar lookup by email/name.
 */
export function useAvatarDirectory() {
  const { hasPermission, user } = useAuth();
  const [people, setPeople] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const canDir =
      hasPermission('tickets') ||
      hasPermission('requisitions') ||
      hasPermission('approvals') ||
      hasPermission('assign_assets') ||
      hasPermission('users') ||
      hasPermission('procurement_log');
    if (!canDir) {
      if (user) setPeople([user]);
      return undefined;
    }
    usersApi
      .directory()
      .then((res) => {
        if (!cancelled) setPeople(res.data || []);
      })
      .catch(() => {
        if (!cancelled && user) setPeople([user]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasPermission, user]);

  const byEmail = useMemo(() => {
    const m = new Map();
    people.forEach((p) => {
      if (p.email) m.set(String(p.email).toLowerCase(), p);
    });
    if (user?.email) m.set(String(user.email).toLowerCase(), { ...user, ...m.get(String(user.email).toLowerCase()) });
    return m;
  }, [people, user]);

  const byName = useMemo(() => {
    const m = new Map();
    people.forEach((p) => {
      if (p.name) m.set(String(p.name).toLowerCase(), p);
    });
    return m;
  }, [people]);

  function lookup({ email, name } = {}) {
    if (email && byEmail.has(String(email).toLowerCase())) return byEmail.get(String(email).toLowerCase());
    if (name && byName.has(String(name).toLowerCase())) return byName.get(String(name).toLowerCase());
    return null;
  }

  function avatarFor({ email, name } = {}) {
    return lookup({ email, name })?.avatar_url || null;
  }

  return { people, lookup, avatarFor };
}
