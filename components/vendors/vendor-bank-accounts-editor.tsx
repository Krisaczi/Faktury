'use client';

import { useState } from 'react';
import { Landmark, Loader as Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { validateIban, formatIban } from '@/lib/validations/iban';
import type { VendorBankAccount } from '@/hooks/use-vendors';

interface VendorBankAccountsEditorProps {
  accounts: VendorBankAccount[];
  onAdd: (input: { bank_account_number: string; bank_name: string }) => Promise<void>;
  onRemove: (accountId: string) => Promise<void>;
}

export function VendorBankAccountsEditor({ accounts, onAdd, onRemove }: VendorBankAccountsEditorProps) {
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [ibanError, setIbanError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd() {
    setFormError(null);
    const validation = validateIban(iban);
    setIbanError(validation);
    if (validation) return;

    setAdding(true);
    try {
      await onAdd({ bank_account_number: iban, bank_name: bankName.trim() });
      setIban('');
      setBankName('');
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Could not save bank account');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(accountId: string) {
    setFormError(null);
    setRemovingId(accountId);
    try {
      await onRemove(accountId);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Could not remove bank account');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bank accounts</span>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-400">No bank accounts saved for this vendor yet.</p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex items-center justify-between gap-3 rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {acc.bank_name ?? 'Unnamed bank'}
                </p>
                <p className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all">
                  {formatIban(acc.bank_account_number)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] capitalize">{acc.source}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                  aria-label="Remove bank account"
                  disabled={removingId === acc.id}
                  onClick={() => handleRemove(acc.id)}
                >
                  {removingId === acc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">IBAN</Label>
          <Input
            value={iban}
            onChange={(e) => {
              setIban(e.target.value);
              if (ibanError) setIbanError(null);
            }}
            placeholder="PL61 1090 1014 0000 0712 1981 2874"
            className="font-mono text-sm"
            aria-invalid={ibanError ? true : undefined}
          />
          {ibanError && <p className="text-xs text-red-600 dark:text-red-400">{ibanError}</p>}
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Bank name</Label>
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 h-8"
          onClick={handleAdd}
          disabled={adding || !iban.trim()}
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add bank account
        </Button>
      </div>
    </div>
  );
}
