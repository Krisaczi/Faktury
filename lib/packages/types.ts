import { z } from 'zod';

// ─── Features ─────────────────────────────────────────────────────────────────

export interface PackageFeatures {
  vendors_limit:      number | null; // null = unlimited
  reports_per_month:  number | null; // null = unlimited
  file_uploads:       boolean;
  invoicing:          boolean;
  support:            'email' | 'priority' | 'none';
}

export const DEFAULT_STARTER_FEATURES: PackageFeatures = {
  vendors_limit:     25,
  reports_per_month: 10,
  file_uploads:      true,
  invoicing:         false,
  support:           'email',
};

export type PackageType = 'starter' | 'pro' | 'individual';

// ─── Tier ─────────────────────────────────────────────────────────────────────

export interface PackageTier {
  id:                  string;
  key:                 string;
  name:                string;
  monthly_price_cents: number;
  annual_price_cents:  number;
  features:            PackageFeatures;
  created_at:          string;
  updated_at:          string;
}

// ─── Effective package ────────────────────────────────────────────────────────

export interface EffectivePackage {
  type:          PackageType;
  tier:          PackageTier | null;
  features:      PackageFeatures;
  priceCents:    number | null;
  assignedAt:    string | null;
  overLimit:     boolean;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export interface CompanyUsage {
  vendors_count:         number;
  reports_this_month:    number;
}

// ─── Enforcement result ───────────────────────────────────────────────────────

export type FeatureKey = keyof PackageFeatures;

export interface EnforcementResult {
  allowed:    boolean;
  reason?:    string;
  upgradeKey?: FeatureKey;
}

// ─── Individual options schema (Zod) ─────────────────────────────────────────

export const IndividualOptionsSchema = z.object({
  vendors_limit:     z.number().int().min(0).nullable().default(25),
  reports_per_month: z.number().int().min(0).nullable().default(10),
  file_uploads:      z.boolean().default(true),
  invoicing:         z.boolean().default(false),
  support:           z.enum(['email', 'priority', 'none']).default('email'),
});

export type IndividualOptions = z.infer<typeof IndividualOptionsSchema>;

// ─── Assign package input ─────────────────────────────────────────────────────

export const AssignPackageSchema = z.object({
  package_type:         z.enum(['starter', 'pro', 'individual']),
  package_id:           z.string().uuid().nullable().optional(),
  package_custom:       IndividualOptionsSchema.nullable().optional(),
  package_price_cents:  z.number().int().min(0).nullable().optional(),
  reason:               z.string().optional(),
});

export type AssignPackageInput = z.infer<typeof AssignPackageSchema>;

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface PackageAuditEntry {
  id:         string;
  company_id: string;
  changed_by: string;
  previous:   Record<string, unknown> | null;
  next:       Record<string, unknown> | null;
  reason:     string | null;
  created_at: string;
}

// ─── Action result ────────────────────────────────────────────────────────────

export type PackageActionResult<T = void> =
  | { ok: true;  data: T }
  | { ok: false; error: string };
