'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  UserX, Shield, Trash2, RefreshCw, Mail, UserCheck,
  Loader, ChevronDown, ChevronUp, CircleAlert as AlertCircle,
  CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  PackageOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  findOrphanedAccounts,
  repairOrphanedAuthUser,
  bulkRepairOrphans,
  type OrphanReport,
  type OrphanedAuthUser,
  type OrphanedProfile,
} from '@/lib/auth/orphan-repair';

// ─── Per-user repair modal ────────────────────────────────────────────────────

type RepairChoice = 'recreate_profile' | 'resend_confirmation' | 'delete_auth_user';

interface RepairModalProps {
  target:    OrphanedAuthUser;
  onClose:   () => void;
  onSuccess: () => void;
}

function RepairModal({ target, onClose, onSuccess }: RepairModalProps) {
  const [choice, setChoice]   = useState<RepairChoice>('recreate_profile');
  const [isPending, start]    = useTransition();
  const [error, setError]     = useState<string | null>(null);
  const isConfirmed           = !!target.email_confirmed_at;

  function apply() {
    setError(null);
    start(async () => {
      const repair =
        choice === 'resend_confirmation'
          ? { action: 'resend_confirmation' as const, emailRedirectTo: `${window.location.origin}/verify-email` }
          : { action: choice as 'recreate_profile' | 'delete_auth_user' };

      const res = await repairOrphanedAuthUser(target.id, repair);
      if (res.ok) onSuccess();
      else setError(res.error);
    });
  }

  const options: Array<{
    value:       RepairChoice;
    label:       string;
    description: string;
    icon:        React.ElementType;
    destructive?: boolean;
    disabled?:   boolean;
  }> = [
    {
      value:       'recreate_profile',
      label:       'Recreate app profile',
      description: 'Creates a public.users row so the user can log in and re-onboard.',
      icon:        UserCheck,
    },
    {
      value:       'resend_confirmation',
      label:       'Resend confirmation email',
      description: 'Resends the email confirmation link. Only works for unconfirmed accounts.',
      icon:        Mail,
      disabled:    isConfirmed,
    },
    {
      value:       'delete_auth_user',
      label:       'Delete auth account',
      description: 'Permanently deletes the auth.users entry. Irreversible.',
      icon:        Trash2,
      destructive: true,
    },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Repair orphaned auth user</DialogTitle>
          <DialogDescription>
            Choose how to handle this auth account that has no app profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {target.email[0]?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{target.email}</p>
              <p className="text-xs text-slate-400">
                Created {format(new Date(target.created_at), 'dd MMM yyyy')}
              </p>
            </div>
            <Badge className={cn('text-xs border flex-shrink-0', isConfirmed
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'
            )}>
              {isConfirmed ? 'Confirmed' : 'Unconfirmed'}
            </Badge>
          </div>

          <div className="space-y-2">
            {options.map(({ value, label, description, icon: Icon, destructive, disabled }) => (
              <button
                key={value}
                disabled={disabled}
                onClick={() => !disabled && setChoice(value)}
                className={cn(
                  'w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all',
                  disabled && 'opacity-40 cursor-not-allowed',
                  !disabled && choice === value
                    ? destructive
                      ? 'border-red-400 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-400'
                      : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                )}
              >
                <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', destructive ? 'text-red-500' : 'text-slate-500')} />
                <div>
                  <p className={cn('text-sm font-medium', destructive ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-200')}>
                    {label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                </div>
              </button>
            ))}
          </div>

          {choice === 'delete_auth_user' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400">
                This permanently deletes the auth account. The user will have to register again.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={apply}
            disabled={isPending}
            className={cn('gap-2', choice === 'delete_auth_user'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Orphaned auth users panel ────────────────────────────────────────────────

function OrphanedAuthPanel({
  items,
  onRepair,
}: {
  items: OrphanedAuthUser[];
  onRepair: (u: OrphanedAuthUser) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <UserX className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Auth users without app profile
          </h2>
          <Badge className={cn('text-xs border', items.length > 0
            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'
            : 'bg-slate-100 text-slate-500 border-slate-200'
          )}>
            {items.length}
          </Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {items.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              No orphaned auth users.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((u) => (
                <div key={u.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {u.email[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.email}</p>
                    <p className="text-xs text-slate-400">
                      {format(new Date(u.created_at), 'dd MMM yyyy')} · auth only, no app profile
                    </p>
                  </div>
                  <Badge className={cn('text-xs border flex-shrink-0', u.email_confirmed_at
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'
                  )}>
                    {u.email_confirmed_at ? 'Confirmed' : 'Unconfirmed'}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRepair(u)}
                    className="flex-shrink-0 h-8 text-xs gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Repair
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Orphaned profiles panel ──────────────────────────────────────────────────

function OrphanedProfilesPanel({ items }: { items: OrphanedProfile[] }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            App profiles without auth account
          </h2>
          <Badge className={cn('text-xs border', items.length > 0
            ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-slate-100 text-slate-500 border-slate-200'
          )}>
            {items.length}
          </Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {items.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              No orphaned profiles.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">
                        {p.email[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.email}</p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(p.created_at), 'dd MMM yyyy')} · role: {p.role} · {p.company_id ? 'has company' : 'no company'}
                      </p>
                    </div>
                    <Badge className="text-xs border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 flex-shrink-0">
                      No auth account
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <p className="text-xs text-slate-400">
                  These profiles have no auth account and cannot sign in. Review manually before deleting them.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export interface AuthOrphansClientProps {
  initialReport: OrphanReport | null;
  isOwner:       boolean;
}

export function AuthOrphansClient({ initialReport, isOwner }: AuthOrphansClientProps) {
  const router                           = useRouter();
  const [report, setReport]              = useState<OrphanReport | null>(initialReport);
  const [repairing, setRepairing]        = useState<OrphanedAuthUser | null>(null);
  const [bulkPending, startBulk]         = useTransition();
  const [refreshPending, startRefresh]   = useTransition();
  const [statusMsg, setStatusMsg]        = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function refresh() {
    setStatusMsg(null);
    startRefresh(async () => {
      const res = await findOrphanedAccounts({ limit: 200 });
      if (res.ok) setReport(res.report);
      else setStatusMsg({ type: 'err', text: res.error });
    });
  }

  function runBulk(dryRun: boolean) {
    setStatusMsg(null);
    startBulk(async () => {
      const res = await bulkRepairOrphans({
        dryRun,
        emailRedirectTo: `${window.location.origin}/verify-email`,
      });
      if (res.ok) {
        const r = res.report;
        setStatusMsg({
          type: 'ok',
          text: dryRun
            ? `Dry run: ${r.skipped.length} would be repaired.`
            : `Applied: ${r.repaired.length} repaired, ${r.errors.length} errors.`,
        });
        if (!dryRun) router.refresh();
      } else {
        setStatusMsg({ type: 'err', text: res.error });
      }
    });
  }

  const totalIssues = (report?.orphanedAuthUsers.length ?? 0) + (report?.orphanedProfiles.length ?? 0);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <PackageOpen className="w-3.5 h-3.5" />
          {report
            ? `${report.scannedAuth} auth · ${report.scannedProfiles} profiles · ${totalIssues} issue${totalIssues !== 1 ? 's' : ''}`
            : 'Scanning...'}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshPending}
          className="gap-2 ml-auto"
        >
          {refreshPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>

        {isOwner && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runBulk(true)}
              disabled={bulkPending}
              className="gap-2 text-slate-600 dark:text-slate-400"
            >
              {bulkPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
              Dry run
            </Button>
            <Button
              size="sm"
              onClick={() => runBulk(false)}
              disabled={bulkPending || (report?.orphanedAuthUsers.length ?? 0) === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {bulkPending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
              Bulk repair
            </Button>
          </>
        )}
      </div>

      {statusMsg && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg border text-xs',
          statusMsg.type === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        )}>
          {statusMsg.type === 'ok'
            ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {statusMsg.text}
        </div>
      )}

      {report ? (
        <>
          <OrphanedAuthPanel
            items={report.orphanedAuthUsers}
            onRepair={setRepairing}
          />
          <OrphanedProfilesPanel items={report.orphanedProfiles} />
        </>
      ) : (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
          <Loader className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      )}

      {repairing && (
        <RepairModal
          target={repairing}
          onClose={() => setRepairing(null)}
          onSuccess={() => { setRepairing(null); refresh(); }}
        />
      )}
    </div>
  );
}
