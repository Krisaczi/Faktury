import { z } from 'zod';

export type InvoiceChargeSource = 'ksef' | 'pdf_text' | 'ocr' | 'manual';

export interface InvoiceChargeRow {
  id: string;
  invoice_id: string;
  amount: number;
  reason: string;
  source: InvoiceChargeSource;
  confidence: number | null;
  confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const InvoiceChargeSchema = z.object({
  amount: z.number().nonnegative('Amount must be a non-negative number'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export type InvoiceChargeInput = z.infer<typeof InvoiceChargeSchema>;

export const CHARGE_SOURCE_LABELS: Record<InvoiceChargeSource, string> = {
  ksef: 'KSeF XML',
  pdf_text: 'PDF Text',
  ocr: 'OCR',
  manual: 'Manual',
};
