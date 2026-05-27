'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/permissions';

export interface UserRoleData {
  id:    string;
  email: string | null;
  role:  AppRole;
}

/**
 * Fetches the current user's row from `users` (which holds the canonical role)
 * and subscribes to realtime changes so the role badge updates immediately
 * if an admin changes the user's role.
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
        .select('id, email, role')
        .eq('id', user.id)
        .maybeSingle();

      setData({
        id:    user.id,
        email: row?.email ?? user.email ?? null,
        role:  (row?.role ?? user.user_metadata?.role ?? 'member') as AppRole,
      });
      setLoading(false);
    }

    init();

    // Unique channel name per mount avoids "cannot add callbacks after subscribe()"
    // when React StrictMode unmounts/remounts or the component re-renders.
    const channelName = `user-role-watch-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          if (!userId || payload.new?.id !== userId) return;
          setData(prev => prev
            ? { ...prev, role: (payload.new.role ?? 'member') as AppRole }
            : prev
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { data, loading };
}
