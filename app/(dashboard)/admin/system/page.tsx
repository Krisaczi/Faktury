import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminSystemView } from '@/components/admin/admin-system-view';

export default async function AdminSystemPage() {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  return <AdminSystemView />;
}
