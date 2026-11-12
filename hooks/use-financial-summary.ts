'use client';

import useSWR from 'swr';
import { financialSummaryService } from '@/lib/financial/financial-summary-service';
import type { DateRange } from '@/lib/financial/date-range';
import { isValidDateRange } from '@/lib/financial/date-range';

export function useFinancialSummary(range: DateRange | null) {
  const valid = range && isValidDateRange(range) ? range : null;
  const key = valid ? ['financial-summary', valid.from, valid.to] : null;
  const summary = useSWR(key, () => financialSummaryService.getSummary(valid!), {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
  const trend = useSWR(key ? [...key, 'trend'] : null, () => financialSummaryService.getTrend(valid!), {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
  return { summary, trend };
}
