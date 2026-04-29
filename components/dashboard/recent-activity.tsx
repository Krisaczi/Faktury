'use client';

import { FileText, Building2, ShieldAlert, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useT } from '@/providers/i18n-provider';

export function RecentActivity() {
  const t = useT();

  const activities = [
    {
      id: 1,
      type: 'invoice',
      description: t.dashboard.activityInvoiceUploaded,
      detail: 'Invoice #001',
      time: t.dashboard.activityJustNow,
      icon: FileText,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      badge: t.dashboard.activityPending,
      badgeVariant: 'secondary' as const,
    },
    {
      id: 2,
      type: 'vendor',
      description: t.dashboard.activityVendorAdded,
      detail: 'Example Corp',
      time: t.dashboard.activityHoursAgo,
      icon: Building2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      badge: t.dashboard.activityActive,
      badgeVariant: 'secondary' as const,
    },
    {
      id: 3,
      type: 'risk',
      description: t.dashboard.activityRiskReport,
      detail: 'Q1 Financial',
      time: t.dashboard.activityYesterday,
      icon: ShieldAlert,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      badge: t.dashboard.activityCompleted,
      badgeVariant: 'secondary' as const,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">{t.dashboard.recentActivity}</CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t.dashboard.noRecentActivity}</p>
          </div>
        ) : (
          activities.map((activity) => {
            const Icon = activity.icon;
            return (
              <div
                key={activity.id}
                className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    activity.bg
                  )}
                >
                  <Icon className={cn('h-4 w-4', activity.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none">
                    {activity.description}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activity.detail}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={activity.badgeVariant} className="text-xs">
                    {activity.badge}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {activity.time}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
