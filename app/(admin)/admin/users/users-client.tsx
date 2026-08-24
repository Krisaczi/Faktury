'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Users, Shield, ChevronDown, ChevronUp, Loader, Search, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, History, RefreshCw, Wrench, UserX, UserCheck, Clock, CreditCard, FilePlus, ArrowLeftRight, Zap, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { syncRolesToCanonical } from '@/lib/auth/role-actions';
import { repairMisassignedOwners } from '@/lib/auth/repair-misassigned-owners';
import { deactivateUser, reactivateUser } from '@/lib/auth/user-status-actions';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type AppRole } from '@/lib/permissions';
import type { CompanyUser, RoleChangeLog } from '@/lib/auth/role-actions';
import { ManagePlanModal } from '@/components/admin/manage-plan-modal';
import { PlatformInvoiceModal } from '@/components/admin/platform-invoice-modal';

// ─── Role colours ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<AppRole, string> = {
  owner:      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400',
  accountant: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400',
};

// ─── Confirm modal (generic) ──────────────────────────────────────────────────

interface ConfirmModalProps {
  title:       string;
  description: string;
  target:      CompanyUser;
  actionLabel: string;
  actionClass: string;
  icon:        React.ReactNode;
  warning?:    string;
  onClose:     () => void;
  onConfirm:   (reason: string) => Promise<void>;
  isPending:   boolean;
  error:       string | null;
}

