import { z } from 'zod';

export type CeidgStatus = 'active' | 'suspended' | 'deleted' | 'inactive';

export interface CeidgCompany {
  nip: string;
  name: string;
  regon: string | null;
  status: CeidgStatus;
  rawStatus: string;
  street: string | null;
  buildingNumber: string | null;
  apartmentNumber: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface CeidgLookupResponse {
  company: CeidgCompany;
  fromCache: boolean;
  checkedAt: string;
}

export const CEIDG_STATUS_LABEL: Record<CeidgStatus, string> = {
  active: 'Aktywny',
  suspended: 'Zawieszony',
  deleted: 'Wykreślony',
  inactive: 'Nieaktywny',
};

export function isCeidgStatusBlocking(status: CeidgStatus): boolean {
  return status === 'deleted' || status === 'suspended';
}

export function formatCeidgStreetCity(values: Pick<CeidgFormValues, 'street' | 'buildingNumber' | 'apartmentNumber' | 'city'>): string {
  const streetLine = [values.street, [values.buildingNumber, values.apartmentNumber].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' ');
  return [streetLine, values.city].filter(Boolean).join(', ');
}

export const ceidgFieldsSchema = {
  buildingNumber: z.string().max(20).optional().or(z.literal('')),
  apartmentNumber: z.string().max(20).optional().or(z.literal('')),
  regon: z.string().regex(/^(\d{9}|\d{14})$/, 'REGON musi mieć 9 lub 14 cyfr').optional().or(z.literal('')),
  website: z.string().max(300).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  ceidgStatus: z.enum(['active', 'suspended', 'deleted', 'inactive']).nullable().optional(),
  ceidgCheckedAt: z.string().datetime().nullable().optional(),
};

export interface CeidgFormValues {
  name: string;
  regon: string;
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
}

export function mapCeidgToFormValues(company: CeidgCompany): CeidgFormValues {
  return {
    name: company.name,
    regon: company.regon ?? '',
    street: company.street ?? '',
    buildingNumber: company.buildingNumber ?? '',
    apartmentNumber: company.apartmentNumber ?? '',
    postalCode: company.postalCode ?? '',
    city: company.city ?? '',
    country: company.country || 'PL',
    email: company.email ?? '',
    phone: company.phone ?? '',
    website: company.website ?? '',
  };
}
