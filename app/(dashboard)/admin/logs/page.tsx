import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminLogsView } from '@/components/admin/admin-logs-view';

export default async function AdminLogsPage() {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  return <AdminLogsView />;
}
