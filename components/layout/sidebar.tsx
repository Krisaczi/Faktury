'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, LogOut, ChevronLeft, ChevronRight, Bell, ReceiptText, Users, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { useRoleSwitch } from '@/hooks/use-role-switch';
import { ROLE_LABELS, canAccessInvoicing, type AppRole } from '@/lib/permissions';
import { getVisibleNavItems } from '@/lib/menu-config';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ROLE_COLORS: Record<AppRole, string> = {
  owner:      'bg-amber-500/15 text-amber-400 ring-amber-500/20',
  admin:      'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  accountant: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  viewer:     'bg-slate-500/15 text-slate-400 ring-slate-500/20',
  member:     'bg-slate-500/10 text-slate-500 ring-slate-500/10',
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();
  const { data: roleData } = useUserRole();
  const { state: switchState } = useRoleSwitch();
  const [collapsed, setCollapsed] = useState(false);

  // Use the assumed role when a role-switch session is active, otherwise use the canonical role
  const effectiveRole: AppRole | undefined = switchState.isActive && switchState.assumedRole
    ? switchState.assumedRole
    : (roleData?.role as AppRole | undefined);

  const hasInvoicing = canAccessInvoicing(effectiveRole);
  const visibleNavItems = getVisibleNavItems(effectiveRole);

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
          {visibleNavItems.map(({ href, label, icon: Icon }) => {
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

          {/* Invoicing module — visible to admin / accountant / viewer */}
          {hasInvoicing && (
            <>
              <div className={cn('my-2 border-t border-slate-800', collapsed && 'mx-1')} />
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                  Fakturowanie
                </p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  {(() => {
                    const active = pathname.startsWith('/admin/invoices');
                    return (
                      <Link
                        href="/admin/invoices"
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                          active
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                          collapsed && 'justify-center px-2'
                        )}
                      >
                        <ReceiptText
                          className={cn(
                            'flex-shrink-0 transition-colors',
                            collapsed ? 'w-5 h-5' : 'w-4 h-4',
                            active ? 'text-white' : 'text-slate-400 group-hover:text-white'
                          )}
                        />
                        {!collapsed && <span>Faktury wystawione</span>}
                        {!collapsed && active && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                        )}
                      </Link>
                    );
                  })()}
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                    Faktury wystawione
                  </TooltipContent>
                )}
              </Tooltip>

              {/* Pulpit właściciela — owner only */}
              {effectiveRole === 'owner' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {(() => {
                      const active = pathname.startsWith('/admin/owner');
                      return (
                        <Link
                          href="/admin/owner"
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                            active
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                            collapsed && 'justify-center px-2'
                          )}
                        >
                          <LayoutGrid
                            className={cn(
                              'flex-shrink-0 transition-colors',
                              collapsed ? 'w-5 h-5' : 'w-4 h-4',
                              active ? 'text-white' : 'text-slate-400 group-hover:text-white'
                            )}
                          />
                          {!collapsed && <span>Pulpit właściciela</span>}
                          {!collapsed && active && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                          )}
                        </Link>
                      );
                    })()}
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                      Pulpit właściciela
                    </TooltipContent>
                  )}
                </Tooltip>
              )}

              {/* Kontrahenci — owner only */}
              {effectiveRole === 'owner' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {(() => {
                      const active = pathname.startsWith('/admin/companies');
                      return (
                        <Link
                          href="/admin/companies"
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                            active
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                            collapsed && 'justify-center px-2'
                          )}
                        >
                          <Users
                            className={cn(
                              'flex-shrink-0 transition-colors',
                              collapsed ? 'w-5 h-5' : 'w-4 h-4',
                              active ? 'text-white' : 'text-slate-400 group-hover:text-white'
                            )}
                          />
                          {!collapsed && <span>Kontrahenci</span>}
                          {!collapsed && active && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                          )}
                        </Link>
                      );
                    })()}
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                      Kontrahenci
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
            </>
          )}
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

          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg cursor-default select-none',
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
                    {effectiveRole && (
                      <span
                        aria-label={`Rola użytkownika: ${ROLE_LABELS[effectiveRole]}`}
                        className={cn(
                          'mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset leading-none',
                          ROLE_COLORS[effectiveRole]
                        )}
                      >
                        {ROLE_LABELS[effectiveRole]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            {collapsed && effectiveRole && (
              <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                <span className="font-medium">{profile?.full_name ?? user?.email}</span>
                <br />
                <span className="text-slate-400 text-xs">{ROLE_LABELS[effectiveRole]}</span>
              </TooltipContent>
            )}
          </Tooltip>

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
