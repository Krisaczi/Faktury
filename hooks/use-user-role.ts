'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/permissions';

export interface UserRoleData {
  id:          string;
  email:       string | null;
  role:        AppRole;
  packageType: string | null;
}

/**
 * Fetches the current user's row from `users` (which holds the canonical role)
 * and subscribes to realtime changes so the role badge updates immediately
 * if the owner changes the user's role.
 */
export function useUserRole() {
  const [data,    setData]    = useState<UserRoleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let userId: string | null = null;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      userId = user.id;

      const { data: row } = await supabase
        .from('users')
        .select('id, email, role, company_id')
        .eq('id', user.id)
        .maybeSingle();

      // Fetch the company's package type so role-based invoicing checks are package-aware
      let packageType: string | null = null;
      if (row?.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('product_type')
          .eq('id', row.company_id)
          .maybeSingle();
        packageType = company?.product_type ?? null;
      }

      setData({
        id:          user.id,
        email:       row?.email ?? user.email ?? null,
        role:        (row?.role ?? 'accountant') as AppRole,
        packageType,
      });
      setLoading(false);
    }

    init();

    const channelName = `user-role-watch-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          if (!userId || payload.new?.id !== userId) return;
          setData(prev => prev
            ? { ...prev, role: (payload.new.role ?? 'accountant') as AppRole }
            : prev
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { data, loading };
}
