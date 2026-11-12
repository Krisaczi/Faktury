'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, CircleCheck as CheckCircle2, Loader as Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  parseBankAccountReviewDetails,
  type BankAccountReviewDetails,
} from '@/lib/risk/bank-account-review';
import { BankAccountReviewDialog } from '@/components/invoice/bank-account-review-dialog';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface RiskFinding {
  id: string;
  rule_code: string;
  rule_name: string;
  severity: Severity;
  message: string;
  details: unknown;
}

const BANK_ACCOUNT_RULE = 'supplier_bank_account_changed';

const SEVERITY_STYLES: Record<Severity, { label: string; dot: string; badge: string }> = {
  critical: {
    label: 'Critical',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  },
  high: {
    label: 'High',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  },
  low: {
    label: 'Low',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export function RiskFindingsCard({ invoiceId }: { invoiceId: string }) {
  const [findings, setFindings] = useState<RiskFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<BankAccountReviewDetails | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const loadFindings = useCallback(async () => {
    const { data, error: queryError } = await getSupabaseBrowserClient()
      .from('invoice_risk_findings')
      .select('id, rule_code, rule_name, severity, message, details')
      .eq('invoice_id', invoiceId);

    if (queryError) {
      setError('Could not load the risk analysis results.');
      return;
    }
    const rows = (data ?? []) as RiskFinding[];
    rows.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    setFindings(rows);
  }, [invoiceId]);

  useEffect(() => {
    setFindings(null);
    setError(null);
    loadFindings();
  }, [loadFindings]);

  const openReview = (finding: RiskFinding) => {
    setReview(parseBankAccountReviewDetails(finding.details));
    setReviewOpen(true);
  };

  return (
    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Risk analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {findings === null && !error && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        )}

        {error && (
          <p className="py-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {findings && findings.length === 0 && (
          <div className="flex items-center gap-2 py-4 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
No risks detected for this invoice.
          </div>
        )}

        {findings && findings.length > 0 && (
          <ul className="space-y-3 py-2">
            {findings.map((finding) => {
              const style = SEVERITY_STYLES[finding.severity];
              return (
                <li
                  key={finding.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {finding.rule_name}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0',
                        style.badge,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {finding.message}
                  </p>
                  {finding.rule_code === BANK_ACCOUNT_RULE && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => openReview(finding)}>
                        Review bank account
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {review && (
          <BankAccountReviewDialog
            invoiceId={invoiceId}
            details={review}
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            onDecided={loadFindings}
          />
        )}
      </CardContent>
    </Card>
  );
}
