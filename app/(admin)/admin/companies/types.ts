import { z } from 'zod';

export interface BuyerCompany {
  id:                          string;
  company_id:                  string;
  owner_id:                    string;
  name:                        string;
  nip:                         string | null;
  vat_payer:                   boolean;
  street:                      string | null;
  postal_code:                 string | null;
  city:                        string | null;
  country:                     string;
  email:                       string | null;
  phone:                       string | null;
  billing_email:               string | null;
  default_payment_terms_days:  number;
  default_payment_method:      string;
  notes:                       string | null;
  deleted_at:                  string | null;
  created_at:                  string;
  updated_at:                  string;
}

export interface BuyerCompanyContact {
  id:         string;
  company_id: string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  role:       string | null;
  created_at: string;
  updated_at: string;
}

export interface BuyerCompanyWithInvoiceCount extends BuyerCompany {
  invoice_count: number;
}

export interface BuyerCompanyDetail {
  company:       BuyerCompany;
  contacts:      BuyerCompanyContact[];
  invoiceCount:  number;
}

export type ActionResult<T = string> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NIP_REGEX = /^\d{10}$/;

export const BuyerCompanySchema = z.object({
  name:                        z.string().min(1, 'Nazwa jest wymagana'),
  nip:                         z.string().regex(NIP_REGEX, 'NIP musi składać się z 10 cyfr').or(z.literal('')).optional().nullable(),
  vat_payer:                   z.boolean().default(true),
  street:                      z.string().optional().nullable(),
  postal_code:                 z.string().optional().nullable(),
  city:                        z.string().optional().nullable(),
  country:                     z.string().default('Polska'),
  email:                       z.string().email('Nieprawidłowy format e-mail').or(z.literal('')).optional().nullable(),
  phone:                       z.string().optional().nullable(),
  billing_email:               z.string().email('Nieprawidłowy format e-mail').or(z.literal('')).optional().nullable(),
  default_payment_terms_days:  z.number().int().min(0).max(365).default(14),
  default_payment_method:      z.string().default('transfer'),
  notes:                       z.string().optional().nullable(),
});

export type BuyerCompanyFormValues = z.infer<typeof BuyerCompanySchema>;

export const ContactSchema = z.object({
  name:  z.string().min(1, 'Imię i nazwisko jest wymagane'),
  email: z.string().email().or(z.literal('')).optional().nullable(),
  phone: z.string().optional().nullable(),
  role:  z.string().optional().nullable(),
});

export type ContactFormValues = z.infer<typeof ContactSchema>;

export interface GetCompaniesParams {
  page?:     number;
  pageSize?: number;
  search?:   string;
  sortBy?:   'name' | 'created_at';
  sortDir?:  'asc' | 'desc';
}

export interface GetCompaniesResult {
  rows:       BuyerCompanyWithInvoiceCount[];
  totalCount: number;
}
