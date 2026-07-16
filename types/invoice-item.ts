import { z } from 'zod';

export type InvoiceItemSource = 'ksef_xml' | 'pdf_text' | 'ocr' | 'manual';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  position: number;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  net_amount: number | null;
  vat_rate: string | null;
  vat_amount: number | null;
  gross_amount: number | null;
  raw_text: string | null;
  source: InvoiceItemSource;
  confidence: number | null;
  page_number: number | null;
  bbox: BBox | null;
  confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const InvoiceItemSchema = z.object({
  position: z.number().int().min(1),
  description: z.string().min(1, 'Description is required').max(500),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().max(20).default('szt.'),
  unit_price: z.number().nonnegative(),
  net_amount: z.number().nonnegative(),
  vat_rate: z.string().max(10),
  vat_amount: z.number().nonnegative(),
  gross_amount: z.number().nonnegative(),
});

export type InvoiceItemInput = z.infer<typeof InvoiceItemSchema>;

export interface ParsedItemResult {
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  netAmount?: number;
  vatRate?: string;
  vatAmount?: number;
  grossAmount?: number;
  rawText?: string;
  source: InvoiceItemSource;
  confidence: number;
  pageNumber?: number;
  bbox?: BBox;
}

export interface ParseResult {
  items: ParsedItemResult[];
  source: InvoiceItemSource;
  averageConfidence: number;
  errors: string[];
}

export const SOURCE_LABELS: Record<InvoiceItemSource, string> = {
  ksef_xml: 'KSeF XML',
  pdf_text: 'PDF Text',
  ocr: 'OCR',
  manual: 'Manual',
};

export const CONFIDENCE_LABELS: (confidence: number | null) => string = (confidence) => {
  if (confidence == null) return 'Unknown';
  if (confidence >= 0.9) return 'High';
  if (confidence >= 0.7) return 'Medium';
  if (confidence >= 0.5) return 'Low';
  return 'Very Low';
};

export const CONFIDENCE_COLORS: (confidence: number | null) => string = (confidence) => {
  if (confidence == null) return 'bg:bg-slate-100 text-slate-600 border-slate-200';
  if (confidence >= 0.9) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (confidence >= 0.7) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
};
