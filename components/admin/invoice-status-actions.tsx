'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Lock, Pencil, ShieldCheck, Trash2, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { InvoiceValidationSummary } from '@/components/admin/invoice-validation-summary';
import { deleteDraft, validateInvoice } from '@/app/(admin)/admin/invoices/actions';
import type { InvoiceValidationIssue } from '@/lib/invoices/validate-invoice';
import { isDeletable, isEditable, isSubmittable, type IssuedInvoiceStatus } from '@/types/issued-invoice';

interface InvoiceStatusActionsProps {
  invoiceId: string;
  status: IssuedInvoiceStatus;
  canEdit: boolean;
  canValidate: boolean;
}

export function InvoiceStatusActions({ invoiceId, status, canEdit, canValidate }: InvoiceStatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [issues, setIssues] = useState<InvoiceValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const editable = isEditable(status);
  const showEdit = editable && canEdit;
  const showValidate = editable && canValidate && !isSubmittable(status);
  const showDelete = isDeletable(status) && canEdit;

  const handleValidate = () => {
    startTransition(async () => {
      const result = await validateInvoice(invoiceId);
      if (!result.ok) {
        setIssues(result.issues ?? []);
        setError(result.issues ? null : result.error);
        return;
      }
      setIssues([]);
      setError(null);
      toast.success('Faktura gotowa do wysłania', {
        description: 'Możesz teraz wysłać fakturę do KSeF.',
      });
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteDraft(invoiceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success('Szkic został usunięty');
      router.push('/admin/invoices');
    });
  };

  return (
    <div className="space-y-4">
      {(showEdit || showValidate || showDelete) && (
        <div className="flex flex-wrap items-center gap-3">
          {showEdit && (
            <Link
              href={`/admin/invoices/${invoiceId}/edit`}
              className="inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edytuj
            </Link>
          )}

          {showValidate && (
            <Button
              type="button"
              onClick={handleValidate}
              disabled={isPending}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20"
            >
              {isPending ? <Loader className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Zwaliduj fakturę
            </Button>
          )}

          {showDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending} className="gap-2 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30">
                  <Trash2 className="w-4 h-4" />
                  Usuń szkic
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Usunąć szkic faktury?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tej operacji nie można cofnąć. Faktura zostanie usunięta razem z pozycjami.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
                    Usuń szkic
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {!editable && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 p-4">
          <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Ta faktura została wysłana do KSeF i jest tylko do odczytu. Zmiany wymagają faktury korygującej.
          </p>
        </div>
      )}

      {editable && status === 'ready_for_ksef' && issues.length === 0 && !error && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Faktura jest gotowa do wysłania do KSeF. Edycja spowoduje konieczność ponownej walidacji.
        </p>
      )}

      <InvoiceValidationSummary issues={issues} />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
