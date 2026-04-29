'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Building2,
  ShieldAlert,
  Settings,
  LogOut,
  Zap,
  ChevronLeft,
  CreditCard,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/providers/i18n-provider';

function NavLink({
  href,
  icon: Icon,
  label,
  exact = false,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          isActive ? 'text-blue-600 dark:text-blue-400' : ''
        )}
      />
      {label}
      {isActive && (
        <ChevronLeft className="ml-auto h-3.5 w-3.5 rotate-180 text-blue-500" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const { user, signOut, isAdmin } = useAuth();
  const t = useT();

  const navItems = [
    { label: t.nav.dashboard, href: '/dashboard', icon: LayoutDashboard },
    { label: t.nav.invoices, href: '/invoices', icon: FileText },
    { label: t.nav.vendors, href: '/vendors', icon: Building2 },
    { label: t.nav.riskReport, href: '/risk-report', icon: ShieldAlert },
  ];

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U';

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold tracking-tight">KSeFApp</span>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4 gap-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="mt-4 mb-1 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {t.nav.account}
          </span>
        </div>
        <NavLink href="/settings" icon={Settings} label={t.nav.settings} exact />
        <NavLink href="/pricing" icon={CreditCard} label={t.nav.pricing} exact />
        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {t.nav.administrator}
              </span>
            </div>
            <NavLink href="/admin" icon={Shield} label={t.nav.adminPanel} exact />
          </>
        )}
      </nav>

      <Separator />

      <div className="flex items-center gap-3 px-4 py-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium">
            {user?.email ?? 'User'}
          </span>
          <span className="text-xs text-muted-foreground">{t.common.member}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={signOut}
          title={t.common.signOut}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
