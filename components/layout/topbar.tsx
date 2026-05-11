'use client';

import { usePathname } from 'next/navigation';
import { Moon, Sun, Menu } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

const pageLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/upload': 'Upload',
  '/risk-report': 'Risk Report',
  '/vendors': 'Vendors',
  '/settings': 'Settings',
};

export function Topbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const label =
    Object.entries(pageLabels).find(([path]) =>
      pathname === path || pathname.startsWith(`${path}/`)
    )?.[1] ?? 'RiskGuard';

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      <div className="flex items-center gap-4">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60">
            <Sidebar />
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
          {label}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          aria-label="Toggle theme"
        >
          <Sun className="w-4 h-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute w-4 h-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
