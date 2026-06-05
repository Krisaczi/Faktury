'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Users, Shield, ChevronDown, ChevronUp, Loader, Search, UserCog, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, History, RefreshCw, Crown, Wrench, UserX, UserCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { assignRole, revokeRole, syncAuthMetadataToUsers } from '@/lib/auth/role-actions';
import { grantOwnerRole } from '@/lib/auth/grant-owner-role';
import { repairMisassignedOwners } from '@/lib/auth/repair-misassigned-owners';
import { deactivateUser, reactivateUser } from '@/lib/auth/user-status-actions';
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

// ─── Deactivate Modal ─────────────────────────────────────────────────────────

interface DeactivateModalProps {
  target:    CompanyUser;
  onClose:   () => void;
  onSuccess: () => void;
}

function DeactivateModal({ target, onClose, onSuccess }: DeactivateModalProps) {
  const [reason, setReason]    = useState('');
  const [isPending, start]     = useTransition();
  const [error, setError]      = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    start(async () => {
      const res = await deactivateUser({ targetUserId: target.id, reason: reason || undefined });
      if (res.ok) onSuccess();
      else setError(res.error);
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="w-4 h-4 text-red-500" />
            Dezaktywuj konto
          </DialogTitle>
          <DialogDescription>
            Użytkownik zostanie natychmiast wylogowany i nie będzie mógł się zalogować.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
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

          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400">
              Wszystkie aktywne sesje tego użytkownika zostaną zakończone. Zmiana zostanie zapisana w dzienniku audytu.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Powód dezaktywacji (opcjonalnie)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. zakończenie współpracy, naruszenie regulaminu"
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
            onClick={handleConfirm}
            disabled={isPending}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            <UserX className="w-3.5 h-3.5" />
            Dezaktywuj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reactivate Modal ─────────────────────────────────────────────────────────

interface ReactivateModalProps {
  target:    CompanyUser;
  onClose:   () => void;
  onSuccess: () => void;
}

function ReactivateModal({ target, onClose, onSuccess }: ReactivateModalProps) {
  const [reason, setReason]    = useState('');
  const [isPending, start]     = useTransition();
  const [error, setError]      = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    start(async () => {
      const res = await reactivateUser({ targetUserId: target.id, reason: reason || undefined });
      if (res.ok) onSuccess();
      else setError(res.error);
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            Reaktywuj konto
          </DialogTitle>
          <DialogDescription>
            Użytkownik odzyska możliwość logowania się do systemu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
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
            <Label className="text-xs text-slate-500">Powód reaktywacji (opcjonalnie)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. powrót do współpracy"
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
            onClick={handleConfirm}
            disabled={isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            <UserCheck className="w-3.5 h-3.5" />
            Reaktywuj
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

// ─── Grant Owner Modal ────────────────────────────────────────────────────────

interface GrantOwnerModalProps {
  target:    CompanyUser;
  onClose:   () => void;
  onSuccess: () => void;
}

function GrantOwnerModal({ target, onClose, onSuccess }: GrantOwnerModalProps) {
  const [reason, setReason]     = useState('');
  const [step, setStep]         = useState<'confirm' | 'final'>('confirm');
  const [isPending, start]      = useTransition();
  const [error, setError]       = useState<string | null>(null);

  function handleGrant() {
    if (step === 'confirm') { setStep('final'); return; }
    setError(null);
    start(async () => {
      const res = await grantOwnerRole({ targetUserId: target.id, reason: reason || undefined });
      if (res.ok) {
        onSuccess();
      } else {
        setError(res.error);
        setStep('confirm');
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" />
            Nadaj rolę Właściciela
          </DialogTitle>
          <DialogDescription>
            Ta operacja nie może być cofnięta przez panelu — tylko inny właściciel może zmienić tę rolę z powrotem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
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

          {step === 'confirm' ? (
            <>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Właściciel ma pełny dostęp do wszystkich funkcji systemu, w tym do zarządzania rolami i usuwania konta firmy.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Powód nadania (opcjonalnie)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="np. przekazanie własności firmy"
                  className="h-9 text-sm"
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    Ostateczne potwierdzenie
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                    Czy na pewno nadać rolę <strong>Właściciela</strong> użytkownikowi{' '}
                    <strong>{target.full_name ?? target.email}</strong>? Ta akcja zostanie zapisana w dzienniku audytu.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={step === 'final' ? () => setStep('confirm') : onClose} disabled={isPending}>
            {step === 'final' ? 'Wróć' : 'Anuluj'}
          </Button>
          <Button
            size="sm"
            onClick={handleGrant}
            disabled={isPending}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            <Crown className="w-3.5 h-3.5" />
            {step === 'confirm' ? 'Dalej' : 'Potwierdź nadanie roli'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Repair Modal ─────────────────────────────────────────────────────────────

interface RepairModalProps {
  onClose: () => void;
}

function RepairModal({ onClose }: RepairModalProps) {
  const [isPending, start]   = useTransition();
  const [phase, setPhase]    = useState<'idle' | 'dry' | 'apply'>('idle');
  const [report, setReport]  = useState<Awaited<ReturnType<typeof repairMisassignedOwners>> | null>(null);
  const [error, setError]    = useState<string | null>(null);

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
            Skanuje konta z rolą właściciela, które mogły zostać nieprawidłowo przypisane podczas rejestracji.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {phase === 'idle' && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Najpierw uruchom skanowanie (tryb podglądu), aby zobaczyć jakie zmiany zostaną wprowadzone, bez ich stosowania.
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
                Znaleziono {flaggedCount} kont z nieprawidłową rolą właściciela. Kliknij "Zastosuj naprawę", aby zmienić ich rolę na "Członek".
              </p>
            </div>
          )}

          {phase === 'dry' && flaggedCount === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Nie znaleziono nieprawidłowych właścicieli.
              </p>
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
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Zamknij
          </Button>
          {phase !== 'apply' && (
            <Button
              variant="outline"
              size="sm"
              onClick={runDry}
              disabled={isPending}
              className="gap-2"
            >
              {isPending && phase === 'idle' && <Loader className="w-3.5 h-3.5 animate-spin" />}
              Skanuj (podgląd)
            </Button>
          )}
          {phase === 'dry' && flaggedCount > 0 && (
            <Button
              size="sm"
              onClick={runApply}
              disabled={isPending}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
              Zastosuj naprawę
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



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
  const router                              = useRouter();
  const [search, setSearch]                 = useState('');
  const [editingUser, setEditingUser]       = useState<CompanyUser | null>(null);
  const [grantingOwner, setGrantingOwner]   = useState<CompanyUser | null>(null);
  const [deactivating, setDeactivating]     = useState<CompanyUser | null>(null);
  const [reactivating, setReactivating]     = useState<CompanyUser | null>(null);
  const [showRepair, setShowRepair]         = useState(false);
  const [syncing, startSync]                = useTransition();
  const [syncResult, setSyncResult]         = useState<string | null>(null);

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRepair(true)}
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
              const isSelf        = u.id === currentUserId;
              const isOwnerRow    = u.role === 'owner';
              const isProtected   = isOwnerRow || isSelf;
              const isInactive    = u.active === false;

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
                    isInactive
                      ? 'bg-slate-200 dark:bg-slate-700'
                      : 'bg-blue-100 dark:bg-blue-900/30'
                  )}>
                    <span className={cn(
                      'text-xs font-bold',
                      isInactive ? 'text-slate-400 dark:text-slate-500' : 'text-blue-600 dark:text-blue-400'
                    )}>
                      {(u.full_name ?? u.email)[0]?.toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-sm font-medium truncate',
                        isInactive ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'
                      )}>
                        {u.full_name ?? u.email}
                      </p>
                      {isSelf && <span className="text-xs text-slate-400">(Ty)</span>}
                    </div>
                    {u.full_name && (
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    )}
                  </div>

                  {/* Active badge */}
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

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Grant owner — only shown to owner, only for non-owner non-self active users */}
                    {isOwner && !isOwnerRow && !isSelf && !isInactive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setGrantingOwner(u)}
                        className="h-8 w-8 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        title="Nadaj rolę właściciela"
                      >
                        <Crown className="w-4 h-4" />
                      </Button>
                    )}

                    {/* Deactivate — owner only, not self, not owner row, not already inactive */}
                    {isOwner && !isSelf && !isOwnerRow && !isInactive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeactivating(u)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Dezaktywuj konto"
                      >
                        <UserX className="w-4 h-4" />
                      </Button>
                    )}

                    {/* Reactivate — owner only, inactive users */}
                    {isOwner && isInactive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReactivating(u)}
                        className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        title="Reaktywuj konto"
                      >
                        <UserCheck className="w-4 h-4" />
                      </Button>
                    )}

                    {/* Change role — disabled for inactive, owner, or self */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isProtected || isInactive}
                      onClick={() => !isProtected && !isInactive && setEditingUser(u)}
                      className={cn(
                        'h-8 w-8 p-0',
                        isProtected || isInactive ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                      )}
                      title={isInactive ? 'Reaktywuj konto, aby zmienić rolę' : isProtected ? 'Nie można zmienić tej roli' : 'Zmień rolę'}
                    >
                      <UserCog className="w-4 h-4" />
                    </Button>
                  </div>
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

      {/* Grant owner modal */}
      {grantingOwner && (
        <GrantOwnerModal
          target={grantingOwner}
          onClose={() => setGrantingOwner(null)}
          onSuccess={() => { setGrantingOwner(null); router.refresh(); }}
        />
      )}

      {/* Repair modal */}
      {showRepair && (
        <RepairModal onClose={() => { setShowRepair(false); router.refresh(); }} />
      )}

      {/* Deactivate modal */}
      {deactivating && (
        <DeactivateModal
          target={deactivating}
          onClose={() => setDeactivating(null)}
          onSuccess={() => { setDeactivating(null); router.refresh(); }}
        />
      )}

      {/* Reactivate modal */}
      {reactivating && (
        <ReactivateModal
          target={reactivating}
          onClose={() => setReactivating(null)}
          onSuccess={() => { setReactivating(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
