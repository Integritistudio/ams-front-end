'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setToken } from '../services/api';
import { clearLoginNoticeFlag } from '../lib/loginNotice';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [permissionMeta, setPermissionMeta] = useState([]);
  const [loading, setLoading] = useState(true);

  const applyAuth = useCallback((data) => {
    setUser(data?.user || null);
    setRole(data?.role || null);
    setPermissions(data?.permissions || []);
    setPermissionMeta(data?.permissionMeta || []);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await authApi.me();
      applyAuth(res.data);
      return res.data;
    } catch (_e) {
      setToken(null);
      applyAuth(null);
      return null;
    }
  }, [applyAuth]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('helpdesk_token') : null;
    if (!token) {
      setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    setToken(res.data.token);
    clearLoginNoticeFlag();
    applyAuth(res.data);
    return res.data;
  }, [applyAuth]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (_e) {
      /* ignore */
    }
    setToken(null);
    clearLoginNoticeFlag();
    applyAuth(null);
  }, [applyAuth]);

  const hasPermission = useCallback(
    (slug) => permissions.includes(slug),
    [permissions]
  );

  const canViewAll = useCallback(
    (slug) => permissionMeta.some((p) => p.slug === slug && p.can_view_all),
    [permissionMeta]
  );

  const value = useMemo(
    () => ({
      user,
      role,
      permissions,
      permissionMeta,
      loading,
      login,
      logout,
      refresh,
      hasPermission,
      canViewAll,
      isAuthenticated: Boolean(user),
    }),
    [user, role, permissions, permissionMeta, loading, login, logout, refresh, hasPermission, canViewAll]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
