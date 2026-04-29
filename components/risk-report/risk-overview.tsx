'use client';

import { ShieldAlert, ShieldCheck, RefreshCw, Plus } from 'lucide-react';
import { useRiskReports } from '@/hooks/use-risk-reports';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useT } from '@/providers/i18n-provider';

function ScoreIndicator({ score }: { score: number }) {
  const color =
    score < 30
      ? 'text-emerald-600'
      : score < 60
      ? 'text-amber-600'
      : 'text-rose-600';
  const progressColor =
    score < 30
      ? 'bg-emerald-500'
      : score < 60
      ? 'bg-amber-500'
      : 'bg-rose-500';

  const t = useT();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t.riskReport.riskScore}</span>
        <span className={cn('text-sm font-bold', color)}>{score}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', progressColor)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function RiskOverview() {
  const { data: reports, isLoading, error, mutate } = useRiskReports();
  const t = useT();

  const statusConfig = {
    draft: { label: t.riskReport.statusLabels.draft, className: 'bg-slate-100 text-slate-600 border-slate-200' },
    completed: { label: t.riskReport.statusLabels.completed, className: 'bg-blue-100 text-blue-700 border-blue-200' },
    reviewed: { label: t.riskReport.statusLabels.reviewed, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  };

  const typeConfig = {
    financial: { label: t.riskReport.typeLabels.financial, color: 'text-blue-600' },
    compliance: { label: t.riskReport.typeLabels.compliance, color: 'text-amber-600' },
    operational: { label: t.riskReport.typeLabels.operational, color: 'text-emerald-600' },
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t.riskReport.reportsCount(reports?.length ?? 0)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => mutate()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            {t.riskReport.generateReport}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-16">
          <ShieldAlert className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t.riskReport.failedToLoad}</p>
        </div>
      ) : reports?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ShieldCheck className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-medium">{t.riskReport.noReports}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.riskReport.noReportsHint}
            </p>
          </div>
          <Button className="mt-2 gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            {t.riskReport.generateReport}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(reports ?? []).map((report) => {
            const status = statusConfig[report.status];
            const type = typeConfig[report.report_type];
            return (
              <Card
                key={report.id}
                className="transition-shadow duration-200 hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold">
                      {report.vendors?.name ?? t.riskReport.unknownVendor}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={cn('shrink-0 text-xs', status.className)}
                    >
                      {status.label}
                    </Badge>
                  </div>
                  <p className={cn('text-xs font-medium', type.color)}>
                    {type.label} {t.riskReport.analysis}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScoreIndicator score={report.score} />
                  <p className="text-xs text-muted-foreground">
                    {t.riskReport.generated}{' '}
                    {new Date(report.generated_at).toLocaleDateString('pl-PL')}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