function ConfirmModal({
  title, description, target, actionLabel, actionClass, icon, warning,
  onClose, onConfirm, isPending, error,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{icon} {title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {(target.full_name ?? target.email)[0]?.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {target.full_name ?? target.email}
              </p>
              <p className="text-xs text-slate-500 truncate">{target.email}</p>
            </div>
            <Badge className={cn('ml-auto flex-shrink-0 text-xs border', ROLE_COLORS[target.role])}>
              {ROLE_LABELS[target.role]}
            </Badge>
          </div>

          {warning && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Powód (opcjonalnie)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. zmiana obowiązków"
              className="text-sm resize-none h-20"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Anuluj
          </Button>
          <Button
            size="sm"
            onClick={() => void onConfirm(reason)}
            disabled={isPending}
            className={cn('gap-2', actionClass)}
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Repair Modal ─────────────────────────────────────────────────────────────

function RepairModal({ onClose }: { onClose: () => void }) {
  const [isPending, start]  = useTransition();
  const [phase, setPhase]   = useState<'idle' | 'dry' | 'apply'>('idle');
  const [report, setReport] = useState<Awaited<ReturnType<typeof repairMisassignedOwners>> | null>(null);
  const [error, setError]   = useState<string | null>(null);

  function runDry() {
    setError(null);
    start(async () => {
      const res = await repairMisassignedOwners({ dryRun: true });
      setReport(res);
      if (!res.ok) setError(res.error);
      else setPhase('dry');
    });
  }

  function runApply() {
    setError(null);
    start(async () => {
      const res = await repairMisassignedOwners({ dryRun: false });
      setReport(res);
      if (!res.ok) setError(res.error);
      else setPhase('apply');
    });
  }

  const flaggedCount = report?.ok ? report.report.flagged.length : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-slate-500" />
            Naprawa nieprawidłowych właścicieli
          </DialogTitle>
          <DialogDescription>
            Skanuje konta z rolą właściciela przypisane nieprawidłowo podczas rejestracji.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {phase === 'idle' && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Uruchom skanowanie (tryb podglądu), aby zobaczyć zmiany bez ich stosowania.
            </p>
          )}

          {report?.ok && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-500">Przeskanowano</span>
                <span className="font-medium">{report.report.scanned}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-slate-500">Podejrzanych kont</span>
                <span className={cn('font-medium', flaggedCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {flaggedCount}
                </span>
              </div>
              {!report.report.dryRun && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-slate-500">Naprawiono</span>
                  <span className="font-medium text-emerald-600">{report.report.repaired.length}</span>
                </div>
              )}
              {report.report.errors.length > 0 && (
                <div className="px-4 py-2.5">
                  <p className="text-red-600 text-xs">{report.report.errors.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          {phase === 'dry' && flaggedCount > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Znaleziono {flaggedCount} kont z nieprawidłową rolą. Kliknij &quot;Zastosuj naprawę&quot;.
              </p>
            </div>
          )}

          {phase === 'dry' && flaggedCount === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Nie znaleziono nieprawidłowych właścicieli.</p>
            </div>
          )}

          {phase === 'apply' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Naprawa zakończona. Naprawiono {report?.ok ? report.report.repaired.length : 0} kont.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Zamknij</Button>
          {phase !== 'apply' && (
            <Button variant="outline" size="sm" onClick={runDry} disabled={isPending} className="gap-2">
              {isPending && phase === 'idle' && <Loader className="w-3.5 h-3.5 animate-spin" />}
              Skanuj (podgląd)
            </Button>
          )}
          {phase === 'dry' && flaggedCount > 0 && (
            <Button size="sm" onClick={runApply} disabled={isPending} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
              Zastosuj naprawę
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit trail ──────────────────────────────────────────────────────────────

function AuditTrail({ logs }: { logs: RoleChangeLog[] }) {
  const [open, setOpen] = useState(false);
  if (logs.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Historia zmian ról ({logs.length})
          </h2>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {logs.map((log) => (
            <div key={log.id} className="px-5 py-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">
                    {log.user_email ?? log.user_id}
                  </span>
                  <span className="text-xs text-slate-400">{log.previous_role} → {log.new_role}</span>
                </div>
                {log.reason && <p className="text-xs text-slate-400 mt-0.5 truncate">{log.reason}</p>}
                <p className="text-xs text-slate-400 mt-0.5">przez {log.changer_email ?? log.changed_by}</p>
              </div>
              <time className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                {format(new Date(log.created_at), 'dd.MM.yyyy HH:mm')}
              </time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export interface UsersClientProps {
  currentUserId: string;
  isOwner:       boolean;
  initialUsers:  CompanyUser[];
  initialLogs:   RoleChangeLog[];
  fetchError?:   string | null;
}

type ModalAction =
  | { kind: 'deactivate'; user: CompanyUser }
  | { kind: 'reactivate'; user: CompanyUser }
  | { kind: 'repair' }
  | { kind: 'managePlan'; user: CompanyUser }
  | { kind: 'allowance'; user: CompanyUser }
  | { kind: 'reconcile' }
  | { kind: 'forceSync'; user: CompanyUser }
  | { kind: 'platformInvoice'; user: CompanyUser };

export function UsersClient({ currentUserId, isOwner, initialUsers, initialLogs, fetchError }: UsersClientProps) {
  const router                           = useRouter();
  const [search, setSearch]              = useState('');
  const [modal, setModal]                = useState<ModalAction | null>(null);
  const [isPending, start]               = useTransition();
  const [modalError, setModalError]      = useState<string | null>(null);
  const [syncing, startSync]             = useTransition();
  const [syncResult, setSyncResult]      = useState<string | null>(null);

  function closeModal() { setModal(null); setModalError(null); }
  function refreshAndClose() { closeModal(); router.refresh(); }

  async function runAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    setModalError(null);
    start(async () => {
      const res = await action();
      if (res.ok) refreshAndClose();
      else setModalError('error' in res ? res.error ?? 'Błąd' : 'Błąd');
    });
  }

  const filtered = initialUsers.filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  );

  const roleOrder: AppRole[] = ['owner', 'accountant'];
  const sorted = [...filtered].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po e-mailu lub nazwie..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        {isOwner && (
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                setSyncResult(null);
                startSync(async () => {
                  const res = await syncRolesToCanonical();
                  setSyncResult(res.ok
                    ? `Zsynchronizowano: ${res.data.updated} zaktualizowanych, ${res.data.skipped} bez zmian.`
                    : `Błąd: ${res.error}`);
                  router.refresh();
                });
              }}
              disabled={syncing}
              className="gap-2 text-slate-600 dark:text-slate-400"
            >
              {syncing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Synchronizuj role
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setModal({ kind: 'repair' })}
              className="gap-2 text-slate-600 dark:text-slate-400"
            >
              <Wrench className="w-3.5 h-3.5" />
              Napraw właścicieli
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setModal({ kind: 'reconcile' })}
              className="gap-2 text-slate-600 dark:text-slate-400"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Uzgodnij plany
            </Button>
          </>
        )}
      </div>

      {syncResult && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {syncResult}
        </div>
      )}

      {fetchError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Błąd ładowania użytkowników</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <Users className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Użytkownicy ({filtered.length})
          </h2>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">Brak użytkowników</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.map((u) => {
              const isSelf      = u.id === currentUserId;
              const isOwnerRow  = u.role === 'owner';
              const isInactive  = u.active === false;

              return (
                <div
                  key={u.id}
                  className={cn(
                    'flex items-center gap-4 px-5 py-3.5 transition-colors',
                    isInactive
                      ? 'bg-slate-50/80 dark:bg-slate-800/20 opacity-75'
                      : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    isInactive ? 'bg-slate-200 dark:bg-slate-700' : 'bg-blue-100 dark:bg-blue-900/30'
                  )}>
                    <span className={cn(
                      'text-xs font-bold',
                      isInactive ? 'text-slate-400' : 'text-blue-600 dark:text-blue-400'
                    )}>
                      {(u.full_name ?? u.email)[0]?.toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-sm font-medium truncate',
                        isInactive ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'
                      )}>
                        {u.full_name ?? u.email}
                      </p>
                      {isSelf && <span className="text-xs text-slate-400">(Ty)</span>}
                    </div>
                    {u.full_name && <p className="text-xs text-slate-500 truncate">{u.email}</p>}
                    {u.company_name && (
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{u.company_name}</p>
                    )}
                  </div>

                  {/* Inactive badge */}
                  {isInactive && (
                    <Badge className="text-xs border bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 flex-shrink-0 gap-1">
                      <Clock className="w-3 h-3" />
                      Nieaktywny
                    </Badge>
                  )}

                  {/* Role badge */}
                  <Badge className={cn('text-xs border flex-shrink-0', ROLE_COLORS[u.role])}>
                    {ROLE_LABELS[u.role]}
                  </Badge>

                  {/* Joined */}
                  <time className="text-xs text-slate-400 flex-shrink-0 tabular-nums hidden sm:block w-20 text-right">
                    {format(new Date(u.created_at), 'dd.MM.yyyy')}
                  </time>

                  {/* Actions — owner only, not self, not owner row */}
                  {isOwner && !isSelf && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Manage plan */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setModal({ kind: 'managePlan', user: u })}
                        className="h-8 w-8 p-0 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title="Zarządzaj planem"
                      >
                        <CreditCard className="w-4 h-4" />
                      </Button>

                      {/* Grant invoice allowance */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setModal({ kind: 'allowance', user: u })}
                        className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        title="Przyznaj dodatkowe faktury"
                      >
                        <FilePlus className="w-4 h-4" />
                      </Button>

                      {/* Issue platform invoice */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setModal({ kind: 'platformInvoice', user: u })}
                        className="h-8 w-8 p-0 text-violet-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                        title="Wystaw fakturę za użytkowanie platformy"
                      >
                        <Receipt className="w-4 h-4" />
                      </Button>

                      {/* Force sync plan */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setModal({ kind: 'forceSync', user: u })}
                        className="h-8 w-8 p-0 text-amber-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        title="Wymuś synchronizację planu"
                      >
                        <Zap className="w-4 h-4" />
                      </Button>

                      {!isOwnerRow && (
                        <>
                          {/* Deactivate — active users */}
                          {!isInactive && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setModal({ kind: 'deactivate', user: u })}
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Dezaktywuj konto"
                            >
                              <UserX className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Reactivate — inactive users */}
                          {isInactive && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setModal({ kind: 'reactivate', user: u })}
                              className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                              title="Reaktywuj konto"
                            >
                              <UserCheck className="w-4 h-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Role legend */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <Shield className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Uprawnienia ról</h2>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['owner', 'accountant'] as AppRole[]).map((role) => (
            <div key={role} className="flex items-start gap-3">
              <Badge className={cn('text-xs border flex-shrink-0 mt-0.5', ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </Badge>
              <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
        <p className="px-5 pb-4 text-xs text-slate-400">
          Tylko właściciel może dezaktywować i reaktywować konta użytkowników.
        </p>
      </div>

      {/* Audit trail */}
      <AuditTrail logs={initialLogs} />

      {/* Modals */}
      {modal?.kind === 'deactivate' && (
        <ConfirmModal
          title="Dezaktywuj konto"
          description="Użytkownik zostanie natychmiast wylogowany i nie będzie mógł się zalogować."
          target={modal.user}
          actionLabel="Dezaktywuj"
          actionClass="bg-red-600 hover:bg-red-700 text-white"
          icon={<UserX className="w-4 h-4 text-red-500" />}
          warning="Wszystkie aktywne sesje zostaną zakończone. Zmiana zostanie zapisana w dzienniku audytu."
          onClose={closeModal}
          onConfirm={(reason) => runAction(() => deactivateUser({ targetUserId: modal.user.id, reason: reason || undefined }))}
          isPending={isPending}
          error={modalError}
        />
      )}

      {modal?.kind === 'reactivate' && (
        <ConfirmModal
          title="Reaktywuj konto"
          description="Użytkownik odzyska możliwość logowania się do systemu."
          target={modal.user}
          actionLabel="Reaktywuj"
          actionClass="bg-emerald-600 hover:bg-emerald-700 text-white"
          icon={<UserCheck className="w-4 h-4 text-emerald-500" />}
          onClose={closeModal}
          onConfirm={(reason) => runAction(() => reactivateUser({ targetUserId: modal.user.id, reason: reason || undefined }))}
          isPending={isPending}
          error={modalError}
        />
      )}

      {modal?.kind === 'repair' && (
        <RepairModal onClose={() => { setModal(null); router.refresh(); }} />
      )}

      {modal?.kind === 'managePlan' && (
        <ManagePlanModal
          open
          onOpenChange={() => { setModal(null); }}
          user={modal.user}
          onSuccess={() => router.refresh()}
        />
      )}

      {modal?.kind === 'reconcile' && (
        <ReconciliationModal
          onClose={() => { setModal(null); router.refresh(); }}
        />
      )}

      {modal?.kind === 'forceSync' && (
        <ForceSyncModal
          target={modal.user}
          onClose={() => { setModal(null); setModalError(null); }}
          isPending={isPending}
          error={modalError}
          onConfirm={async (reason) => {
            setModalError(null);
            start(async () => {
              const res = await fetch(`/api/owner/users/${modal.user.id}/force-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || undefined }),
              });
              if (!res.ok) {
                const err = await res.json();
                setModalError(err.error ?? 'Błąd');
                return;
              }
              refreshAndClose();
            });
          }}
        />
      )}

      {modal?.kind === 'allowance' && (
        <AllowanceModal
          target={modal.user}
          onClose={() => { setModal(null); setModalError(null); }}
          isPending={isPending}
          error={modalError}
          onConfirm={async (extra, reason) => {
            setModalError(null);
            start(async () => {
              const res = await fetch(`/api/owner/users/${modal.user.id}/allowance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extraInvoices: extra, reason: reason || undefined }),
              });
              if (!res.ok) {
                const err = await res.json();
                setModalError(err.error ?? 'Błąd');
                return;
              }
              refreshAndClose();
            });
          }}
        />
      )}

      {modal?.kind === 'platformInvoice' && (
        <PlatformInvoiceModal
          user={modal.user}
          open
          onOpenChange={() => { setModal(null); }}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ─── Allowance modal ──────────────────────────────────────────────────────────

function AllowanceModal({
  target,
  onClose,
  onConfirm,
  isPending,
  error,
}: {
  target:    CompanyUser;
  onClose:   () => void;
  onConfirm: (extra: number, reason: string) => Promise<void>;
  isPending: boolean;
  error:     string | null;
}) {
  const [extra, setExtra] = useState(5);
  const [reason, setReason] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="w-4 h-4 text-emerald-500" />
            Dodatkowe faktury
          </DialogTitle>
          <DialogDescription>
            Przyznaj dodatkowe faktury w bieżącym miesiącu dla tej firmy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {(target.full_name ?? target.email)[0]?.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {target.full_name ?? target.email}
              </p>
              <p className="text-xs text-slate-500 truncate">{target.email}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Liczba dodatkowych faktur</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={extra}
              onChange={(e) => setExtra(Math.max(1, Number(e.target.value) || 1))}
              className="text-sm"
            />
            <p className="text-xs text-slate-400">
              Te faktury zostaną dodane do limitu miesięcznego (tylko na bieżący miesiąc).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Powód (opcjonalnie)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. duży miesiąc rozliczeniowy"
              className="text-sm resize-none h-20"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Anuluj
          </Button>
          <Button
            size="sm"
            onClick={() => void onConfirm(extra, reason)}
            disabled={isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            Przyznaj {extra} faktur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Force sync modal ──────────────────────────────────────────────────────────

function ForceSyncModal({
  target,
  onClose,
  onConfirm,
  isPending,
  error,
}: {
  target:    CompanyUser;
  onClose:   () => void;
  onConfirm: (reason: string) => Promise<void>;
  isPending: boolean;
  error:     string | null;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Wymuś synchronizację planu
          </DialogTitle>
          <DialogDescription>
            Nadpisuje lokalny rekord subskrypcji na podstawie stanu firmy. Użyj, gdy plan jest niespójny.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {(target.full_name ?? target.email)[0]?.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {target.full_name ?? target.email}
              </p>
              <p className="text-xs text-slate-500 truncate">{target.email}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Ta operacja nadpisze subskrypcję użytkownika, aby pasowała do planu firmy (product_type).
              Zmiana zostanie zapisana w dzienniku audytu.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Powód (opcjonalnie)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. niespójność po migracji"
              className="text-sm resize-none h-20"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Anuluj
          </Button>
          <Button
            size="sm"
            onClick={() => void onConfirm(reason)}
            disabled={isPending}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            Wymuś synchronizację
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reconciliation modal ──────────────────────────────────────────────────────

interface ReconciliationEntry {
  userId:        string;
  email:         string;
  companyId:     string | null;
  localPlan:     string;
  companyPlan:   string;
  canonicalPlan: string;
  mismatch:      boolean;
  lastSyncedAt:  string | null;
  recommendedAction: string;
  reason:        string;
}

function ReconciliationModal({ onClose }: { onClose: () => void }) {
  const [isPending, start] = useTransition();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'report' | 'applying' | 'done'>('idle');
  const [report, setReport] = useState<{ totalUsers: number; mismatched: number; matched: number; entries: ReconciliationEntry[] } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ totalFixed: number; totalNoop: number; totalErrors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(true);

  function loadReport() {
    setError(null);
    setPhase('loading');
    start(async () => {
      try {
        const res = await fetch('/api/owner/reconciliation');
        if (!res.ok) { setError('Błąd ładowania raportu.'); setPhase('idle'); return; }
        const data = await res.json();
        setReport(data.report);
        setPhase('report');
      } catch {
        setError('Błąd połączenia.');
        setPhase('idle');
      }
    });
  }

  function runBulkReconcile(dryRun: boolean) {
    setError(null);
    setPhase('applying');
    start(async () => {
      try {
        const res = await fetch('/api/owner/reconciliation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun }),
        });
        if (!res.ok) { setError('Błąd uzgadniania.'); setPhase('report'); return; }
        const data = await res.json();
        setBulkResult({ totalFixed: data.totalFixed, totalNoop: data.totalNoop, totalErrors: data.totalErrors });
        setPhase('done');
      } catch {
        setError('Błąd połączenia.');
        setPhase('report');
      }
    });
  }

  const entries = report ? (showOnlyMismatches ? report.entries.filter((e) => e.mismatch) : report.entries) : [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            Uzgodnianie planów
          </DialogTitle>
          <DialogDescription>
            Wykrywa i naprawia niezgodności między subskrypcjami a stanem firm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Idle */}
          {phase === 'idle' && (
            <div className="text-center py-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Kliknij &quot;Skanuj&quot;, aby sprawdzić spójność planów wszystkich użytkowników.
              </p>
              <Button size="sm" onClick={loadReport} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <RefreshCw className="w-3.5 h-3.5" />
                Skanuj
              </Button>
            </div>
          )}

          {/* Loading */}
          {phase === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          )}

          {/* Report */}
          {phase === 'report' && report && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center">
                  <p className="text-xs text-slate-400">Wszyscy</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{report.totalUsers}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                  <p className="text-xs text-slate-400">Spójne</p>
                  <p className="text-lg font-bold text-emerald-600">{report.matched}</p>
                </div>
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-xs text-slate-400">Niezgodne</p>
                  <p className="text-lg font-bold text-amber-600">{report.mismatched}</p>
                </div>
              </div>

              {/* Filter toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyMismatches}
                  onChange={(e) => setShowOnlyMismatches(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-xs text-slate-600 dark:text-slate-400">Pokaż tylko niezgodne</span>
              </label>

              {/* Entries */}
              {entries.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {entries.map((e) => (
                    <div key={e.userId} className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border text-sm',
                      e.mismatch
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'
                        : 'border-slate-200 dark:border-slate-700'
                    )}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{e.email}</p>
                        <p className="text-xs text-slate-400">
                          Sub: {e.localPlan} → Firma: {e.companyPlan}
                        </p>
                      </div>
                      {e.mismatch ? (
                        <Badge className="text-xs border bg-amber-50 text-amber-700 border-amber-200">Niezgodne</Badge>
                      ) : (
                        <Badge className="text-xs border bg-emerald-50 text-emerald-700 border-emerald-200">OK</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Wszystkie plany są spójne.</p>
                </div>
              )}

              {/* Bulk actions */}
              {report.mismatched > 0 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => runBulkReconcile(true)} disabled={isPending} className="gap-2">
                    {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
                    Podgląd naprawy
                  </Button>
                  <Button size="sm" onClick={() => runBulkReconcile(false)} disabled={isPending} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    Uzgodnij wszystkie
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Applying */}
          {phase === 'applying' && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          )}

          {/* Done */}
          {phase === 'done' && bulkResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Uzgodnianie zakończone.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-400">Naprawiono</p>
                  <p className="text-lg font-bold text-emerald-600">{bulkResult.totalFixed}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-400">Bez zmian</p>
                  <p className="text-lg font-bold text-slate-600">{bulkResult.totalNoop}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-400">Błędy</p>
                  <p className="text-lg font-bold text-red-600">{bulkResult.totalErrors}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={loadReport} className="gap-2 w-full">
                <RefreshCw className="w-3.5 h-3.5" />
                Odśwież raport
              </Button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
