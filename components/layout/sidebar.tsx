'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Upload, ChartBar as FileBarChart2, Building2, Settings, Shield, LogOut, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/risk-report', label: 'Risk Report', icon: FileBarChart2 },
  { href: '/vendors', label: 'Vendors', icon: Building2 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col h-full bg-slate-900 dark:bg-slate-950 border-r border-slate-800 transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-slate-800', collapsed ? 'justify-center' : 'gap-3')}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-white font-bold text-lg tracking-tight">
              RiskGuard
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                      active
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                      collapsed && 'justify-center px-2'
                    )}
                  >
                    <Icon
                      className={cn(
                        'flex-shrink-0 transition-colors',
                        collapsed ? 'w-5 h-5' : 'w-4 h-4',
                        active ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      )}
                    />
                    {!collapsed && <span>{label}</span>}
                    {!collapsed && active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                    )}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                    {label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-800 p-3 space-y-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={cn(
                'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all duration-150',
                collapsed && 'justify-center'
              )}>
                <Bell className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="text-sm">Notifications</span>}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                Notifications
              </TooltipContent>
            )}
          </Tooltip>

          <div className={cn(
            'flex items-center gap-3 px-2 py-2 rounded-lg',
            collapsed && 'justify-center'
          )}>
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarFallback className="text-xs bg-blue-700 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {profile?.full_name ?? 'User'}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className={cn(
                  'w-full text-slate-400 hover:bg-slate-800 hover:text-white h-9',
                  collapsed ? 'px-0 justify-center' : 'justify-start gap-3 px-2'
                )}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="text-sm">Sign out</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                Sign out
              </TooltipContent>
            )}
          </Tooltip>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-1.5 text-slate-600 hover:text-slate-400 transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
