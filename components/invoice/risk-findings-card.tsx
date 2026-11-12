'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, CircleCheck as CheckCircle2, Loader as Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface RiskFinding {
  id: string;
  rule_name: string;
  severity: Severity;
  message: string;
}

const SEVERITY_STYLES: Record<Severity, { label: string; dot: string; badge: string }> = {
  critical: {
    label: 'Krytyczne',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  },
  high: {
    label: 'Wysokie',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
  },
  medium: {
    label: 'Średnie',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  },
  low: {
    label: 'Niskie',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export function RiskFindingsCard({ invoiceId }: { invoiceId: string }) {
  const [findings, setFindings] = useState<RiskFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFindings(null);
    setError(null);

    getSupabaseBrowserClient()
      .from('invoice_risk_findings')
      .select('id, rule_name, severity, message')
      .eq('invoice_id', invoiceId)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError('Nie udało się wczytać wyników analizy ryzyka.');
          return;
        }
        const rows = (data ?? []) as RiskFinding[];
        rows.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
        setFindings(rows);
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  return (
    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Wyniki analizy ryzyka
        </CardTitle>
      </CardHeader>
      <CardContent>
        {findings === null && !error && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Wczytywanie...
          </div>
        )}

        {error && (
          <p className="py-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {findings && findings.length === 0 && (
          <div className="flex items-center gap-2 py-4 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            Nie wykryto zagrożeń dla tej faktury.
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
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
