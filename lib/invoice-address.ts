import { z } from 'zod';

export const POSTAL_PATTERNS: Record<string, RegExp> = {
  PL: /^\d{2}-\d{3}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/,
  US: /^\d{5}(-\d{4})?$/,
  CZ: /^\d{3}\s?\d{2}$/,
  HU: /^\d{4}$/,
};

export const BillingAddressSchema = z.object({
  addressLine1: z.string().min(1, 'Adres jest wymagany').max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  city:         z.string().min(1, 'Miasto jest wymagane').max(100),
  postalCode:   z.string().min(1, 'Kod pocztowy jest wymagany').max(20),
  stateRegion:  z.string().max(100).optional().or(z.literal('')),
  country:      z.string().min(2, 'Kraj jest wymagany').max(2),
  vatId:        z.string().max(20).optional().or(z.literal('')),
}).superRefine((val, ctx) => {
  const pattern = POSTAL_PATTERNS[val.country];
  if (pattern && !pattern.test(val.postalCode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['postalCode'],
      message: `Nieprawidłowy kod pocztowy dla kraju ${val.country}`,
    });
  }
});

export type BillingAddress = z.infer<typeof BillingAddressSchema>;

export const REQUIRED_FIELDS: (keyof BillingAddress)[] = ['addressLine1', 'city', 'postalCode', 'country'];

export type CompanyAddressRow = {
  street: string | null;
  address_line2: string | null;
  city: string | null;
  zip: string | null;
  state_region: string | null;
  country: string | null;
  nip: string;
};

export function companyAddressToBilling(c: CompanyAddressRow): BillingAddress {
  return {
    addressLine1: c.street ?? '',
    addressLine2: c.address_line2 ?? '',
    city:         c.city ?? '',
    postalCode:   c.zip ?? '',
    stateRegion:  c.state_region ?? '',
    country:      c.country ?? 'PL',
    vatId:        c.nip ?? '',
  };
}

export function billingAddressToString(a: BillingAddress): string {
  const parts = [
    a.addressLine1,
    a.addressLine2,
    [a.postalCode, a.city].filter(Boolean).join(' '),
    a.stateRegion,
    a.country,
  ].filter(Boolean);
  return parts.join(', ');
}

export function validateBillingAddress(addr: BillingAddress): { valid: boolean; missingFields: string[] } {
  const missing = REQUIRED_FIELDS.filter((f) => !addr[f] || String(addr[f]).trim() === '');
  return { valid: missing.length === 0, missingFields: missing };
}

export function isAddressEmpty(addr: BillingAddress): boolean {
  return !addr.addressLine1 && !addr.city && !addr.postalCode && !addr.country;
}
