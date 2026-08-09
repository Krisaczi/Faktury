import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCompanyPackage } from '@/lib/packages/get-company-package';

/**
 * Resolves the authenticated user + their company_id from the request.
 * Returns a 401 NextResponse if unauthenticated, or the user record on success.
 */
export async function getRequestUser() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id, role, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!userRecord?.company_id) return null;

  return { user, userRecord, supabase, companyId: userRecord.company_id as string };
}

export type RequestUser = Awaited<ReturnType<typeof getRequestUser>> extends infer T
  ? Exclude<T, null>
  : never;

/**
 * Checks whether the company has invoicing enabled (Pro or Owner).
 * Returns null if allowed, or a 403 NextResponse if the company is on Starter.
 *
 * Usage in API routes:
 *   const forbidden = await requireInvoicingPackage(companyId);
 *   if (forbidden) return forbidden;
 */
export async function requireInvoicingPackage(
  companyId: string,
): Promise<NextResponse | null> {
  const pkg = await getCompanyPackage(companyId);
  if (pkg.features.invoicing) return null;

  return NextResponse.json(
    {
      error:
        'Fakturowanie nie jest dostępne w pakiecie Starter. ' +
        'Możesz przeglądać faktury z KSeF, ale tworzenie, edycja i wysyłka ' +
        'wymagają pakietu Pro. Przejdź na Pro, aby odblokować pełne fakturowanie.',
      code: 'INVOICING_NOT_AVAILABLE',
      upgradeRequired: true,
    },
    { status: 403 },
  );
}

/**
 * Returns true if the company has invoicing enabled (Pro or Owner).
 * For use in server components / server actions where you need a boolean.
 */
export async function isInvoicingEnabled(companyId: string): Promise<boolean> {
  const pkg = await getCompanyPackage(companyId);
  return pkg.features.invoicing;
}
