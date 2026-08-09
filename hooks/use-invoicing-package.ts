'use client';

import useSWR from 'swr';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

function getClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

interface CompanyPackageInfo {
  product_type:   string | null;
  invoicing_enabled: boolean;
}

async function fetchInvoicingEnabled(): Promise<CompanyPackageInfo> {
  const supabase = getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { product_type: null, invoicing_enabled: false };

  const { data } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle();

  const companyId = data?.company_id;
  if (!companyId) return { product_type: null, invoicing_enabled: false };

  const { data: company } = await supabase
    .from('companies')
    .select('product_type')
    .eq('id', companyId)
    .maybeSingle();

  const productType = company?.product_type ?? 'starter';
  return {
    product_type: productType,
    invoicing_enabled: productType === 'professional',
  };
}

/**
 * Returns whether the current company has invoicing enabled.
 * Starter → false (read-only KSeF preview only)
 * Professional → true (full invoicing)
 */
export function useInvoicingPackage() {
  return useSWR<CompanyPackageInfo>('invoicing-package', fetchInvoicingEnabled, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}
