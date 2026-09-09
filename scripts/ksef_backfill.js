#!/usr/bin/env node
/**
 * KSeF Backfill Script
 *
 * Finds platform invoices that have been issued but are missing KSeF metadata
 * (ksef_number IS NULL) and attempts to submit them to KSeF.
 *
 * Usage:
 *   node scripts/ksef_backfill.js --dry-run     # Show what would be done
 *   node scripts/ksef_backfill.js --apply       # Actually submit to KSeF
 *
 * Output: CSV report of invoices and their submission results.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

const mode = process.argv.includes('--dry-run') ? 'dry-run' :
             process.argv.includes('--apply')   ? 'apply'    : 'dry-run';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

interface BackfillCandidate {
  id:              string;
  invoice_number:  string | null;
  status:          string;
  ksef_status:     string | null;
  ksef_number:     string | null;
  entity_id:       string;
  total_cents:     number;
  issued_at:       string | null;
  company_name:    string | null;
  company_nip:     string | null;
}

async function findCandidates(): Promise<BackfillCandidate[]> {
  // Find issued platform invoices without ksef_number
  const { data: invoices, error } = await supabase
    .from('platform_invoices')
    .select('id, invoice_number, status, ksef_status, ksef_number, entity_id, total_cents, issued_at')
    .neq('status', 'draft')
    .is('ksef_number', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Error fetching candidates:', error);
    return [];
  }

  if (!invoices || invoices.length === 0) {
    return [];
  }

  // Fetch company names
  const companyIds = Array.from(new Set(invoices.map((i: { entity_id: string }) => i.entity_id)));
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, nip')
    .in('id', companyIds);

  const companyMap = new Map((companies ?? []).map((c: { id: string; name: string; nip: string }) => [c.id, { name: c.name, nip: c.nip }]));

  return invoices.map((inv: {
    id: string; invoice_number: string | null; status: string;
    ksef_status: string | null; ksef_number: string | null;
    entity_id: string; total_cents: number; issued_at: string | null;
  }) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    ksef_status: inv.ksef_status,
    ksef_number: inv.ksef_number,
    entity_id: inv.entity_id,
    total_cents: inv.total_cents,
    issued_at: inv.issued_at,
    company_name: companyMap.get(inv.entity_id)?.name ?? null,
    company_nip: companyMap.get(inv.entity_id)?.nip ?? null,
  }));
}

async function submitInvoice(invoiceId: string): Promise<{ action: string; result: string; notes: string }> {
  try {
    const res = await fetch(`${APP_URL}/api/owner/invoices/${invoiceId}/send-to-ksef`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    });

    const data = await res.json().catch(() => ({ error: 'Invalid response' })) as Record<string, unknown>;

    if (res.ok) {
      return {
        action:  'submit',
        result:  data.ksefStatus as string ?? 'submitted',
        notes:   data.ksefNumber ? `KSeF number: ${data.ksefNumber}` : 'Submitted successfully',
      };
    }

    if (res.status === 202) {
      return {
        action:  'submit',
        result:  'queued',
        notes:   (data.error as string) ?? 'Transient error, queued for retry',
      };
    }

    return {
      action:  'submit',
      result:  data.ksefStatus as string ?? 'failed',
      notes:   (data.error as string) ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      action:  'submit',
      result:  'error',
      notes:   (err as Error).message,
    };
  }
}

async function main() {
  console.log(`\nKSeF Backfill — Mode: ${mode.toUpperCase()}`);
  console.log(`App URL: ${APP_URL}\n`);

  const candidates = await findCandidates();

  if (candidates.length === 0) {
    console.log('No invoices needing KSeF backfill found.');
    return;
  }

  console.log(`Found ${candidates.length} invoice(s) missing KSeF metadata:\n`);

  // CSV header
  console.log('invoice_id,invoice_number,current_ksef_status,company_name,company_nip,total_cents,action,result,notes');
  console.log('─'.repeat(120));

  const results: Array<{ id: string; result: string }> = [];

  for (const inv of candidates) {
    const baseInfo = `${inv.id},${inv.invoice_number ?? ''},${inv.ksef_status ?? 'null'},${inv.company_name ?? ''},${inv.company_nip ?? ''},${inv.total_cents}`;

    if (mode === 'dry-run') {
      console.log(`${baseInfo},dry_run,skipped,Would attempt KSeF submission`);
    } else {
      // Apply mode — actually submit
      const result = await submitInvoice(inv.id);
      console.log(`${baseInfo},${result.action},${result.result},${result.notes}`);
      results.push({ id: inv.id, result: result.result });

      // Small delay to avoid overwhelming KSeF
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Summary
  console.log('\n─'.repeat(120));
  if (mode === 'dry-run') {
    console.log(`Dry run complete. ${candidates.length} invoice(s) would be submitted to KSeF.`);
    console.log('Run with --apply to actually submit.');
  } else {
    const succeeded = results.filter((r) => r.result === 'submitted' || r.result === 'accepted').length;
    const queued = results.filter((r) => r.result === 'queued').length;
    const failed = results.filter((r) => r.result === 'rejected' || r.result === 'failed' || r.result === 'error').length;
    console.log(`Backfill complete. Total: ${results.length} | Succeeded: ${succeeded} | Queued: ${queued} | Failed: ${failed}`);
  }
  console.log();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
