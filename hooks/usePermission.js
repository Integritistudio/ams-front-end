'use client';

import { useAuth } from '../context/AuthContext';

export function usePermission(slug) {
  const { hasPermission, canViewAll, permissions, loading } = useAuth();
  return {
    allowed: hasPermission(slug),
    canViewAll: canViewAll(slug),
    permissions,
    loading,
  };
}
