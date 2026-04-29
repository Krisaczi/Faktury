'use client';

import { AdminAnalyticsMetrics } from './metrics-cards';
import { InvoicesPerDayChart } from './invoices-per-day-chart';
import { HighRiskVendorsChart } from './high-risk-vendors-chart';
import { SubscriptionGrowthChart } from './subscription-growth-chart';
import { CompaniesAtRiskTable } from './companies-at-risk-table';
import { SystemLoadCards } from './system-load-cards';

export function AdminAnalyticsView() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analityka</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Globalne metryki systemu — dane przykładowe
        </p>
      </div>

      <AdminAnalyticsMetrics />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvoicesPerDayChart />
        <HighRiskVendorsChart />
      </div>

      <SubscriptionGrowthChart />

      <CompaniesAtRiskTable />

      <SystemLoadCards />
    </div>
  );
}
