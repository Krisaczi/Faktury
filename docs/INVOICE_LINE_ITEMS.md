# Invoice Line Items Parsing Pipeline

## Overview

Received invoices (uploaded or fetched from KSeF) are parsed to extract individual line items (service descriptions, quantities, unit prices, VAT breakdowns). Parsed items are persisted in the `invoice_items` database table and displayed in the invoice preview UI with full descriptions, source provenance, and confidence scores.

## Parsing Fallback Chain

The parser (`lib/parsers/invoice-item-parser.ts`) tries each method in order, falling back if the previous one fails or has low confidence:

### 1. KSeF XML (`source: 'ksef_xml'`, `confidence: 1.0`)

**When:** The invoice file is XML (KSeF FA(2) format or UBL).

**How:** The XML parser (`lib/parsers/xml-invoice-parser.ts`) extracts `FaWiersz` elements (KSeF) or `InvoiceLine` elements (UBL). KSeF fields are mapped as:

| KSeF field | Line item field |
|------------|-----------------|
| P_7 | description (name) |
| P_8A | unit |
| P_8B | quantity |
| P_9A | unit_price |
| P_11 | net_amount |
| P_12 | vat_rate |
| P_13 | vat_amount |
| P_14 | gross_amount |

**Automatic persistence:** When invoices are fetched from KSeF via the `/api/ksef/fetch-invoices` endpoint, line items are automatically extracted and inserted into `invoice_items` at fetch time.

### 2. PDF Text Extraction (`source: 'pdf_text'`, `confidence: 0.3–1.0`)

**When:** The invoice file is a PDF and XML parsing is not applicable.

**How:** Uses `pdfjs-dist` to extract text with bounding box coordinates from each page. Text items are grouped into lines by Y-coordinate proximity. The rule-based extractor (`lib/parsers/line-item-extractor.ts`) then:

1. Detects the "items section" by looking for header rows starting with `Lp.` or `Poz.`
2. Filters out metadata lines (NIP, IBAN, seller/buyer info, totals)
3. For each candidate line, extracts:
   - **Description:** Text before the first number
   - **Numbers:** Parsed from right to left (quantity, unit price, net, VAT amount, gross)
   - **VAT rate:** Detected via regex pattern matching (`23`, `8`, `5`, `0`, `zw`, `np`, `oo`)
   - **Unit:** Matched against common Polish units (`szt.`, `kg`, `kpl.`, `godz.`, `h`, `m`, `km`, `l`)
4. Computes a confidence score based on how many fields were successfully extracted

**Bounding boxes:** Each text item's position is normalized to 0–1 relative to page dimensions, enabling overlay highlight in the PDF preview.

### 3. OCR Fallback (`source: 'ocr'`, `confidence: 0.24–0.8`)

**When:** PDF text extraction returns no items or average confidence < 0.5, or the file is an image (scanned invoice).

**How:** Uses `tesseract.js` with Polish+English language data. The OCR output text is passed through the same rule-based line item extractor. Confidence scores are scaled by 0.8 to reflect OCR uncertainty.

### 4. Manual Entry (`source: 'manual'`)

**When:** All automatic methods fail.

**How:** Owner/admin can click "Parsuj pozycje" to attempt parsing, or manually edit/add items via the inline edit modal.

## Confidence Scoring

| Score Range | Label | Color |
|-------------|-------|-------|
| ≥ 0.9 | High | Green |
| 0.7–0.89 | Medium | Amber |
| 0.5–0.69 | Low | Rose |
| < 0.5 | Very Low | Rose |

Confidence is computed from how many fields were successfully extracted:
- Base: 0.3
- +0.2 for description
- +0.1 each for quantity, unit price, net amount, gross amount, VAT rate
- +0.05 for description length ≥ 5, +0.05 for ≥ 20 chars
- OCR results are scaled by 0.8

## Database Schema

### `invoice_items` table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Auto-generated |
| invoice_id | uuid FK | References `invoices(id)` ON DELETE CASCADE |
| position | int | 1-based line position |
| description | text | Service/product name |
| quantity | numeric | Quantity |
| unit | text | Unit of measure |
| unit_price | numeric | Net unit price |
| net_amount | numeric | Net line total |
| vat_rate | text | VAT rate string |
| vat_amount | numeric | VAT amount |
| gross_amount | numeric | Gross line total |
| raw_text | text | Original extracted text |
| source | text | `ksef_xml`, `pdf_text`, `ocr`, `manual` |
| confidence | numeric | 0.0–1.0 |
| page_number | int | PDF page (1-based, null for XML) |
| bbox | jsonb | `{x, y, width, height}` normalized 0–1 |
| confirmed | boolean | Owner/admin confirmation |
| confirmed_by | uuid | User who confirmed |
| confirmed_at | timestamptz | When confirmed |

**RLS policies:** Scoped through the parent invoice's `company_id`. All company members can view; owners/admins/accountants can insert/update; owners/admins can delete.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices/[id]/items` | Fetch all line items for an invoice |
| POST | `/api/invoices/[id]/items/parse` | Trigger parsing from file |
| POST | `/api/invoices/[id]/items/confirm` | Confirm all items (owner/admin) |
| PATCH | `/api/invoices/[id]/items/[itemId]` | Update a single item |

## Re-running Parsing

1. Navigate to the invoice detail page
2. Expand the "Pozycje faktury" section
3. Click "Re-parse" (available to owner/admin/accountant)
4. Previous items are deleted and replaced with newly parsed items

Re-parsing is safe: it deletes existing items for the invoice and inserts fresh ones from the source file.

## Running Tests

```bash
# KSeF XML parser tests
node --require ./node_modules/jiti/register.js \
     --test lib/__tests__/parsers/xml-invoice-parser-line-items.test.ts

# Line item extractor (OCR text) tests
node --require ./node_modules/jiti/register.js \
     --test lib/__tests__/parsers/line-item-extractor.test.ts

# Parser orchestrator tests
node --require ./node_modules/jiti/register.js \
     --test lib/__tests__/parsers/invoice-item-parser.test.ts
```
