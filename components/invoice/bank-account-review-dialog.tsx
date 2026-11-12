'use client';

import { useState } from 'react';
import { CircleCheck as CheckCircle2, CircleX as XCircle, TriangleAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { BankAccountDecision, BankAccountReviewDetails } from '@/lib/risk/bank-account-review';

interface BankAccountReviewDialogProps {
  invoiceId: string;
  details: BankAccountReviewDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecided: () => void;
}

type Outcome = { vendorUpdated: boolean };

function formatAccount(account: string | null): string {
  if (!account) return '—';
  return account.replace(/(.{4})/g, '$1 ').trim();
}

async function submitDecision(
  invoiceId: string,
  action: BankAccountDecision,
  confirmNotVerified: boolean
): Promise<Outcome> {
  const res = await fetch(`/api/invoices/${invoiceId}/bank-account-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, confirmNotVerified }),
  });
  const json = (await res.json().catch(() => null)) as
    | { vendorUpdated?: unknown; error?: unknown }
    | null;
  if (!res.ok) {
    throw new Error(typeof json?.error === 'string' ? json.error : 'Could not save your decision.');
  }
  if (typeof json?.vendorUpdated !== 'boolean') {
    throw new Error('Unexpected response from the server.');
  }
  return { vendorUpdated: json.vendorUpdated };
}

export function BankAccountReviewDialog({
  invoiceId,
  details,
  open,
  onOpenChange,
  onDecided,
}: BankAccountReviewDialogProps) {
  const [pending, setPending] = useState<'account_added' | 'kept_for_invoice' | 'add_anyway' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const status = details.whiteList?.status ?? 'ERROR';
  const verified = status === 'VALID';

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setError(null);
      setOutcome(null);
    }
    onOpenChange(next);
  };

  const run = async (action: BankAccountDecision, confirmNotVerified: boolean, key: typeof pending) => {
    setPending(key);
    setError(null);
    try {
      const result = await submitDecision(invoiceId, action, confirmNotVerified);
      setOutcome(result);
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your decision.');
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {outcome ? (
          <>
            <DialogHeader>
              <DialogTitle>{outcome.vendorUpdated ? 'Account added to vendor profile' : 'Kept for this invoice only'}</DialogTitle>
              <DialogDescription>
                {outcome.vendorUpdated
                  ? 'The account is now approved for this vendor. Future invoices will be checked against it.'
                  : 'The vendor profile was not changed. Future invoices from this vendor will ask for a decision again.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New Supplier Bank Account Detected</DialogTitle>
              <DialogDescription>
                The vendor profile is not changed unless you approve this account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Vendor</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{details.vendorName ?? 'Unknown vendor'}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Previous accounts</p>
                {details.previousAccounts.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {details.previousAccounts.map((account) => (
                      <li key={account} className="font-mono text-slate-700 dark:text-slate-300">{account}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-slate-600 dark:text-slate-400">No approved accounts yet.</p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">New account</p>
                <p className="mt-1 font-mono font-medium text-slate-900 dark:text-slate-100">
                  {details.currentAccount ?? '—'}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{formatAccount(details.newAccount)}</p>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">White List status</p>
                {verified ? (
                  <div className="mt-2 flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Verified on White List
                      {details.whiteList?.companyName ? <span className="block text-xs text-slate-600 dark:text-slate-400">{details.whiteList.companyName}</span> : null}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 flex items-start gap-2 text-red-700 dark:text-red-400">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      {status === 'NOT_FOUND' || status === 'INVALID' ? 'Account not verified on White List' : 'White List could not be checked'}
                      {details.whiteList?.message ? <span className="block text-xs text-slate-600 dark:text-slate-400">{details.whiteList.message}</span> : null}
                    </p>
                  </div>
                )}
              </div>

              {verified ? (
                <p className="text-slate-700 dark:text-slate-300">Do you want to add this account to the vendor profile?</p>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Adding this account is not recommended.</p>
                </div>
              )}

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              {verified ? (
                <>
                  <Button
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => run('kept_for_invoice', false, 'kept_for_invoice')}
                  >
                    {pending === 'kept_for_invoice' ? 'Saving...' : 'Keep For This Invoice Only'}
                  </Button>
                  <Button
                    disabled={pending !== null}
                    onClick={() => run('account_added', false, 'account_added')}
                  >
                    {pending === 'account_added' ? 'Saving...' : 'Add Account'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" disabled={pending !== null} onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={pending !== null}
                    onClick={() => run('account_added', true, 'add_anyway')}
                  >
                    {pending === 'add_anyway' ? 'Saving...' : 'Add Anyway'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
