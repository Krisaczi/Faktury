import { z } from 'zod';

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface PricingTier {
  id:                   string;
  name:                 string;
  monthly_price_cents:  number;
  annual_price_cents:   number;
  limits:               Record<string, number | null>;
  created_at:           string;
  updated_at:           string;
}

export const CustomPricingSchema = z.object({
  currency:    z.string().length(3).default('PLN'),
  price_cents: z.number().int().min(0),
  billing_period: z.enum(['monthly', 'annual']).default('monthly'),
  note:        z.string().optional(),
});

export type CustomPricing = z.infer<typeof CustomPricingSchema>;

// ─── Company with dashboard aggregates ───────────────────────────────────────

export interface CompanyDashboardRow {
  company_id:          string;
  company_name:        string;
  nip:                 string | null;
  is_active:           boolean;
  inactive_reason:     string | null;
  pricing_tier_name:   string | null;
  pricing_tier_id:     string | null;
  custom_pricing:      CustomPricing | null;
  subscription_status: string;
  product_type:        'starter' | 'professional' | null;
  trial_active:        boolean;
  trial_expires_at:    string | null;
  created_at:          string;
  invoices_30d:        number;
  invoices_90d:        number;
  invoices_365d:       number;
  net_total_30d:       number;
  gross_total_30d:     number;
  last_invoice_date:   string | null;
  vendors_count:       number;
  users_count:         number;
}

export interface RevenueTrendRow {
  month:            string;
  total_invoices:   number;
  net_total:        number;
  gross_total:      number;
  active_companies: number;
}

export interface OwnerDashboardData {
  companies:          CompanyDashboardRow[];
  trend:              RevenueTrendRow[];
  pricingTiers:       PricingTier[];
  kpi: {
    total_companies:   number;
    active_companies:  number;
    total_invoices_30d: number;
    total_net_30d:     number;
    total_vendors:     number;
    total_users:       number;
  };
}

// ─── Audit logs ───────────────────────────────────────────────────────────────

export interface OwnerAuditLog {
  id:          string;
  owner_id:    string;
  action:      string;
  company_id:  string | null;
  previous:    Record<string, unknown> | null;
  next:        Record<string, unknown> | null;
  ip:          string | null;
  created_at:  string;
}

// ─── Action results ───────────────────────────────────────────────────────────

export type OwnerActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
