import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { canAccessInvoicing, type AppRole } from '@/lib/permissions';

/**
 * GET /api/admin/invoices/export/xlsx
 *
 * Query parameters (all optional):
 *   from     YYYY-MM-DD
 *   to       YYYY-MM-DD
 *   status   string
 *
 * Returns a minimal Office Open XML (.xlsx) workbook constructed without
 * any external library, keeping the deployment bundle lean.
 *
 * The generated XLSX:
 *   - Uses a single sheet named "Faktury"
 *   - Applies bold formatting to the header row
 *   - Encodes numbers as numeric cells (type="n") for correct sum/sort in Excel
 *   - Sets column widths proportional to content
 */

// ─── XLSX builder ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:        'Szkic',
  issued:       'Wystawiona',
  sent_to_ksef: 'Wysłana do KSeF',
  accepted:     'Zaakceptowana',
  rejected:     'Odrzucona',
  cancelled:    'Anulowana',
};

const KSEF_STATUS_LABELS: Record<string, string> = {
  pending:    'Oczekuje',
  processing: 'Przetwarzanie',
  accepted:   'Zaakceptowana',
  rejected:   'Odrzucona',
};

function xmlEsc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip characters outside the XML 1.0 allowed range
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function numCell(col: string, row: number, v: number | null | undefined, style: number): string {
  if (v == null || isNaN(v)) return `<c r="${col}${row}" s="${style}"><v>0</v></c>`;
  return `<c r="${col}${row}" s="${style}" t="n"><v>${v}</v></c>`;
}

function strCell(col: string, row: number, shared: string[], v: string | null | undefined, style: number): string {
  const s = String(v ?? '');
  const idx = shared.length;
  shared.push(s);
  return `<c r="${col}${row}" s="${style}" t="s"><v>${idx}</v></c>`;
}

