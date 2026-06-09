'use client';

import { useState } from 'react';
import { UserCog, ChevronDown, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type AppRole } from '@/lib/permissions';
import { useRoleSwitch } from '@/hooks/use-role-switch';
import { useUserRole } from '@/hooks/use-user-role';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const ASSUMABLE_ROLES: AppRole[] = ['admin', 'accountant'];

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
];

const ROLE_COLORS: Record<AppRole, string> = {
  admin:      'text-blue-600 bg-blue-50   border-blue-200  dark:bg-blue-900/20  dark:text-blue-400  dark:border-blue-800',
  accountant: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  owner:      'text-amber-600 bg-amber-50  border-amber-200  dark:bg-amber-900/20  dark:text-amber-400  dark:border-amber-800',
};

export function RoleSwitcher() {
  const { data: roleData } = useUserRole();
  const { state, isPending, error, start } = useRoleSwitch();

  const [selectedRole, setSelectedRole] = useState<AppRole>('admin');
  const [duration, setDuration]         = useState(30);
  const [reason, setReason]             = useState('');
  const [open, setOpen]                 = useState(false);

  // Only render for owners
  if (roleData?.role !== 'owner') return null;

  // If a switch is already active, banner handles it; show minimal indicator
  if (state.isActive) return null;

  function handleStart() {
    start(selectedRole, duration, reason || undefined);
    setOpen(false);
    setReason('');
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
            'hover:bg-slate-50 dark:hover:bg-slate-800',
          )}
          aria-label="Przełącz widok roli"
        >
          <UserCog className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Widok roli</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Przełącz widok roli</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Tymczasowo przeglądaj UI jako inna rola. Twoja rola właściciela pozostaje niezmieniona.
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Role selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Rola</p>
            <div className="grid grid-cols-3 gap-2">
              {ASSUMABLE_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={cn(
                    'px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center',
                    selectedRole === role
                      ? ROLE_COLORS[role]
                      : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  )}
                  aria-pressed={selectedRole === role}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          {/* Duration selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Czas trwania</p>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    duration === opt.value
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                  )}
                  aria-pressed={duration === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional reason */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Powód (opcjonalnie)</p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. testowanie widoku księgowego"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Powód przełączenia roli"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg" role="alert">
              {error}
            </p>
          )}

          <DropdownMenuSeparator />

          <Button
            onClick={handleStart}
            disabled={isPending}
            size="sm"
            className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <UserCog className="w-3.5 h-3.5" />}
            Przełącz na {ROLE_LABELS[selectedRole]}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
