'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { canAccessInvoicing, type AppRole } from '@/lib/permissions';

/**
 * Returns whether the current user has access to the invoicing module
 * (role: owner | admin | accountant | viewer) and their exact role.
 */
export function useInvoicingRole() {
  const [role,        setRole]        = useState<AppRole | null>(null);
  const [hasInvoicing, setHasInvoicing] = useState(false);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || cancelled) { setLoading(false); return; }

      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;
      const r = (data?.role ?? 'member') as AppRole;
      setRole(r);
      setHasInvoicing(canAccessInvoicing(r));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  return { role, hasInvoicing, loading };
}