function colLetters(n: number): string {
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

interface InvoiceRow {
  invoice_number:    string | null;
  status:            string | null;
  ksef_status:       string | null;
  issue_date:        string | null;
  sale_date:         string | null;
  due_date:          string | null;
  buyer_name:        string | null;
  buyer_nip:         string | null;
  net_total:         number | null;
  vat_total:         number | null;
  gross_total:       number | null;
  currency:          string | null;
  ksef_reference_no: string | null;
  ksef_sent_at:      string | null;
  ksef_accepted_at:  string | null;
}

function buildXlsx(rows: InvoiceRow[]): Buffer {
  const shared: string[] = [];

  const COLS = [
    { label: 'Numer faktury',       width: 20 },
    { label: 'Status',              width: 16 },
    { label: 'Status KSeF',         width: 16 },
    { label: 'Data wystawienia',    width: 14 },
    { label: 'Data sprzedaży',      width: 14 },
    { label: 'Termin płatności',    width: 14 },
    { label: 'Nabywca',             width: 30 },
    { label: 'NIP nabywcy',         width: 12 },
    { label: 'Netto (PLN)',         width: 14 },
    { label: 'VAT (PLN)',           width: 14 },
    { label: 'Brutto (PLN)',        width: 14 },
    { label: 'Waluta',              width: 8  },
    { label: 'Numer ref. KSeF',     width: 28 },
    { label: 'Data wysłania KSeF',  width: 16 },
    { label: 'Data akceptacji KSeF', width: 16 },
  ];

  // Style indices
  // 0 = default, 1 = bold header, 2 = number 2dp, 3 = date string
  const STYLE_DEFAULT  = 0;
  const STYLE_HEADER   = 1;
  const STYLE_NUMBER   = 2;

  // Build sheet rows
  const sheetRows: string[] = [];

  // Header row (row 1)
  const headerCells = COLS.map((c, i) => strCell(colLetters(i), 1, shared, c.label, STYLE_HEADER));
  sheetRows.push(`<row r="1">${headerCells.join('')}</row>`);

  // Data rows
  rows.forEach((r, ri) => {
    const rowNum = ri + 2;
    const cells = [
      strCell('A', rowNum, shared, r.invoice_number, STYLE_DEFAULT),
      strCell('B', rowNum, shared, STATUS_LABELS[r.status ?? ''] ?? r.status, STYLE_DEFAULT),
      strCell('C', rowNum, shared, KSEF_STATUS_LABELS[r.ksef_status ?? ''] ?? (r.ksef_status ?? ''), STYLE_DEFAULT),
      strCell('D', rowNum, shared, (r.issue_date ?? '').slice(0, 10), STYLE_DEFAULT),
      strCell('E', rowNum, shared, (r.sale_date  ?? '').slice(0, 10), STYLE_DEFAULT),
      strCell('F', rowNum, shared, (r.due_date   ?? '').slice(0, 10), STYLE_DEFAULT),
      strCell('G', rowNum, shared, r.buyer_name,        STYLE_DEFAULT),
      strCell('H', rowNum, shared, r.buyer_nip,         STYLE_DEFAULT),
      numCell( 'I', rowNum, r.net_total,    STYLE_NUMBER),
      numCell( 'J', rowNum, r.vat_total,    STYLE_NUMBER),
      numCell( 'K', rowNum, r.gross_total,  STYLE_NUMBER),
      strCell('L', rowNum, shared, r.currency ?? 'PLN', STYLE_DEFAULT),
      strCell('M', rowNum, shared, r.ksef_reference_no, STYLE_DEFAULT),
      strCell('N', rowNum, shared, (r.ksef_sent_at    ?? '').slice(0, 10), STYLE_DEFAULT),
      strCell('O', rowNum, shared, (r.ksef_accepted_at ?? '').slice(0, 10), STYLE_DEFAULT),
    ];
    sheetRows.push(`<row r="${rowNum}">${cells.join('')}</row>`);
  });

  const lastRow = rows.length + 1;
  const lastCol = colLetters(COLS.length - 1);

  // Column widths
  const colDefs = COLS.map((c, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`
  ).join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/sheet">
<sheetViews><sheetView workbookViewId="0"><selection activeCell="A2" sqref="A2:A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${colDefs}</cols>
<sheetData>${sheetRows.join('')}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;

  // Shared strings
  const ssXml = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/sheet" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map(s => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join('')}
</sst>`;

  // Styles — minimal: default font, bold for header, number format for PLN
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/sheet">
<fonts count="2">
  <font><sz val="10"/><name val="Calibri"/></font>
  <font><b/><sz val="10"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

  // Workbook
  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/sheet"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Faktury" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const relsWorkbook = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const relsRoot = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"             ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml"        ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml"               ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  // Pack into ZIP using Node's built-in zlib (deflate) — no external deps
  // We build a simple ZIP archive manually using stored (no-compression) entries
  // to avoid needing a zip library while keeping the code small and dependency-free.
  const enc = (s: string) => Buffer.from(s, 'utf8');

  function zipEntry(name: string, data: Buffer): Buffer {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc32     = computeCrc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header sig
    local.writeUInt16LE(20,    4);      // version needed
    local.writeUInt16LE(0,     6);      // flags
    local.writeUInt16LE(0,     8);      // compression: stored
    local.writeUInt16LE(0,    10);      // mod time
    local.writeUInt16LE(0,    12);      // mod date
    local.writeUInt32LE(crc32, 14);     // crc32
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);         // extra field length
    nameBytes.copy(local, 30);
    return Buffer.concat([local, data]);
  }

  interface CentralDir {
    name:   Buffer;
    crc32:  number;
    size:   number;
    offset: number;
  }

  const files: { name: string; data: Buffer }[] = [
    { name: '[Content_Types].xml',              data: enc(contentTypes) },
    { name: '_rels/.rels',                      data: enc(relsRoot) },
    { name: 'xl/workbook.xml',                  data: enc(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels',       data: enc(relsWorkbook) },
    { name: 'xl/worksheets/sheet1.xml',         data: enc(sheetXml) },
    { name: 'xl/sharedStrings.xml',             data: enc(ssXml) },
    { name: 'xl/styles.xml',                    data: enc(stylesXml) },
  ];

  const parts:  Buffer[] = [];
  const central: CentralDir[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = Buffer.from(f.name, 'utf8');
    const crc32 = computeCrc32(f.data);
    const entry = zipEntry(f.name, f.data);
    parts.push(entry);
    central.push({ name: nameBytes, crc32, size: f.data.length, offset });
    offset += entry.length;
  }

  // Central directory
  const cdParts: Buffer[] = [];
  for (const c of central) {
    const cd = Buffer.alloc(46 + c.name.length);
    cd.writeUInt32LE(0x02014b50, 0);  // central dir sig
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0,  8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(c.crc32,  16);
    cd.writeUInt32LE(c.size,   20);
    cd.writeUInt32LE(c.size,   24);
    cd.writeUInt16LE(c.name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(c.offset, 42);
    c.name.copy(cd, 46);
    cdParts.push(cd);
  }

  const cdBuf    = Buffer.concat(cdParts);
  const eocd     = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdBuf.length,   12);
  eocd.writeUInt32LE(offset,         16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

// ─── CRC-32 (required by ZIP) ─────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userRecord } = await supabase
      .from('users')
      .select('role, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 });
    if (!canAccessInvoicing(userRecord.role as AppRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from   = searchParams.get('from');
    const to     = searchParams.get('to');
    const status = searchParams.get('status');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('issued_invoices')
      .select([
        'invoice_number', 'status', 'ksef_status',
        'issue_date', 'sale_date', 'due_date',
        'buyer_name', 'buyer_nip',
        'net_total', 'vat_total', 'gross_total', 'currency',
        'ksef_reference_no', 'ksef_sent_at', 'ksef_accepted_at',
      ].join(', '))
      .eq('company_id', userRecord.company_id)
      .order('issue_date', { ascending: false });

    if (from)   query = query.gte('issue_date', from);
    if (to)     query = query.lte('issue_date', to);
    if (status) query = query.eq('status', status);

    const { data: rows, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const xlsxBuf  = buildXlsx((rows ?? []) as InvoiceRow[]);
    const filename = `faktury-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(xlsxBuf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(xlsxBuf.length),
        'Cache-Control':       'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
