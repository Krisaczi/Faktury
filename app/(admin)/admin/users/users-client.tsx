'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Users, Shield, ChevronDown, ChevronUp, Loader, Search, UserCog, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, History, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { assignRole, revokeRole, syncAuthMetadataToUsers } from '@/lib/auth/role-actions';
import { ROLE_LABELS, type AppRole } from '@/lib/permissions';
import type { CompanyUser, RoleChangeLog } from '@/lib/auth/role-actions';

// ─── Role colours ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<AppRole, string> = {
  owner:      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400',
  admin:      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400',
  accountant: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400',
  viewer:     'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
  member:     'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-500',
};

const ASSIGNABLE: AppRole[] = ['admin', 'accountant', 'viewer', 'member'];

// ─── Change role modal ────────────────────────────────────────────────────────

interface ChangeRoleModalProps {
  target:    CompanyUser;
  isOwner:   boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

function ChangeRoleModal({ target, isOwner, onClose, onSuccess }: ChangeRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<AppRole>(target.role);
  const [reason, setReason]             = useState('');
  const [confirming, setConfirming]     = useState(false);
  const [isPending, start]              = useTransition();
  const [error, setError]               = useState<string | null>(null);

  const isAdminGrant  = selectedRole === 'admin' && target.role !== 'admin';
  const hasChanged    = selectedRole !== target.role;

  function handleNext() {
    if (isAdminGrant && !confirming) {
      setConfirming(true);
      return;
    }
    handleConfirm();
  }

  function handleConfirm() {
    setError(null);
    start(async () => {
      const res = await assignRole({
        targetUserId: target.id,
        newRole:      selectedRole,
        reason:       reason || undefined,
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError(res.error);
        setConfirming(false);
      }
    });
  }

  const availableRoles = isOwner ? ASSIGNABLE : ASSIGNABLE.filter((r) => r !== 'admin');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zmień rolę użytkownika</DialogTitle>
        </DialogHeader>

        {!confirming ? (
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

            <div className="space-y-2">
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Nowa rola</Label>
              <div className="grid grid-cols-2 gap-2">
                {availableRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={cn(
                      'rounded-lg border p-3 text-left text-sm transition-all',
                      selectedRole === role
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <p className="font-medium text-slate-900 dark:text-white">{ROLE_LABELS[role]}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Powód zmiany (opcjonalnie)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="np. awans, zmiana obowiązków"
                className="h-9 text-sm"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Nadajesz uprawnienia Administratora
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Administrator ma pełny dostęp do fakturowania, konfiguracji i może zarządzać innymi użytkownikami. Tylko właściciel może nadać tę rolę.
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Czy na pewno chcesz nadać rolę <strong>Administrator</strong> użytkownikowi <strong>{target.full_name ?? target.email}</strong>?
            </p>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={confirming ? () => setConfirming(false) : onClose}
            disabled={isPending}
          >
            {confirming ? 'Wróć' : 'Anuluj'}
          </Button>
          <Button
            size="sm"
            onClick={handleNext}
            disabled={isPending || !hasChanged}
            className={cn(
              'gap-2',
              isAdminGrant && !confirming
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            {confirming ? 'Potwierdź nadanie admina' : isAdminGrant ? 'Dalej' : 'Zapisz zmianę'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Role descriptions ────────────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner:      'Pełny dostęp do wszystkich funkcji',
  admin:      'Pełny dostęp do fakturowania',
  accountant: 'Tworzenie, edycja i wysyłanie faktur',
  viewer:     'Tylko podgląd faktur',
  member:     'Brak dostępu do fakturowania',
};

// ─── Audit trail ─────────────────────────────────────────────────────────────

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
                  <span className="text-xs text-slate-400">
                    {log.previous_role} → {log.new_role}
                  </span>
                </div>
                {log.reason && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{log.reason}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  przez {log.changer_email ?? log.changed_by}
                </p>
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

export function UsersClient({
  currentUserId, isOwner, initialUsers, initialLogs,
}: UsersClientProps) {
  const router                          = useRouter();
  const [search, setSearch]             = useState('');
  const [editingUser, setEditingUser]   = useState<CompanyUser | null>(null);
  const [syncing, startSync]            = useTransition();
  const [syncResult, setSyncResult]     = useState<string | null>(null);

  const filtered = initialUsers.filter((u) =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  );

  async function handleSync() {
    setSyncResult(null);
    startSync(async () => {
      const res = await syncAuthMetadataToUsers();
      if (res.ok) {
        setSyncResult(`Zsynchronizowano: ${res.data.updated} zaktualizowanych, ${res.data.skipped} bez zmian.`);
        router.refresh();
      } else {
        setSyncResult(`Błąd: ${res.error}`);
      }
    });
  }

  const roleOrder: AppRole[] = ['owner', 'admin', 'accountant', 'viewer', 'member'];
  const sorted = [...filtered].sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po e-mailu lub nazwie..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2 text-slate-600 dark:text-slate-400"
          >
            {syncing
              ? <Loader className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Synchronizuj role
          </Button>
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
              const isSelf = u.id === currentUserId;
              const isProtected = u.role === 'owner' || isSelf;

              return (
                <div
                  key={u.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {(u.full_name ?? u.email)[0]?.toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {u.full_name ?? u.email}
                      </p>
                      {isSelf && (
                        <span className="text-xs text-slate-400">(Ty)</span>
                      )}
                    </div>
                    {u.full_name && (
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    )}
                  </div>

                  {/* Role badge */}
                  <Badge className={cn('text-xs border flex-shrink-0', ROLE_COLORS[u.role])}>
                    {ROLE_LABELS[u.role]}
                  </Badge>

                  {/* Joined */}
                  <time className="text-xs text-slate-400 flex-shrink-0 tabular-nums hidden sm:block w-20 text-right">
                    {format(new Date(u.created_at), 'dd.MM.yyyy')}
                  </time>

                  {/* Action */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isProtected}
                    onClick={() => !isProtected && setEditingUser(u)}
                    className={cn(
                      'h-8 w-8 p-0 flex-shrink-0',
                      isProtected ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                    )}
                    title={isProtected ? 'Nie można zmienić tej roli' : 'Zmień rolę'}
                  >
                    <UserCog className="w-4 h-4" />
                  </Button>
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
          {roleOrder.filter((r) => r !== 'owner').map((role) => (
            <div key={role} className="flex items-start gap-3">
              <Badge className={cn('text-xs border flex-shrink-0 mt-0.5', ROLE_COLORS[role])}>
                {ROLE_LABELS[role]}
              </Badge>
              <p className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
        {!isOwner && (
          <p className="px-5 pb-4 text-xs text-slate-400">
            Tylko właściciel może nadawać rolę Administratora.
          </p>
        )}
      </div>

      {/* Audit trail */}
      <AuditTrail logs={initialLogs} />

      {/* Change role modal */}
      {editingUser && (
        <ChangeRoleModal
          target={editingUser}
          isOwner={isOwner}
          onClose={() => setEditingUser(null)}
          onSuccess={() => { setEditingUser(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
