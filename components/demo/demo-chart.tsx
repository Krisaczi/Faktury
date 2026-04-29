import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { pl as t } from '@/lib/i18n/pl';

interface ChartWeek {
  week: string;
  low: number;
  medium: number;
  high: number;
}

interface DemoChartProps {
  data: ChartWeek[];
}

export function DemoChart({ data }: DemoChartProps) {
  const maxTotal = Math.max(...data.map((d) => d.low + d.medium + d.high));

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">{t.dashboard.chartTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{t.dashboard.chartDesc}</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 h-44">
          {data.map((week) => {
            const total = week.low + week.medium + week.high;
            const lowH = maxTotal > 0 ? (week.low / maxTotal) * 160 : 0;
            const medH = maxTotal > 0 ? (week.medium / maxTotal) * 160 : 0;
            const highH = maxTotal > 0 ? (week.high / maxTotal) * 160 : 0;

            return (
              <div key={week.week} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{total}</span>
                <div className="flex w-full flex-col-reverse items-stretch gap-px" style={{ height: 160 }}>
                  <div
                    className="w-full rounded-b-sm bg-emerald-400 transition-all duration-500"
                    style={{ height: lowH }}
                    title={`Low: ${week.low}`}
                  />
                  <div
                    className="w-full bg-amber-400 transition-all duration-500"
                    style={{ height: medH }}
                    title={`Medium: ${week.medium}`}
                  />
                  <div
                    className="w-full rounded-t-sm bg-rose-500 transition-all duration-500"
                    style={{ height: highH }}
                    title={`High: ${week.high}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{week.week}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
            <span className="text-xs text-muted-foreground">{t.invoices.riskLabels.high}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
            <span className="text-xs text-muted-foreground">{t.invoices.riskLabels.medium}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
            <span className="text-xs text-muted-foreground">{t.invoices.riskLabels.low}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
