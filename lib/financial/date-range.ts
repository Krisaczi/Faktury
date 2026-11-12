export type FinancialPeriod = 'week' | 'month' | 'quarter' | 'year' | 'ytd' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

export function resolvePeriodRange(period: Exclude<FinancialPeriod, 'custom'>, now: Date): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'week': {
      const start = startOfWeek(now);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'month':
      return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { from: toIsoDate(new Date(y, qStart, 1)), to: toIsoDate(new Date(y, qStart + 3, 0)) };
    }
    case 'year':
      return { from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(new Date(y, 11, 31)) };
    case 'ytd':
      return { from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(now) };
  }
}

export function isValidDateRange(range: DateRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
}

export function trendBucketFor(range: DateRange): 'day' | 'month' {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  return days > 92 ? 'month' : 'day';
}
