import { createClient } from '@supabase/supabase-js';

// ─── Admin client ─────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = 'small' | 'full';

interface SeedResult {
  demoSessionId:  string;
  demoCompanyId:  string;
  demoUserId:     string;
  demoEmail:      string;
  demoPassword:   string;
  expiresAt:      string;
}

// ─── Deterministic random helpers (seeded so reruns produce same data) ────────

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomDate(daysAgo: number, rng: () => number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(rng() * daysAgo));
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Seed data definitions ────────────────────────────────────────────────────

const VENDOR_TEMPLATES = [
  { name: 'Technika Sp. z o.o.',        category: 'Technology',    risk_base: 15 },
  { name: 'LogiTrans S.A.',             category: 'Logistics',     risk_base: 28 },
  { name: 'MediaPlus Sp. z o.o.',       category: 'Marketing',     risk_base: 42 },
  { name: 'BuilderPro Sp. z o.o.',      category: 'Construction',  risk_base: 67 },
  { name: 'SupplyChain Masters S.A.',   category: 'Supply Chain',  risk_base: 35 },
  { name: 'CloudServ Sp. z o.o.',       category: 'IT Services',   risk_base: 12 },
  { name: 'FinConsult S.A.',            category: 'Finance',       risk_base: 54 },
  { name: 'GreenEnergy Sp. z o.o.',     category: 'Energy',        risk_base: 22 },
  { name: 'PrintShop Sp. z o.o.',       category: 'Printing',      risk_base: 18 },
  { name: 'SecureIT S.A.',              category: 'Cybersecurity', risk_base: 8  },
];

const RISK_FLAG_TEMPLATES = [
  { type: 'missing_nip',           severity: 'high',   message: 'Seller NIP not present on invoice' },
  { type: 'suspicious_bank',       severity: 'high',   message: 'Bank account not matching known vendor records' },
  { type: 'high_value',            severity: 'medium', message: 'Invoice amount exceeds company threshold' },
  { type: 'duplicate_invoice',     severity: 'high',   message: 'Possible duplicate invoice number detected' },
  { type: 'late_submission',       severity: 'low',    message: 'Invoice submitted more than 30 days after issue date' },
  { type: 'vat_rate_mismatch',     severity: 'medium', message: 'Applied VAT rate inconsistent with product category' },
  { type: 'unregistered_vendor',   severity: 'medium', message: 'Vendor NIP not found in public VAT registry' },
  { type: 'round_number_anomaly',  severity: 'low',    message: 'Invoice total is a suspiciously round number' },
  { type: 'currency_inconsistency',severity: 'low',    message: 'Currency differs from vendor contract currency' },
];

const INVOICE_NUMBERS = (rng: () => number, count: number) =>
  Array.from({ length: count }, (_, i) => `FV/${2024 + Math.floor(i / 100)}/${String(i + 1).padStart(4, '0')}`);

// ─── Main seeder ──────────────────────────────────────────────────────────────

