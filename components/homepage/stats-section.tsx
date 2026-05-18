'use client';

import { useHomepageStats } from '@/hooks/use-homepage-stats';
import { cn } from '@/lib/utils';

const STAT_META = [
  { key: 'enterprises'    as const, label: 'Enterprises trust us' },
  { key: 'vendors'        as const, label: 'Vendors monitored' },
  { key: 'flaggedInvoices' as const, label: 'Flagged invoices' },
  { key: 'flaggedAmount'  as const, label: 'Flagged invoice value' },
];

function StatSkeleton() {
  return (
    <div className="text-center" aria-hidden="true">
      <div className="h-9 w-20 mx-auto rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse mb-2" />
      <div className="h-4 w-28 mx-auto rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
    </div>
  );
}

export function HomepageStatsSection() {
  const { stats, isLoading } = useHomepageStats();
  const showSkeleton = isLoading || !stats;

  return (
    <section
      className="py-12 border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50"
      aria-label="Platform statistics"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
        {showSkeleton
          ? STAT_META.map(({ key }) => <StatSkeleton key={key} />)
          : STAT_META.map(({ key, label }) => (
              <div key={key} className="text-center">
                <p className={cn('text-3xl font-bold text-slate-900 dark:text-white tabular-nums')}>
                  {stats[key]}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
              </div>
            ))
        }
      </div>
    </section>
  );
}
