# KSeF Rozliczenie (Charges) — Parsing & Rendering

## Overview

Invoices arriving via KSeF XML may contain a `<Rozliczenie>` section that
records settlement charges (`<Obciazenia>`), their total (`<SumaObciazen>`),
and the final amount due (`<DoZaplaty>`). This document describes how the
system parses, persists, and renders these charges.

## XML Structure

```xml
<ns0:Rozliczenie>
  <ns0:Obciazenia>
    <ns0:Kwota>42.00</ns0:Kwota>
    <ns0:Powod>23648 KAUCJA PET 12X0,5ZŁ</ns0:Powod>
  </ns0:Obciazenia>
  <ns0:SumaObciazen>42</ns0:SumaObciazen>
  <ns0:DoZaplaty>189.49</ns0:DoZaplaty>
</ns0:Rozliczenie>
```

## Data Model

### `invoice_charges` table

| Column        | Type        | Description                                      |
|---------------|-------------|--------------------------------------------------|
| id            | uuid PK     | Default `gen_random_uuid()`                      |
| invoice_id    | uuid FK     | → `invoices(id) ON DELETE CASCADE`               |
| amount        | numeric     | Charge amount (`Kwota`)                          |
| reason        | text        | Charge reason (`Powod`)                          |
| source        | text        | `'ksef'`, `'pdf_text'`, `'ocr'`, `'manual'`     |
| confidence    | numeric     | 0.0–1.0 confidence score                         |
| confirmed     | boolean     | Whether an owner/admin confirmed this charge     |
| confirmed_by  | uuid        | User who confirmed                               |
| confirmed_at  | timestamptz | When confirmed                                   |
| page_number   | integer     | PDF page where charge text was matched (nullable) |
| bbox          | jsonb       | PDF bounding box `{x,y,width,height}` (nullable) |
| created_at    | timestamptz | Default `now()`                                  |
| updated_at    | timestamptz | Default `now()`                                  |

**Unique index**: `invoice_charges_invoice_id_reason_amount_uniq` on
`(invoice_id, md5(reason || '|' || amount::text))` — prevents duplicate
charges across reparse cycles (idempotent upsert).

### `invoices` table additions

| Column        | Type    | Description                |
|---------------|---------|----------------------------|
| charges_total | numeric | `SumaObciazen`             |
| amount_due    | numeric | `DoZaplaty`                |

## Parsing Pipeline

1. **XML Parser** (`lib/parsers/xml-invoice-parser.ts`):
   `extractCharges()` reads the `<Rozliczenie>` block, extracts each
   `<Obciazenia>` entry (`{ amount, reason }`), plus `SumaObciazen` and
   `DoZaplaty`. Results are added to `ParsedInvoice.charges`,
   `.chargesTotal`, and `.amountDue`.

2. **Parse API** (`app/api/invoices/[id]/charges/parse/route.ts`):
   Downloads the invoice file, runs `parseXmlInvoices`, then:
   - Attempts PDF text-layer mapping via `mapChargesToPdf()` to populate
     `page_number` + `bbox` for hover highlighting.
   - Idempotent upsert: deletes existing `source='ksef'` charges, then
     upserts via the dedup unique index. Manual charges are preserved.
   - Updates `invoices.charges_total` and `invoices.amount_due`.
   - Computes reconciliation (sum of charges vs `SumaObciazen`) and
     flags mismatch in the response + audit log.
   - Writes an `invoice_charges_parsed` audit entry with mapping count +
     reconciliation metadata.

3. **PDF Text Mapping** (`lib/parsers/charge-mapper.ts`):
   `mapChargesToPdf()` normalizes text (strips diacritics, whitespace,
   punctuation) and uses Levenshtein similarity matching to find each
   charge's `Powod` (reason) or `Kwota` (amount) in the PDF text layer.
   Matched items provide `page_number` + `bbox` for UI highlighting.
   Unmatched charges are still persisted with null mapping.

## API Endpoints

| Method | Path                                          | Description                    |
|--------|-----------------------------------------------|--------------------------------|
| GET    | `/api/invoices/[id]/charges`                  | List all charges               |
| POST   | `/api/invoices/[id]/charges`                  | Add a manual charge            |
| PATCH  | `/api/invoices/[id]/charges/[chargeId]`       | Edit a charge                  |
| DELETE | `/api/invoices/[id]/charges/[chargeId]`       | Delete a charge (owner/admin)  |
| POST   | `/api/invoices/[id]/charges/parse`            | Parse charges from KSeF XML    |
| POST   | `/api/invoices/[id]/charges/confirm`          | Confirm all charges (owner/admin) |

## UI Components

- **`InvoiceChargesSection`** (`components/invoice/invoice-charges-section.tsx`):
  Collapsible card with full charge management:
  - Table columns: Amount, Reason, Source, Confidence, Mapping.
  - Hovering a mapped charge highlights the corresponding PDF region via
    `onHoverCharge` callback (connected to the same overlay as line items).
  - Reconciliation warning banner when `SumaObciazen != sum(charges)`.
  - Suma Obciążeń + Do Zapłaty summary row.
  - Edit/add/delete dialogs for owner/admin/accountant.
  - Confirm-all button for owner/admin.
  - `aria-live` regions for dynamic highlights and parsing state.
  - Keyboard focusable rows for mapped charges (`tabIndex=0`).

- **PDF Preview** (`app/api/invoices/[id]/pdf/route.ts`):
  Renders a "Rozliczenie — Obciążenia" section after the totals, listing each
  charge, `Suma Obciążeń`, and `Do Zapłaty` in a highlighted row.

## Server Actions

- **`getInvoicePreviewData(invoiceId)`** (`app/(app)/invoice/[id]/actions.ts`):
  Returns charges[], chargesTotal, amountDue, and reconciliation status for
  the invoice preview.

- **`reparseInvoice(invoiceId)`**:
  Re-runs the charge parser. Idempotent — no duplicates on reparse. Returns
  count and mismatch flag.

## RLS Policies

Scoped through the parent `invoices` table's `company_id`:
- SELECT: all company members
- INSERT/UPDATE: owner, admin, accountant
- DELETE: owner, admin

## Audit Logging

All charge operations write to `audit_logs`:
- `invoice_charges_parsed`
- `invoice_charge_added`
- `invoice_charge_updated`
- `invoice_charge_deleted`
- `invoice_charges_confirmed`

## Tests

```
node --require ./node_modules/jiti/register.js \
     --test lib/__tests__/parsers/xml-invoice-parser-rozliczenie.test.ts
```

Tests cover single and multiple `<Obciazenia>`, missing `<Rozliczenie>`,
namespaced (`ns0:`) variants, idempotent re-parsing (same XML produces same
charges), and reconciliation mismatch detection.

## Reconciliation Rules

- After parsing, the system computes `sum(charges.amount)` and compares to
  `charges_total` (SumaObciazen).
- If `|charges_total - sum| > 0.01`, a reconciliation warning is surfaced in
  the UI and recorded in the audit log.
- The warning shows both values and the difference, prompting owner/admin to
  investigate.

## Idempotency

- Re-parsing the same KSeF XML will not create duplicate charges.
- The parse route deletes existing `source='ksef'` charges before upserting,
  and the unique index `(invoice_id, md5(reason||'|'||amount::text))` prevents
  duplicates within a single upsert batch.
- Manual charges (`source='manual'`) are preserved across reparse cycles.
