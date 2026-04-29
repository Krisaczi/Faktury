'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, LogOut, Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { label: 'Dashboard', href: '/demo/dashboard', icon: LayoutDashboard },
  { label: 'Invoices', href: '/demo/invoices', icon: FileText },
];

function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-blue-600' : '')} />
      {label}
      {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 text-blue-500" />}
    </Link>
  );
}

export function DemoSidebar() {
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
            Demo
          </span>
        </div>

        <Link
          href="/login"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Exit Demo
        </Link>
      </nav>

      <Separator />

      <div className="px-4 py-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">Demo mode active</p>
          <p className="text-xs text-amber-700 mt-0.5">Sample data only</p>
        </div>
      </div>
    </aside>
  );
}
