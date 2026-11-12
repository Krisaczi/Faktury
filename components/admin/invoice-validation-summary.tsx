import { AlertTriangle } from 'lucide-react';
import type { InvoiceValidationIssue } from '@/lib/invoices/validate-invoice';

export function InvoiceValidationSummary({ issues }: { issues: InvoiceValidationIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Faktura nie może zostać wysłana do KSeF.
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300">Uzupełnij brakujące dane:</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {issues.map((issue) => (
              <li key={issue.field}>{issue.label}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
