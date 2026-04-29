'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Building2, ScrollText, Activity, ChartBar as BarChart2, ArrowLeft, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const NAV_ITEMS = [
  { href: '/admin', label: 'Przegląd', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Użytkownicy', icon: Users, exact: false },
  { href: '/admin/companies', label: 'Firmy', icon: Building2, exact: false },
  { href: '/admin/analytics', label: 'Analityka', icon: BarChart2, exact: false },
  { href: '/admin/logs', label: 'Logi', icon: ScrollText, exact: false },
  { href: '/admin/system', label: 'Status systemu', icon: Activity, exact: false },
];

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function AdminSidebar() {
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-card sticky top-0">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100">
          <Shield className="h-4 w-4 text-white dark:text-slate-900" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">Admin</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">KSeFApp</p>
        </div>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      <Separator />

      <div className="px-3 py-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Wróć do aplikacji
        </Link>
      </div>
    </aside>
  );
}
