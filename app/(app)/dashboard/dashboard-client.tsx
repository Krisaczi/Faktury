'use client';

import {
  FileText,
  TriangleAlert as AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Upload,
  Building2,
  ChartBar as FileBarChart2,
  Settings,
  Clock,
  Flag,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  useDashboardMetrics,
  useDashboardTimeseries,
  useDashboardActivity,
  type ActivityItem,
} from '@/hooks/use-dashboard';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  SkeletonKpiCard,
  SkeletonActivityFeed,
  SkeletonChartArea,
  ValidatingOverlay,
  InlineLoader,
} from '@/components/ui/skeleton-loaders';
import { StateCard } from '@/components/ui/state-card';
import { PageHeader, Stack, Grid, HStack } from '@/components/ui/layout-primitives';

interface Props {
  firstName:   string;
  companyName: string | null;
  currency:    string;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('pl-PL', {
    style:    'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function activityIcon(kind: ActivityItem['kind']) {
  if (kind === 'invoice') return FileText;
  if (kind === 'flag')    return Flag;
  return Upload;
}

function activityColor(kind: ActivityItem['kind']) {
  if (kind === 'invoice') return 'text-blue-500';
  if (kind === 'flag')    return 'text-red-500';
  return 'text-slate-400';
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  title:     string;
  value:     string | number;
  sub:       string;
  icon:      React.ElementType;
  iconBg:    string;
  iconColor: string;
  loading:   boolean;
  trend?:    { value: number; positive: boolean };
}

function MetricCard({ title, value, sub, icon: Icon, iconBg, iconColor, loading, trend }: MetricCardProps) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow duration-200 animate-fade-up">
      <CardContent className="pt-6 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-9 w-24 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 dark:text-white tabular leading-none mt-1">
                {value}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>
              {trend && !loading && (
                <span className={cn(
                  'text-xs font-medium',
                  trend.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                )}>
                  {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
                </span>
              )}
            </div>
          </div>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

export function DashboardClient({ firstName, companyName, currency }: Props) {
  const {
    data: metrics,
    isLoading: metricsLoading,
    isValidating: metricsValidating,
    error: metricsError,
    mutate: refreshMetrics,
  } = useDashboardMetrics();
  const {
    data: timeseries,
    isLoading: timeseriesLoading,
    isValidating: chartValidating,
  } = useDashboardTimeseries();
  const {
    data: activity,
    isLoading: activityLoading,
    isValidating: activityValidating,
  } = useDashboardActivity();

  const chartData = (timeseries ?? []).map((p) => ({
    date:     format(parseISO(p.day), 'MMM d'),
    Invoices: p.total,
    Flagged:  p.flagged,
  }));

  const pctFlagged =
    metrics && metrics.total_invoices_30d > 0
      ? Math.round((metrics.high_risk_count / metrics.total_invoices_30d) * 100)
      : 0;

  const kpiCards = [
    {
      title:     'Invoices Scanned',
      value:     metrics?.total_invoices_30d ?? 0,
      sub:       'last 30 days',
      icon:      FileText,
      iconBg:    'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title:     'High-Risk Invoices',
      value:     metrics?.high_risk_count ?? 0,
      sub:       `${pctFlagged}% of scanned`,
      icon:      AlertTriangle,
      iconBg:    (metrics?.high_risk_count ?? 0) > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: (metrics?.high_risk_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title:     'Est. Savings',
      value:     metrics ? formatCurrency(metrics.flagged_amount_sum, currency) : formatCurrency(0, currency),
      sub:       'from flagged invoices',
      icon:      ShieldCheck,
      iconBg:    'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title:     'Risk Coverage',
      value:     `${100 - pctFlagged}%`,
      sub:       'invoices cleared',
      icon:      TrendingUp,
      iconBg:    'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-400',
    },
  ];

  return (
    <Stack gap="6" className="max-w-7xl">
      {/* Header */}
      <PageHeader
        title={`Good day, ${firstName}`}
        description={
          companyName
            ? `Invoice analytics for ${companyName}`
            : 'Your company invoice analytics overview.'
        }
      >
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400 dark:text-slate-500">Last 30 days</p>
          {(metricsValidating && !metricsLoading) && (
            <InlineLoader size="xs" className="text-slate-400" label="Refreshing" />
          )}
        </div>
      </PageHeader>

      {/* Error banner (non-blocking — show stale data below) */}
      {metricsError && !metricsLoading && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3"
        >
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">
            Failed to load metrics — showing last known data.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refreshMetrics()}
            className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 h-7 px-2"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <Grid cols={{ base: 1, sm: 2, xl: 4 }} gap="4">
        {kpiCards.map((card) =>
          metricsLoading ? (
            <SkeletonKpiCard key={card.title} />
          ) : (
            <MetricCard key={card.title} {...card} loading={false} />
          )
        )}
      </Grid>

      {/* Chart + Activity */}
      <Grid cols={{ base: 1, lg: 3 }} gap="4">
        {/* Time-series chart */}
        <ValidatingOverlay
          isValidating={chartValidating && !timeseriesLoading}
          className="lg:col-span-2"
        >
          <Card className="border-slate-200 dark:border-slate-800 h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                    Invoices Over Time
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Daily invoices scanned vs flagged — last 30 days
                  </CardDescription>
                </div>
                {chartValidating && !timeseriesLoading && (
                  <InlineLoader size="xs" className="text-slate-400" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {timeseriesLoading ? (
                <SkeletonChartArea height={220} />
              ) : chartData.length === 0 || chartData.every((d) => d.Invoices === 0) ? (
                <StateCard
                  variant="empty"
                  icon={FileText}
                  title="No invoice data yet"
                  description="Upload invoices to see activity trends here."
                  compact
                  primaryAction={{ label: 'Upload invoices', href: '/upload', icon: Upload, variant: 'default' }}
                />
              ) : (
                <div className="animate-fade-in">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradInvoices" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradFlagged" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
                        axisLine={false}
                        tickLine={false}
                        interval={4}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.5 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Invoices"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#gradInvoices)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Flagged"
                        stroke="#ef4444"
                        strokeWidth={2}
                        fill="url(#gradFlagged)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </ValidatingOverlay>

        {/* Recent Activity */}
        <ValidatingOverlay isValidating={activityValidating && !activityLoading}>
          <Card className="border-slate-200 dark:border-slate-800 h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                    Recent Activity
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Latest invoices, flags, and uploads
                  </CardDescription>
                </div>
                {activityValidating && !activityLoading && (
                  <InlineLoader size="xs" className="text-slate-400" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <SkeletonActivityFeed rows={5} />
              ) : !activity || activity.length === 0 ? (
                <StateCard
                  variant="empty"
                  icon={Clock}
                  title="No recent activity"
                  description="Actions and events will appear here."
                  compact
                />
              ) : (
                <div className="space-y-4 animate-fade-in">
                  {activity.map((item) => {
                    const Icon  = activityIcon(item.kind);
                    const color = activityColor(item.kind);
                    return (
                      <div key={item.id} className="flex items-start gap-3 group">
                        <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                          <Icon className={cn('w-3 h-3', color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug truncate">
                            {item.label}
                          </p>
                          <HStack gap="2" className="mt-0.5">
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 h-4 capitalize border-slate-200 dark:border-slate-700 text-slate-500"
                            >
                              {item.kind}
                            </Badge>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {format(parseISO(item.created_at), 'MMM d, HH:mm')}
                            </p>
                          </HStack>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </ValidatingOverlay>
      </Grid>

      {/* Quick Actions */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HStack gap="3" wrap>
            {[
              { label: 'Upload Invoice',   href: '/upload',      icon: Upload },
              { label: 'View Risk Report', href: '/risk-report', icon: FileBarChart2 },
              { label: 'Manage Vendors',   href: '/vendors',     icon: Building2 },
              { label: 'Account Settings', href: '/settings',    icon: Settings },
            ].map(({ label, href, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all duration-150 focus-ring"
              >
                <Icon className="w-4 h-4 text-slate-400" />
                {label}
              </a>
            ))}
          </HStack>
        </CardContent>
      </Card>
    </Stack>
  );
}
