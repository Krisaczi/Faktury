'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Star,
  CircleCheck,
  ShieldCheck,
  Loader as Loader2,
  TriangleAlert as AlertTriangle,
  Landmark,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { canManageBankAccounts } from '@/lib/permissions';
import { useCompanyBankAccounts } from '@/hooks/use-bank-accounts';
import { validateIban, validateBic, normalizeIban, formatIban, maskIban } from '@/lib/validations/iban';
import type { BankAccountRow, CreateBankAccountInput, UpdateBankAccountPatch } from '@/lib/bank-accounts/types';
import { maskIbanForDisplay, formatIbanForDisplay } from '@/lib/bank-accounts/types';

interface Props {
  role: string;
}

export function BankAccountsCard({ role }: Props) {
  const canManage = canManageBankAccounts(role);
  const {
    accounts,
    isLoading,
    error,
    createAccount,
    updateAccount,
    verifyAccount,
    deleteAccount,
  } = useCompanyBankAccounts();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountRow | null>(null);
  const [deleteForce, setDeleteForce] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
            Konta bankowe
          </CardTitle>
        </div>
        <CardDescription>
          Zarządzaj kontami bankowymi firmy. Konta są dostępne do wyboru przy wystawianiu faktur.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error.message}
          </div>
        )}

        {/* Account list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
            <Landmark className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              Brak dodanych kont bankowych
            </p>
            <p className="text-xs text-slate-400">
              Dodaj konto, aby móc wybierać je jako rachunek płatnika przy wystawianiu faktur.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {accounts.map((account) => (
              <BankAccountItem
                key={account.id}
                account={account}
                canManage={canManage}
                onEdit={() => setEditingId(account.id)}
                onDelete={() => { setDeleteTarget(account); setDeleteForce(false); }}
                onSetDefault={async () => {
                  try {
                    await updateAccount(account.id, { is_default: true });
                    toast.success('Ustawiono jako domyślne konto');
                  } catch (e) {
                    toast.error('Błąd', { description: e instanceof Error ? e.message : undefined });
                  }
                }}
                onVerify={async () => {
                  try {
                    await verifyAccount(account.id);
                    toast.success('Konto zweryfikowane');
                  } catch (e) {
                    toast.error('Błąd', { description: e instanceof Error ? e.message : undefined });
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Add button */}
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="gap-2 w-full border-dashed"
          >
            <Plus className="w-4 h-4" />
            Dodaj konto bankowe
          </Button>
        )}

        {!canManage && (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Do zarządzania kontami bankowymi wymagana jest rola właściciela lub księgowego.
          </p>
        )}
      </CardContent>

      {/* Add form dialog */}
      {showAddForm && (
        <BankAccountFormDialog
          mode="create"
          onClose={() => setShowAddForm(false)}
          onSubmit={async (input) => {
            await createAccount(input);
            toast.success('Konto bankowe zostało dodane');
          }}
        />
      )}

      {/* Edit form dialog */}
      {editingId && (
        <BankAccountFormDialog
          mode="edit"
          account={accounts.find((a) => a.id === editingId) ?? null}
          onClose={() => setEditingId(null)}
          onSubmit={async (input) => {
            const patch: UpdateBankAccountPatch = {
              account_holder_name: input.account_holder_name,
              bic: input.bic ?? null,
              bank_name: input.bank_name ?? null,
              is_default: input.is_default,
            };
            await updateAccount(editingId, patch);
            toast.success('Konto bankowe zostało zaktualizowane');
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć konto bankowe?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Czy na pewno chcesz usunąć konto{' '}
                  <span className="font-mono font-semibold">{maskIbanForDisplay(deleteTarget.iban)}</span>?
                  {deleteTarget.is_default && (
                    <span className="block mt-2 text-amber-600 dark:text-amber-400">
                      To jest domyślne konto. Po usunięciu najnowsze pozostałe konto zostanie ustawione jako domyślne.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await deleteAccount(deleteTarget.id, deleteForce);
                  toast.success('Konto bankowe zostało usunięte');
                  setDeleteTarget(null);
                } catch (e) {
                  toast.error('Nie można usunąć konta', {
                    description: e instanceof Error ? e.message : undefined,
                  });
                  setDeleteForce(true);
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Usuń'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Account item row ─────────────────────────────────────────────────────────

function BankAccountItem({
  account,
  canManage,
  onEdit,
  onDelete,
  onSetDefault,
  onVerify,
}: {
  account: BankAccountRow;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onVerify: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
              {account.account_holder_name}
            </p>
            {account.is_default && (
              <Badge className="text-[10px] py-0 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-0.5">
                <Star className="w-2.5 h-2.5" /> Domyślne
              </Badge>
            )}
            {account.verified && (
              <Badge className="text-[10px] py-0 px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-0.5">
                <ShieldCheck className="w-2.5 h-2.5" /> Zweryfikowane
              </Badge>
            )}
          </div>
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
            {formatIbanForDisplay(account.iban)}
          </p>
          {(account.bank_name || account.bic) && (
            <p className="text-xs text-slate-400 mt-0.5">
              {account.bank_name}
              {account.bank_name && account.bic && ' · '}
              {account.bic && <span className="font-mono">{account.bic}</span>}
            </p>
          )}
        </div>

        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            {!account.is_default && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-blue-600"
                onClick={onSetDefault}
                title="Ustaw jako domyślne"
              >
                <Star className="w-3.5 h-3.5" />
              </Button>
            )}
            {!account.verified && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-emerald-600"
                onClick={onVerify}
                title="Zweryfikuj"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              onClick={onEdit}
              title="Edytuj"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-red-600"
              onClick={onDelete}
              title="Usuń"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────

function BankAccountFormDialog({
  mode,
  account,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  account?: BankAccountRow | null;
  onClose: () => void;
  onSubmit: (input: CreateBankAccountInput) => Promise<void>;
}) {
  const [holderName, setHolderName] = useState(account?.account_holder_name ?? '');
  const [iban, setIban] = useState(account ? formatIban(account.iban) : '');
  const [bic, setBic] = useState(account?.bic ?? '');
  const [bankName, setBankName] = useState(account?.bank_name ?? '');
  const [isDefault, setIsDefault] = useState(account?.is_default ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const ibanPreview = iban ? maskIban(iban) : '';
  const isIbanEditable = mode === 'create';

  async function handleSubmit() {
    setErrors({});
    setSubmitError('');

    if (!holderName.trim()) {
      setErrors((e) => ({ ...e, holderName: 'Nazwa posiadacza jest wymagana' }));
      return;
    }

    if (mode === 'create') {
      const ibanErr = validateIban(iban);
      if (ibanErr) {
        setErrors((e) => ({ ...e, iban: ibanErr }));
        return;
      }
    }

    if (bic.trim()) {
      const bicErr = validateBic(bic);
      if (bicErr) {
        setErrors((e) => ({ ...e, bic: bicErr }));
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        account_holder_name: holderName.trim(),
        iban: normalizeIban(iban),
        bic: bic.trim() || null,
        bank_name: bankName.trim() || null,
        is_default: isDefault,
      });
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Wystąpił błąd');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Dodaj konto bankowe' : 'Edytuj konto bankowe'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Dodaj nowe konto bankowe firmy.'
              : 'Zaktualizuj dane konta bankowego. Numeru IBAN nie można zmienić.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {submitError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ba-holder">Nazwa posiadacza konta <span className="text-red-500">*</span></Label>
            <Input
              id="ba-holder"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="BezpieczneFaktury"
              className={cn(errors.holderName && 'border-red-400')}
            />
            {errors.holderName && <p className="text-xs text-red-500">{errors.holderName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ba-iban">Numer IBAN <span className="text-red-500">*</span></Label>
            <Input
              id="ba-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              disabled={!isIbanEditable}
              className={cn(
                'font-mono text-sm',
                !isIbanEditable && 'bg-slate-50 dark:bg-slate-800/60 text-slate-400',
                errors.iban && 'border-red-400',
              )}
            />
            {errors.iban && <p className="text-xs text-red-500">{errors.iban}</p>}
            {ibanPreview && !errors.iban && (
              <p className="text-xs text-slate-400">Podgląd: {ibanPreview}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ba-bic">BIC / SWIFT</Label>
              <Input
                id="ba-bic"
                value={bic}
                onChange={(e) => setBic(e.target.value)}
                placeholder="BANKPLPW"
                className={cn('font-mono text-sm', errors.bic && 'border-red-400')}
              />
              {errors.bic && <p className="text-xs text-red-500">{errors.bic}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ba-bank-name">Nazwa banku</Label>
              <Input
                id="ba-bank-name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="mBank S.A."
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Ustaw jako domyślne
              </p>
              <p className="text-xs text-slate-400">
                Domyślne konto jest preselektowane przy wystawianiu faktur
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === 'create' ? 'Dodaj' : 'Zapisz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
