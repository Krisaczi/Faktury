import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/is-admin';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminCheck = await isAdmin();
  if (!adminCheck) redirect('/dashboard');

  return (
    <div className="flex h-full min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-muted/30">
        {children}
      </main>
    </div>
  );
}