export async function seedDemoSession(opts: {
  preset:       Preset;
  ttlHours:     number;
  createdByIp?: string;
}): Promise<SeedResult> {
  const db     = getAdminClient();
  const rng    = seededRandom(Date.now() & 0xffffff);
  const preset = opts.preset;

  const invoiceCount = preset === 'small' ? 30 : 120;
  const vendorCount  = preset === 'small' ? 4  : 10;

  // ── 1. Create demo company ─────────────────────────────────────────────────
  const { data: company, error: coErr } = await db
    .from('companies')
    .insert({
      name:                'Demo Company Sp. z o.o.',
      nip:                 '1234567890',
      currency:            'PLN',
      subscription_status: 'active',
      is_demo:             true,
    })
    .select('id')
    .single();

  if (coErr || !company) throw new Error(`Company insert failed: ${coErr?.message}`);
  const companyId = company.id as string;

  // ── 2. Create demo Supabase auth user ──────────────────────────────────────
  const demoEmail    = `demo+${Date.now()}@riskguard-demo.example`;
  const demoPassword = generatePassword();

  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email:         demoEmail,
    password:      demoPassword,
    email_confirm: true,
    user_metadata: { is_demo: true, full_name: 'Demo User' },
    app_metadata:  { is_demo: true },
  });

  if (authErr || !authData.user) throw new Error(`Auth user creation failed: ${authErr?.message}`);
  const authUserId = authData.user.id as string;

  // ── 3. Insert public users row ─────────────────────────────────────────────
  await db.from('users').insert({
    id:         authUserId,
    email:      demoEmail,
    company_id: companyId,
    role:       'owner',
  });

  // ── 4. Insert profiles row ─────────────────────────────────────────────────
  await db.from('profiles').insert({
    id:        authUserId,
    email:     demoEmail,
    full_name: 'Demo User',
    role:      'owner',
  });

  // ── 5. Insert vendors ──────────────────────────────────────────────────────
  const vendorTemplates = VENDOR_TEMPLATES.slice(0, vendorCount);
  const { data: vendors } = await db
    .from('vendors')
    .insert(
      vendorTemplates.map((v) => ({
        user_id:    authUserId,
        company_id: companyId,
        name:       v.name,
        category:   v.category,
        risk_score: Math.min(100, v.risk_base + Math.floor(rng() * 20)),
        status:     v.risk_base > 50 ? 'under_review' : 'active',
        nip:        `${Math.floor(1000000000 + rng() * 8999999999)}`,
        contact_email: `contact@${v.name.toLowerCase().replace(/[^a-z]/g, '')}.pl`,
        bank_accounts: [{ iban: `PL${Math.floor(10 + rng() * 89)}${Math.floor(1000000000000000000 + rng() * 8999999999999999999)}`, currency: 'PLN' }],
        notes: null,
      }))
    )
    .select('id');

  const vendorIds = (vendors ?? []).map((v: { id: string }) => v.id);

  // ── 6. Insert invoices ─────────────────────────────────────────────────────
  const invNumbers = INVOICE_NUMBERS(rng, invoiceCount);
  const riskLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  const currencies = ['PLN', 'PLN', 'PLN', 'EUR'] as string[];

  const invoiceRows = invNumbers.map((num, i) => {
    const issueDate = randomDate(90, rng);
    const dueDate   = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const amount    = Math.round((500 + rng() * 49500) * 100) / 100;
    const riskIdx   = rng() < 0.15 ? 2 : rng() < 0.35 ? 1 : 0;
    const vendorId  = vendorIds.length > 0 ? pickRandom(vendorIds, rng) : null;

    return {
      company_id:     companyId,
      vendor_id:      vendorId,
      invoice_number: num,
      issue_date:     isoDate(issueDate),
      due_date:       isoDate(dueDate),
      amount,
      total_amount:   amount,
      currency:       pickRandom(currencies, rng),
      overall_risk:   riskLevels[riskIdx],
      seller_nip:     riskIdx === 2 && rng() < 0.3 ? null : `${Math.floor(1000000000 + rng() * 8999999999)}`,
      bank_account:   `PL${Math.floor(10 + rng() * 89)}XXXX`,
      raw_file_url:   null,
    };
  });

  // Insert in batches of 50
  const insertedInvoiceIds: string[] = [];
  for (let i = 0; i < invoiceRows.length; i += 50) {
    const { data: invBatch } = await db
      .from('invoices')
      .insert(invoiceRows.slice(i, i + 50))
      .select('id, overall_risk');
    (invBatch ?? []).forEach((inv: { id: string; overall_risk: string }) => insertedInvoiceIds.push(inv.id));
  }

  // ── 7. Insert risk flags on high/medium invoices ───────────────────────────
  const flagRows: Array<Record<string, unknown>> = [];
  invoiceRows.forEach((inv, i) => {
    const invId = insertedInvoiceIds[i];
    if (!invId) return;
    const flagCount =
      inv.overall_risk === 'high'   ? Math.floor(1 + rng() * 3) :
      inv.overall_risk === 'medium' ? Math.floor(1 + rng() * 2) :
      0;
    for (let f = 0; f < flagCount; f++) {
      const tpl = pickRandom(RISK_FLAG_TEMPLATES, rng);
      flagRows.push({
        invoice_id: invId,
        type:       tpl.type,
        severity:   inv.overall_risk === 'high' && f === 0 ? 'high' : tpl.severity,
        message:    tpl.message,
      });
    }
  });

  if (flagRows.length > 0) {
    for (let i = 0; i < flagRows.length; i += 100) {
      await db.from('risk_flags').insert(flagRows.slice(i, i + 100));
    }
  }

  // ── 8. Create demo_sessions record ────────────────────────────────────────
  const expiresAt = new Date(Date.now() + opts.ttlHours * 60 * 60 * 1000).toISOString();
  const { data: session, error: sessionErr } = await db
    .from('demo_sessions' as never)
    .insert({
      demo_company_id: companyId,
      demo_user_id:    authUserId,
      seed_preset:     preset,
      ttl_hours:       opts.ttlHours,
      expires_at:      expiresAt,
      created_by_ip:   opts.createdByIp ?? null,
      is_active:       true,
    } as never)
    .select('id')
    .single();

  if (sessionErr) throw new Error(`Session insert failed: ${sessionErr.message}`);
  const demoSessionId = (session as { id: string }).id;

  // Update company with session link
  await db
    .from('companies')
    .update({ demo_session_id: demoSessionId })
    .eq('id', companyId);

  // ── 9. Create billing_metadata row (trial) ─────────────────────────────────
  await db.from('billing_metadata').upsert(
    { company_id: companyId, plan_name: 'Demo', status: 'trial' },
    { onConflict: 'company_id' }
  );

  return {
    demoSessionId,
    demoCompanyId: companyId,
    demoUserId:    authUserId,
    demoEmail,
    demoPassword,
    expiresAt,
  };
}

// ─── Password generator ───────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 16; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}
