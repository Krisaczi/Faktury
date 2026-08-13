'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Landmark,
  Plus,
  ShieldCheck,
  Star,
  ChevronDown,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useCompanyBankAccounts, refreshBankAccounts } from '@/hooks/use-bank-accounts';
import { validateIban, validateBic, normalizeIban, formatIban, maskIban } from '@/lib/validations/iban';
import { maskIbanForDisplay, formatIbanForDisplay } from '@/lib/bank-accounts/types';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  onAccountSelected?: (iban: string) => void;
}

export function BankAccountSelector({ value, onChange, onAccountSelected }: Props) {
  const { accounts, isLoading, createAccount } = useCompanyBankAccounts();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const defaultAccount = accounts.find((a) => a.is_default);
  const selectedAccount = accounts.find((a) => a.id === value) ?? null;

  // Auto-select default on first load
  if (!value && defaultAccount && accounts.length > 0) {
    onChange(defaultAccount.id);
    if (onAccountSelected) onAccountSelected(defaultAccount.iban);
  }

  function handleSelect(id: string) {
    if (id === '__none') {
      onChange(null);
      if (onAccountSelected) onAccountSelected('');
      return;
    }
    const account = accounts.find((a) => a.id === id);
    if (account) {
      onChange(account.id);
      if (onAccountSelected) onAccountSelected(account.iban);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">Konto płatnika</Label>
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium text-slate-500">Konto płatnika</Label>
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Brak zapisanych kont bankowych. Możesz wystawić fakturę bez wyboru konta, ale zaleca się jego dodanie.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 w-full border-dashed"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Dodaj konto bankowe
          </Button>
        </div>
        {showAddDialog && (
          <InlineAddDialog
            onClose={() => setShowAddDialog(false)}
            onCreated={(account) => {
              onChange(account.id);
              if (onAccountSelected) onAccountSelected(account.iban);
              refreshBankAccounts();
            }}
            createAccount={createAccount}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-slate-500">Konto płatnika</Label>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Dodaj nowe
        </button>
      </div>
      <Select value={value ?? '__none'} onValueChange={handleSelect}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Wybierz konto bankowe…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">
            <span className="text-slate-400">— Brak wyboru —</span>
          </SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              <div className="flex items-center gap-2">
                <span className="text-sm">{account.account_holder_name}</span>
                <span className="text-xs text-slate-400 font-mono">
                  {maskIbanForDisplay(account.iban)}
                </span>
                {account.is_default && (
                  <Star className="w-3 h-3 text-blue-500 fill-blue-500" />
                )}
                {account.verified && (
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedAccount && (
        <p className="text-xs text-slate-400">
          {selectedAccount.bank_name && `${selectedAccount.bank_name} · `}
          <span className="font-mono">{formatIbanForDisplay(selectedAccount.iban)}</span>
          {selectedAccount.bic && ` · ${selectedAccount.bic}`}
        </p>
      )}
      {showAddDialog && (
        <InlineAddDialog
          onClose={() => setShowAddDialog(false)}
          onCreated={(account) => {
            onChange(account.id);
            if (onAccountSelected) onAccountSelected(account.iban);
            refreshBankAccounts();
          }}
          createAccount={createAccount}
        />
      )}
    </div>
  );
}

// ─── Inline Add Dialog ────────────────────────────────────────────────────────

function InlineAddDialog({
  onClose,
  onCreated,
  createAccount,
}: {
  onClose: () => void;
  onCreated: (account: { id: string; iban: string }) => void;
  createAccount: (input: {
    account_holder_name: string;
    iban: string;
    bic?: string | null;
    bank_name?: string | null;
    is_default?: boolean;
  }) => Promise<{ id: string; iban: string }>;
}) {
  const [holderName, setHolderName] = useState('');
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [bankName, setBankName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function handleSubmit() {
    setErrors({});
    setSubmitError('');

    if (!holderName.trim()) {
      setErrors((e) => ({ ...e, holderName: 'Nazwa posiadacza jest wymagana' }));
      return;
    }

    const ibanErr = validateIban(iban);
    if (ibanErr) {
      setErrors((e) => ({ ...e, iban: ibanErr }));
      return;
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
      const account = await createAccount({
        account_holder_name: holderName.trim(),
        iban: normalizeIban(iban),
        bic: bic.trim() || null,
        bank_name: bankName.trim() || null,
        is_default: isDefault,
      });
      toast.success('Konto bankowe dodane');
      onCreated(account);
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
          <DialogTitle>Dodaj konto bankowe</DialogTitle>
          <DialogDescription>
            Dodaj nowe konto bankowe firmy. Po dodaniu zostanie wybrane automatycznie.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {submitError && (
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="inline-ba-holder">Nazwa posiadacza konta <span className="text-red-500">*</span></Label>
            <Input
              id="inline-ba-holder"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="RiskGuard Sp. z o.o."
              className={cn(errors.holderName && 'border-red-400')}
            />
            {errors.holderName && <p className="text-xs text-red-500">{errors.holderName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inline-ba-iban">Numer IBAN <span className="text-red-500">*</span></Label>
            <Input
              id="inline-ba-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              className={cn('font-mono text-sm', errors.iban && 'border-red-400')}
            />
            {errors.iban && <p className="text-xs text-red-500">{errors.iban}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inline-ba-bic">BIC / SWIFT</Label>
              <Input
                id="inline-ba-bic"
                value={bic}
                onChange={(e) => setBic(e.target.value)}
                placeholder="BANKPLPW"
                className={cn('font-mono text-sm', errors.bic && 'border-red-400')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inline-ba-bank">Nazwa banku</Label>
              <Input
                id="inline-ba-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="mBank S.A."
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Ustaw jako domyślne
            </p>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Anuluj</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {submitting ? 'Dodawanie…' : 'Dodaj'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
