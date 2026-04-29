import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminAnalyticsView } from '@/components/admin/analytics/admin-analytics-view';

export default async function AdminAnalyticsPage() {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  return <AdminAnalyticsView />;
}
