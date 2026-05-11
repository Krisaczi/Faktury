'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;
let clientUrl: string | undefined;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (client && clientUrl === url) return client;
  clientUrl = url;
  client = createBrowserClient<Database>(
    url!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}
