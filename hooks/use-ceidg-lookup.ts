'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CeidgCompany, CeidgLookupResponse } from '@/lib/ceidg/ceidg-company';

export type CeidgLookupState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'found'; company: CeidgCompany; fromCache: boolean; checkedAt: string }
  | { phase: 'error'; message: string };

const DEBOUNCE_MS = 600;

const ERROR_MESSAGES: Record<string, string> = {
  invalid_nip: 'Nieprawidłowy format NIP.',
  not_found: 'Nie znaleziono firmy w CEIDG.',
  rate_limited: 'Przekroczono limit zapytań CEIDG. Spróbuj ponownie za chwilę.',
};
const DEFAULT_ERROR = 'Nie udało się połączyć z CEIDG. Spróbuj ponownie później.';

export function useCeidgLookup() {
  const [state, setState] = useState<CeidgLookupState>({ phase: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const cancelPending = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    requestIdRef.current += 1;
  }, []);

  const lookup = useCallback(async (nip: string) => {
    cancelPending();
    const requestId = requestIdRef.current;
    setState({ phase: 'loading' });

    const { data, error } = await getSupabaseBrowserClient().functions.invoke('ceidgLookup', {
      body: { nip },
    });

    if (requestId !== requestIdRef.current) return;

    const payload = data as Partial<CeidgLookupResponse> & { code?: string; error?: string } | null;
    if (error || !payload?.company) {
      const code = payload?.code ?? '';
      setState({ phase: 'error', message: ERROR_MESSAGES[code] ?? DEFAULT_ERROR });
      return;
    }

    setState({
      phase: 'found',
      company: payload.company,
      fromCache: payload.fromCache === true,
      checkedAt: payload.checkedAt ?? new Date().toISOString(),
    });
  }, [cancelPending]);

  const scheduleLookup = useCallback((nip: string) => {
    cancelPending();
    if (!/^\d{10}$/.test(nip)) {
      setState({ phase: 'idle' });
      return;
    }
    timerRef.current = setTimeout(() => {
      void lookup(nip);
    }, DEBOUNCE_MS);
  }, [cancelPending, lookup]);

  const reset = useCallback(() => {
    cancelPending();
    setState({ phase: 'idle' });
  }, [cancelPending]);

  useEffect(() => cancelPending, [cancelPending]);

  return { state, lookup, scheduleLookup, reset };
}
