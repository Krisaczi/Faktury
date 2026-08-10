import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { changePasswordSchema } from '@/lib/validations/auth';

/**
 * POST /api/auth/change-password
 *
 * Authenticated change-password endpoint for logged-in users.
 * Requires a valid session. Verifies the current password by
 * re-authenticating with Supabase, then updates the password.
 * All attempts are recorded in audit_logs.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = req.headers.get('user-agent') ?? 'unknown';
  const requestId = crypto.randomUUID();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn(JSON.stringify({
      event: 'password_change_unauthorized',
      requestId,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  // Verify current password by re-authenticating with email + password.
  // This proves the user knows the current password before allowing a change.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  });

  if (signInError) {
    console.warn(JSON.stringify({
      event: 'password_change_wrong_current',
      requestId,
      userId: user.id,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json(
      { error: 'Current password is incorrect', field: 'currentPassword' },
      { status: 403 },
    );
  }

  // Update the password
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  if (updateError) {
    console.error(JSON.stringify({
      event: 'password_change_failed',
      requestId,
      userId: user.id,
      error: updateError.message,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 },
    );
  }

  // Audit log via service role (audit_logs may not allow user-scope inserts)
  const serviceClient = getSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (serviceClient as any)
    .from('audit_logs')
    .insert({
      user_id: user.id,
      company_id: null,
      invoice_id: null,
      action: 'password_changed',
      metadata: { ip, userAgent, requestId },
    })
    .then(({ error: auditError }: { error: { message: string } | null }) => {
      if (auditError) {
        console.error(JSON.stringify({
          event: 'password_change_audit_failed',
          requestId,
          userId: user.id,
          error: auditError.message,
          timestamp: new Date().toISOString(),
        }));
      }
    });

  console.info(JSON.stringify({
    event: 'password_change_success',
    requestId,
    userId: user.id,
    ip,
    timestamp: new Date().toISOString(),
  }));

  return NextResponse.json({ ok: true });
}
