import { z } from 'zod';
import type { Database } from './database';

// ─── Raw DB row types ─────────────────────────────────────────────────────────

export type IssuedInvoiceRow =
  Database['public']['Tables']['issued_invoices']['Row'];

export type IssuedInvoiceItemRow =
  Database['public']['Tables']['issued_invoice_items']['Row'];

// ─── Enum literals ────────────────────────────────────────────────────────────

export const ISSUED_INVOICE_STATUSES = [
  'draft',
  'issued',
  'sent_to_ksef',
  'accepted',
  'rejected',
  'cancelled',
] as const;

export type IssuedInvoiceStatus = (typeof ISSUED_INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['transfer', 'cash', 'card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np', 'oo'] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const KSEF_STATUSES = ['pending', 'processing', 'accepted', 'rejected'] as const;
export type KsefStatus = (typeof KSEF_STATUSES)[number];

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const IssuedInvoiceItemSchema = z.object({
  id:             z.string().uuid().optional(),
  invoice_id:     z.string().uuid().optional(),
  position:       z.number().int().positive(),
  name:           z.string().min(1, 'Nazwa pozycji jest wymagana').max(500),
  unit:           z.string().min(1).max(20).default('szt.'),
  quantity:       z.number().positive('Ilość musi być większa od 0'),
  unit_price_net: z.number().min(0, 'Cena jednostkowa nie może być ujemna'),
  vat_rate:       z.enum(VAT_RATES),
  net_amount:     z.number().min(0),
  vat_amount:     z.number().min(0).default(0),
  gross_amount:   z.number().min(0),
  discount_pct:   z.number().min(0).max(99.99).nullable().optional(),
});

export const IssuedInvoiceSchema = z.object({
  id:             z.string().uuid().optional(),
  company_id:     z.string().uuid(),

  invoice_number: z
    .string()
    .min(1, 'Numer faktury jest wymagany')
    .max(100)
    .regex(/^[\w/\-. ]+$/, 'Numer faktury zawiera niedozwolone znaki'),

  status:         z.enum(ISSUED_INVOICE_STATUSES).default('draft'),
  currency:       z.string().length(3).default('PLN'),

  issue_date:     z.string().date('Nieprawidłowy format daty wystawienia'),
  sale_date:      z.string().date().nullable().optional(),
  due_date:       z.string().date().nullable().optional(),
  payment_method: z.enum(PAYMENT_METHODS).default('transfer'),

  // Seller — Podmiot1
  seller_name:         z.string().min(1, 'Nazwa sprzedawcy jest wymagana').max(300),
  seller_nip:          z.string().regex(/^\d{10}$/, 'NIP musi składać się z 10 cyfr'),
  seller_address:      z.string().min(1, 'Adres sprzedawcy jest wymagany').max(500),
  seller_bank_account: z.string().nullable().optional(),

  // Buyer — Podmiot2
  buyer_name:    z.string().min(1, 'Nazwa nabywcy jest wymagana').max(300),
  buyer_nip:     z.string().regex(/^\d{10}$/, 'NIP musi składać się z 10 cyfr').nullable().optional(),
  buyer_address: z.string().max(500).default(''),
  buyer_email:   z.string().email('Nieprawidłowy adres e-mail').nullable().optional(),

  // Totals
  net_total:   z.number().min(0).default(0),
  vat_total:   z.number().min(0).default(0),
  gross_total: z.number().min(0).default(0),

  notes: z.string().max(2000).nullable().optional(),

  // KSeF
  ksef_reference_no:  z.string().nullable().optional(),
  ksef_session_token: z.string().nullable().optional(),
  ksef_status:        z.enum(KSEF_STATUSES).nullable().optional(),
  ksef_error_message: z.string().nullable().optional(),
  ksef_sent_at:       z.string().datetime().nullable().optional(),
  ksef_accepted_at:   z.string().datetime().nullable().optional(),

  // Nested items (used in application layer; stripped before DB insert)
  items: z.array(IssuedInvoiceItemSchema).min(1, 'Faktura musi zawierać co najmniej jedną pozycję').optional(),
});

// ─── Derived application types ────────────────────────────────────────────────

export type IssuedInvoiceInput = z.infer<typeof IssuedInvoiceSchema>;
export type IssuedInvoiceItemInput = z.infer<typeof IssuedInvoiceItemSchema>;

/** Full invoice hydrated with its line items — use for display/export. */
export type IssuedInvoiceWithItems = IssuedInvoiceRow & {
  items: IssuedInvoiceItemRow[];
};

// ─── Calculation helpers ──────────────────────────────────────────────────────

const VAT_RATE_DECIMALS: Record<VatRate, number> = {
  '23': 0.23,
  '8':  0.08,
  '5':  0.05,
  '0':  0,
  'zw': 0,
  'np': 0,
  'oo': 0,
};

export interface ComputedItem {
  net_amount:   number;
  vat_amount:   number;
  gross_amount: number;
}

/** Recalculate line item amounts from quantity, price, discount and VAT rate. */
export function computeItemAmounts(
  quantity: number,
  unitPriceNet: number,
  vatRate: VatRate,
  discountPct?: number | null,
): ComputedItem {
  const discount = discountPct ?? 0;
  const net = round2(quantity * unitPriceNet * (1 - discount / 100));
  const vatMultiplier = VAT_RATE_DECIMALS[vatRate];
  const vat = round2(net * vatMultiplier);
  return {
    net_amount:   net,
    vat_amount:   vat,
    gross_amount: round2(net + vat),
  };
}

/** Sum item amounts into invoice totals. */
export function computeInvoiceTotals(items: ComputedItem[]): {
  net_total: number;
  vat_total: number;
  gross_total: number;
} {
  const net_total   = round2(items.reduce((s, i) => s + i.net_amount, 0));
  const vat_total   = round2(items.reduce((s, i) => s + i.vat_amount, 0));
  const gross_total = round2(net_total + vat_total);
  return { net_total, vat_total, gross_total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<IssuedInvoiceStatus, string> = {
  draft:        'Szkic',
  issued:       'Wystawiona',
  sent_to_ksef: 'Wysłana do KSeF',
  accepted:     'Zaakceptowana',
  rejected:     'Odrzucona',
  cancelled:    'Anulowana',
};

export const KSEF_STATUS_LABELS: Record<KsefStatus, string> = {
  pending:    'Oczekuje',
  processing: 'Przetwarzanie',
  accepted:   'Zaakceptowana',
  rejected:   'Odrzucona',
};

/** Returns true when the invoice may still be edited (no KSeF submission yet). */
export function isEditable(status: IssuedInvoiceStatus): boolean {
  return status === 'draft';
}

/** Returns true when the invoice can be submitted to KSeF. */
export function isSubmittable(status: IssuedInvoiceStatus): boolean {
  return status === 'issued';
}
