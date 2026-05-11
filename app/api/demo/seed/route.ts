import { NextRequest, NextResponse } from 'next/server';
import { seedDemoSession } from '@/lib/demo/seeder';

// Guard: only allow seeding when a server secret is provided.
// In production point DEMO_SEED_SECRET at a strong random string.
function validateSeedSecret(req: NextRequest): boolean {
  const secret = process.env.DEMO_SEED_SECRET;
  // If no secret configured, disallow in production
  if (!secret) return process.env.NODE_ENV !== 'production';
  const provided = req.headers.get('x-demo-seed-secret') ?? '';
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!validateSeedSecret(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    ttlHours?: number;
    preset?:   'small' | 'full';
  };

  const ttlHours = typeof body.ttlHours === 'number' && body.ttlHours > 0 && body.ttlHours <= 168
    ? body.ttlHours
    : 24;
  const preset: 'small' | 'full' =
    body.preset === 'small' ? 'small' : 'full';

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  try {
    const result = await seedDemoSession({ preset, ttlHours, createdByIp: ip });

    return NextResponse.json({
      demoSessionId:       result.demoSessionId,
      demoUserCredentials: {
        email:    result.demoEmail,
        password: result.demoPassword,
      },
      demoCompanyId: result.demoCompanyId,
      expiresAt:     result.expiresAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Seeding failed';
    console.error('[demo/seed]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
