'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PackageType } from '@/lib/permissions';

export interface UserPackageData {
  packageType: PackageType | null;
  companyId:   string | null;
  loading:     boolean;
}

/**
 * Fetches the current user's company package type from the database.
 * Used by frontend components to gate invoicing features (Starter = read-only,
 * Professional = full invoicing).
 */
export function useUserPackage(): UserPackageData {
  const [packageType, setPackageType] = useState<PackageType | null>(null);
  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: userRow } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userRow?.company_id) { setLoading(false); return; }
      setCompanyId(userRow.company_id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: company } = await (supabase as any)
        .from('companies')
        .select('product_type')
        .eq('id', userRow.company_id)
        .maybeSingle();

      setPackageType((company?.product_type ?? 'starter') as PackageType);
      setLoading(false);
    }

    init();
  }, []);

  return { packageType, companyId, loading };
}
