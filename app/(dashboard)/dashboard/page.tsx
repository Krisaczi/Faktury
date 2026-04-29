import { Header } from '@/components/layout/header';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { InvoicesChart } from '@/components/dashboard/invoices-chart';
import { pl as t } from '@/lib/i18n/pl';

export default async function DashboardPage() {
  return (
    <div className="flex flex-col">
      <Header
        title={t.dashboard.title}
        description={t.dashboard.subtitle}
      />
      <div className="flex flex-col gap-6 p-6">
        <StatsCards />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <InvoicesChart />
          <div className="flex flex-col gap-4">
            <QuickActions />
          </div>
        </div>

        <RecentActivity />
      </div>
    </div>
  );
}
