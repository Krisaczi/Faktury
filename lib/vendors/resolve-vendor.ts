/**
 * Shared vendor resolution logic used by both the manual upload pipeline
 * and the KSeF fetch pipeline.
 *
 * Strategy:
 *  1. If NIP provided → look up by (company_id, nip). If found, update any
 *     new fields that were blank before and return the existing id.
 *  2. If NIP not provided → look up by exact name match (case-insensitive).
 *  3. If still not found → INSERT a new vendor (new_vendor = true).
 *  4. Returns null when neither nip nor name is available.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export interface VendorData {
  name?: string | null;
  nip?: string | null;
  addressStreet?: string | null;
  addressZip?: string | null;
  addressCity?: string | null;
  bankAccountNumber?: string | null;
}

type Client = SupabaseClient<Database>;

function normalizeVendorName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (trimmed === trimmed.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]{3,}/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .replace(/(^|\s|\.)([\wąćęłńóśźż])/g, (_, pre, c) => pre + c.toUpperCase());
  }
  return trimmed;
}

function stripNip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/[\s-]/g, '');
  return stripped || null;
}

export async function resolveVendor(
  supabase: Client,
  companyId: string,
  userId: string,
  vendor: VendorData
): Promise<string | null> {
  const nip  = stripNip(vendor.nip);
  const name = normalizeVendorName(vendor.name);

  if (!nip && !name) return null;

  const patch = {
    ...(vendor.addressStreet  ? { address_street:      vendor.addressStreet }  : {}),
    ...(vendor.addressZip     ? { address_zip:          vendor.addressZip }     : {}),
    ...(vendor.addressCity    ? { address_city:         vendor.addressCity }    : {}),
    ...(vendor.bankAccountNumber ? { bank_account_number: vendor.bankAccountNumber } : {}),
  };

  // ── 1. Look up by NIP ──────────────────────────────────────────────────────
  if (nip) {
    const { data: existing } = await supabase
      .from('vendors')
      .select('id, address_street, address_zip, address_city, bank_account_number')
      .eq('company_id', companyId)
      .eq('nip', nip)
      .maybeSingle();

    if (existing) {
      // Back-fill any fields that are blank on the existing record
      const updates: {
        address_street?: string;
        address_zip?: string;
        address_city?: string;
        bank_account_number?: string;
      } = {};
      if (!existing.address_street      && patch.address_street)      updates.address_street      = patch.address_street;
      if (!existing.address_zip         && patch.address_zip)         updates.address_zip         = patch.address_zip;
      if (!existing.address_city        && patch.address_city)        updates.address_city        = patch.address_city;
      if (!existing.bank_account_number && patch.bank_account_number) updates.bank_account_number = patch.bank_account_number;

      if (Object.keys(updates).length > 0) {
        await supabase.from('vendors').update(updates).eq('id', existing.id);
      }
      return existing.id;
    }
  }

  // ── 2. Look up by name (only when no NIP) ─────────────────────────────────
  if (!nip && name) {
    const { data: byName } = await supabase
      .from('vendors')
      .select('id')
      .eq('company_id', companyId)
      .ilike('name', name)
      .maybeSingle();

    if (byName) return byName.id;
  }

  // ── 3. Create new vendor ──────────────────────────────────────────────────
  const insertName = name ?? nip ?? 'Unknown Vendor';

  if (nip) {
    // Use upsert to handle race conditions on the unique (company_id, nip) index
    const { data: upserted } = await supabase
      .from('vendors')
      .upsert(
        {
          company_id:          companyId,
          user_id:             userId,
          name:                insertName,
          nip,
          status:              'active',
          new_vendor:          true as never,
          ...patch,
        },
        { onConflict: 'company_id,nip', ignoreDuplicates: false }
      )
      .select('id')
      .single();
    return upserted?.id ?? null;
  }

  const { data: created } = await supabase
    .from('vendors')
    .insert({
      company_id: companyId,
      user_id:    userId,
      name:       insertName,
      nip:        null,
      status:     'active',
      new_vendor: true as never,
      ...patch,
    })
    .select('id')
    .single();
  return created?.id ?? null;
}
