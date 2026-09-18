'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import DataLoader from '../components/DataLoader';

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated ? '/dashboard' : '/login');
  }, [isAuthenticated, loading, router]);

  return <DataLoader variant="page" label="Starting Integriti Helpdesk…" />;
}
