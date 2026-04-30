import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import type { Vendor } from '@/types';

export function useVendors() {
  const supabase = createClient();

  const fetcher = async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message ?? 'Failed to fetch vendors');
    return data as Vendor[];
  };

  return useSWR('vendors', fetcher);
}
