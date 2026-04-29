'use server';

import { createClient } from '@/lib/supabase/server';
import { listInvoices, downloadInvoiceXML, getInvoiceMetadata } from '@/lib/ksef/client';
import type { KSeFInvoiceHeader } from '@/lib/ksef/types';
import { KSeFError } from '@/lib/ksef/errors';

export interface SyncInvoicesSummary {
  total: number;
  newInvoices: number;
  updatedInvoices: number;
  errors: SyncInvoiceError[];
}

interface SyncInvoiceError {
  ksefReference: string;
  reason: string;
}

interface CompanyRow {
  id: string;
  nip: string;
  ksef_token: string;
  currency: string;
}

function isoDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchCompany(supabase: ReturnType<typeof createClient>, companyId: string): Promise<CompanyRow> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, nip, ksef_token, currency')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch company: ${error.message}`);
  if (!data) throw new Error(`Company not found: ${companyId}`);
  if (!data.ksef_token?.trim()) throw new Error('Company has no KSeF token configured.');
  if (!data.nip?.trim()) throw new Error('Company has no NIP configured.');

  return data as CompanyRow;
}

async function upsertVendor(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  sellerNip: string,
  sellerName: string,
  bankAccount: string | null
): Promise<string | null> {
  if (!sellerNip?.trim()) return null;

  const normalizedNip = sellerNip.replace(/[^0-9]/g, '');

  const bankAccounts = bankAccount?.trim() ? [bankAccount.trim()] : [];

  const { data, error } = await supabase
    .from('company_vendors')
    .upsert(
      {
        company_id: companyId,
        name: sellerName || normalizedNip,
        nip: normalizedNip,
        bank_accounts: bankAccounts,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'company_id,nip',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Vendor upsert failed for NIP ${normalizedNip}: ${error.message}`);
  return data?.id ?? null;
}

async function upsertInvoice(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  vendorId: string | null,
  header: KSeFInvoiceHeader,
  xml: string
): Promise<'new' | 'updated'> {
  const meta = getInvoiceMetadata(xml);

  const payload = {
    company_id: companyId,
    vendor_id: vendorId,
    ksef_reference: header.ksefReferenceNumber,
    invoice_number: meta.invoiceNumber || header.invoiceData.invoiceNumber || '',
    amount: meta.totalGross ?? parseFloat(header.invoiceData.gross) ?? 0,
    currency: meta.currency || header.invoiceData.currency || 'PLN',
    issue_date: isoDate(meta.issueDate || header.invoiceData.issuingDate),
    due_date: isoDate(meta.dueDate),
    bank_account: meta.bankAccount || '',
    xml_raw: xml,
    seller_nip: meta.sellerNip || '',
    buyer_nip: meta.buyerNip || '',
    seller_name: meta.sellerName || '',
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('company_invoices')
    .select('id')
    .eq('ksef_reference', header.ksefReferenceNumber)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('company_invoices')
      .update(payload)
      .eq('id', existing.id);

    if (error) throw new Error(`Invoice update failed: ${error.message}`);
    return 'updated';
  }

  const { error } = await supabase
    .from('company_invoices')
    .insert(payload);

  if (error) throw new Error(`Invoice insert failed: ${error.message}`);
  return 'new';
}

export async function syncInvoices(companyId: string): Promise<SyncInvoicesSummary> {
  if (!companyId?.trim()) {
    throw new Error('companyId is required');
  }

  const supabase = createClient();

  const company = await fetchCompany(supabase, companyId);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const fromDate = thirtyDaysAgo.toISOString().slice(0, 10);
  const toDate = today.toISOString().slice(0, 10);

  let headers: KSeFInvoiceHeader[];
  try {
    headers = await listInvoices(
      company.ksef_token,
      fromDate,
      toDate,
      company.nip
    );
  } catch (err) {
    if (err instanceof KSeFError) throw err;
    throw new Error(`KSeF listInvoices failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const summary: SyncInvoicesSummary = {
    total: headers.length,
    newInvoices: 0,
    updatedInvoices: 0,
    errors: [],
  };

  for (const header of headers) {
    const ref = header.ksefReferenceNumber;

    try {
      const xml = await downloadInvoiceXML(
        company.ksef_token,
        ref,
        company.nip
      );

      const meta = getInvoiceMetadata(xml);

      const vendorId = await upsertVendor(
        supabase,
        companyId,
        meta.sellerNip,
        meta.sellerName,
        meta.bankAccount
      );

      const result = await upsertInvoice(
        supabase,
        companyId,
        vendorId,
        header,
        xml
      );

      if (result === 'new') {
        summary.newInvoices++;
      } else {
        summary.updatedInvoices++;
      }
    } catch (err) {
      summary.errors.push({
        ksefReference: ref,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
