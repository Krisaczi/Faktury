import Link from 'next/link';
import { FileText, ShieldAlert, Info, ArrowRight, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DemoStatsCards } from '@/components/demo/demo-stats-cards';
import { DemoChart } from '@/components/demo/demo-chart';
import demoSummary from '@/data/demoSummary.json';
import { pl as t } from '@/lib/i18n/pl';

export default function DemoDashboardPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-6">
        <div>
          <h1 className="text-lg font-semibold">{t.dashboard.title}</h1>
          <p className="text-xs text-muted-foreground">{t.dashboard.subtitle}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/login">{t.demo.upgradeButton}</Link>
        </Button>
      </header>

      <div className="flex flex-col gap-6 p-6">
        <DemoStatsCards
          totalInvoices={demoSummary.totalInvoices}
          highRisk={demoSummary.highRisk}
          plnSaved={demoSummary.plnSaved}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <DemoChart data={demoSummary.chartData} />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-base font-semibold">{t.demo.weeklySummary}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {demoSummary.weeklySummary}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-medium text-muted-foreground">{t.demo.scanned}</span>
                  </div>
                  <p className="text-xl font-bold">{demoSummary.totalInvoices}</p>
                  <p className="text-xs text-muted-foreground">{t.invoices.title.toLowerCase()}</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                    <span className="text-xs font-medium text-rose-700">{t.demo.highRisk}</span>
                  </div>
                  <p className="text-xl font-bold text-rose-700">{demoSummary.highRisk}</p>
                  <p className="text-xs text-rose-600">{t.demo.flagged}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center sm:flex-row sm:text-left sm:justify-between sm:py-8 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{t.demo.ctaTitle}</h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-md">
                  {t.demo.ctaDesc}
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="shrink-0 gap-2">
              <Link href="/login">
                {t.demo.upgradeButton}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
