'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Users, Shield, ChevronDown, ChevronUp, Loader, Search, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, History, RefreshCw, Wrench, UserX, UserCheck, Clock, CircleArrowUp as ArrowUpCircle, CircleArrowDown as ArrowDownCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { promoteToAdmin, demoteAdmin, syncRolesToCanonical } from '@/lib/auth/role-actions';
import { repairMisassignedOwners } from '@/lib/auth/repair-misassigned-owners';
import { deactivateUser, reactivateUser } from '@/lib/auth/user-status-actions';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type AppRole } from '@/lib/permissions';
import type { CompanyUser, RoleChangeLog } from '@/lib/auth/role-actions';

// ─── Role colours ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<AppRole, string> = {
  owner:      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400',
  admin:      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400',
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
}

type ModalAction =
  | { kind: 'promote'; user: CompanyUser }
  | { kind: 'demote';  user: CompanyUser }
  | { kind: 'deactivate'; user: CompanyUser }
  | { kind: 'reactivate'; user: CompanyUser }
  | { kind: 'repair' };

export function UsersClient({ currentUserId, isOwner, initialUsers, initialLogs }: UsersClientProps) {
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

  const roleOrder: AppRole[] = ['owner', 'admin', 'accountant'];
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
          </>
        )}
      </div>

      {syncResult && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {syncResult}
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
                  {isOwner && !isSelf && !isOwnerRow && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Promote to admin — only for active accountants */}
                      {u.role === 'accountant' && !isInactive && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setModal({ kind: 'promote', user: u })}
                          className="h-8 px-2 gap-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          title="Awansuj na Administratora"
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Admin</span>
                        </Button>
                      )}

                      {/* Demote admin → accountant */}
                      {u.role === 'admin' && !isInactive && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setModal({ kind: 'demote', user: u })}
                          className="h-8 px-2 gap-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Cofnij do Księgowego"
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Cofnij</span>
                        </Button>
                      )}

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
          {(['admin', 'accountant'] as AppRole[]).map((role) => (
            <div key={role} className="flex items-start gap-3">
              <Badge className={cn('text-xs border flex-shrink-0 mt-0.5', ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </Badge>
              <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
        <p className="px-5 pb-4 text-xs text-slate-400">
          Tylko właściciel może nadawać i cofać rolę Administratora oraz dezaktywować konta.
        </p>
      </div>

      {/* Audit trail */}
      <AuditTrail logs={initialLogs} />

      {/* Modals */}
      {modal?.kind === 'promote' && (
        <ConfirmModal
          title="Awansuj na Administratora"
          description="Administrator ma pełny dostęp do fakturowania i może przeglądać dane firmowe."
          target={modal.user}
          actionLabel="Awansuj"
          actionClass="bg-blue-600 hover:bg-blue-700 text-white"
          icon={<ArrowUpCircle className="w-4 h-4 text-blue-500" />}
          warning="Administrator uzyskuje pełny dostęp do fakturowania i widoku analitycznego."
          onClose={closeModal}
          onConfirm={(reason) => runAction(() => promoteToAdmin({ targetUserId: modal.user.id, reason: reason || undefined }))}
          isPending={isPending}
          error={modalError}
        />
      )}

      {modal?.kind === 'demote' && (
        <ConfirmModal
          title="Cofnij do Księgowego"
          description="Użytkownik utraci uprawnienia Administratora i zostanie Księgowym."
          target={modal.user}
          actionLabel="Cofnij uprawnienia"
          actionClass="bg-slate-700 hover:bg-slate-800 text-white"
          icon={<ArrowDownCircle className="w-4 h-4 text-slate-500" />}
          onClose={closeModal}
          onConfirm={(reason) => runAction(() => demoteAdmin({ targetUserId: modal.user.id, reason: reason || undefined }))}
          isPending={isPending}
          error={modalError}
        />
      )}

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
    </div>
  );
}
