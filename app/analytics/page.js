'use client';

import AppShell from '../../components/AppShell';
import AccessDenied from '../../components/AccessDenied';
import DashboardAnalytics from '../../components/DashboardAnalytics';
import { useAuth } from '../../context/AuthContext';

export default function AnalyticsPage() {
  const { hasPermission, user } = useAuth();

  if (!hasPermission('analytics') && !hasPermission('dashboard')) {
    return (
      <AppShell title="Analytics" subtitle="Charts, trends, and exportable reports.">
        <AccessDenied moduleName="Analytics" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Analytics"
      subtitle={`${(user?.name || 'User').split(' ')[0]} — charts, trends, and CSV export with date filters.`}
    >
      <DashboardAnalytics />
    </AppShell>
  );
}
