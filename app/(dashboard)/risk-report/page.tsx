import { Header } from '@/components/layout/header';
import { RiskOverview } from '@/components/risk-report/risk-overview';
import { pl as t } from '@/lib/i18n/pl';

export default function RiskReportPage() {
  return (
    <div className="flex flex-col">
      <Header
        title={t.riskReport.title}
        description={t.riskReport.subtitle}
      />
      <div className="p-6">
        <RiskOverview />
      </div>
    </div>
  );
}
