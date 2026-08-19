'use client';

import useSWR from 'swr';

export interface InvoiceUsageData {
  issued:    number;
  limit:     number | null;
  remaining: number | null;
  override:  number;
  isLimited: boolean;
  atLimit:   boolean;
  nearLimit: boolean;
  isLoading: boolean;
  isError:   boolean;
  mutate:    () => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch invoice usage');
  return res.json();
};

export function useInvoiceUsage(): InvoiceUsageData {
  const { data, error, mutate } = useSWR('/api/invoices/usage', fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  return {
    issued:    data?.issued ?? 0,
    limit:     data?.limit ?? null,
    remaining: data?.remaining ?? null,
    override:  data?.override ?? 0,
    isLimited: data?.isLimited ?? false,
    atLimit:   data?.atLimit ?? false,
    nearLimit: data?.nearLimit ?? false,
    isLoading: !data && !error,
    isError:   !!error,
    mutate,
  };
}
