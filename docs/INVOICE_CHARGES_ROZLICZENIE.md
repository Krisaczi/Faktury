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
| created_at    | timestamptz | Default `now()`                                  |
| updated_at    | timestamptz | Default `now()`                                  |

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
   Downloads the invoice file, runs `parseXmlInvoices`, replaces existing
   `invoice_charges` rows, updates `invoices.charges_total` and
   `invoices.amount_due`, and writes an audit log entry.

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
  Collapsible card showing charges in a table with amount + reason, source
  badges, and confirm indicators. Owner/admin/accountant can parse, add, edit,
  and delete charges; owner/admin can confirm all.

- **PDF Preview** (`app/api/invoices/[id]/pdf/route.ts`):
  Renders a "Rozliczenie — Obciążenia" section after the totals, listing each
  charge, `Suma Obciążeń`, and `Do Zapłaty` in a highlighted row.

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

Tests cover single and multiple `<Obciazenia>`, missing `<Rozliczenie>`, and
namespaced (`ns0:`) variants.
