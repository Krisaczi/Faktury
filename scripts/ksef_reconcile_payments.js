/**
 * Historical reconciliation script: compares local platform invoice values
 * with the ksef_submission_audit table to find mismatches in payment method
 * or due date.
 *
 * Run with: node scripts/ksef_reconcile_payments.js
 *
 * Outputs a CSV report to stdout with rows where:
 *   - payment method differs between invoice and audit record
 *   - due date is missing from audit or differs
 *   - XML payload is missing from audit
 */

// This script uses the Supabase service role client to read all records
// regardless of RLS. It's intended for admin/owner diagnostic use only.

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function reconcile() {
  console.error('[reconcile] Fetching submitted platform invoices...');

  const { data: invoices, error: invErr } = await supabase
    .from('platform_invoices')
    .select('id, invoice_number, payment_method, due_date, ksef_number, ksef_status')
    .not('ksef_status', 'is', null)
    .order('created_at', { ascending: false });

  if (invErr) {
    console.error('[reconcile] Error fetching invoices:', invErr.message);
    process.exit(1);
  }

  console.error(`[reconcile] Found ${invoices.length} submitted invoices`);

  const rows = [];
  let mismatches = 0;

  for (const inv of invoices) {
    const { data: audit } = await supabase
      .from('ksef_submission_audit')
      .select('id, payment_method_sent, due_date_sent, xml_payload, ksef_number, attempt_result, created_at')
      .eq('invoice_id', inv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const auditPm = audit?.payment_method_sent ?? null;
    const auditDue = audit?.due_date_sent ?? null;
    const hasXml = !!audit?.xml_payload;

    const pmMismatch = auditPm && auditPm !== inv.payment_method;
    const dueMissing = !auditDue;
    const dueMismatch = auditDue && inv.due_date && auditDue !== inv.due_date;
    const xmlMissing = !hasXml && !!audit;

    const isMismatch = pmMismatch || dueMissing || dueMismatch || xmlMissing;

    if (isMismatch) mismatches++;

    rows.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      ksef_number: inv.ksef_number ?? audit?.ksef_number ?? '',
      invoice_payment_method: inv.payment_method ?? '',
      audit_payment_method: auditPm ?? '',
      payment_method_mismatch: pmMismatch ? 'YES' : 'no',
      invoice_due_date: inv.due_date ?? '',
      audit_due_date: auditDue ?? '',
      due_date_missing: dueMissing ? 'YES' : 'no',
      due_date_mismatch: dueMismatch ? 'YES' : 'no',
      xml_payload_missing: xmlMissing ? 'YES' : 'no',
      audit_found: audit ? 'yes' : 'NO',
      ksef_status: inv.ksef_status ?? '',
    });
  }

  // CSV header
  const headers = [
    'invoice_id',
    'invoice_number',
    'ksef_number',
    'invoice_payment_method',
    'audit_payment_method',
    'payment_method_mismatch',
    'invoice_due_date',
    'audit_due_date',
    'due_date_missing',
    'due_date_mismatch',
    'xml_payload_missing',
    'audit_found',
    'ksef_status',
  ];

  console.log(headers.join(','));

  for (const row of rows) {
    console.log(headers.map(h => csvEscape(row[h])).join(','));
  }

  console.error(`[reconcile] Total: ${rows.length} invoices, ${mismatches} mismatches found`);
}

reconcile().catch(err => {
  console.error('[reconcile] Fatal error:', err);
  process.exit(1);
});
