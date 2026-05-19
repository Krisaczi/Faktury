import { createClient } from '@supabase/supabase-js';

// ─── Admin client ─────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = 'small' | 'full';

interface SeedResult {
  demoSessionId:  string;
  demoCompanyId:  string;
  demoUserId:     string;
  demoEmail:      string;
  demoPassword:   string;
  expiresAt:      string;
}

interface DemoVendor {
  id:           string;
  name:         string;
  nip:          string;
  address:      string;
  postalCode:   string;
  city:         string;
  iban:         string;
  email:        string;
}

interface LineItem {
  name:       string;
  qty:        number;
  unitPrice:  number;
  vatRate:    number;
}

interface DemoInvoiceSpec {
  invoiceNumber: string;
  vendorIdx:     number;
  daysAgo:       number;
  dueDays:       number;
  items:         LineItem[];
  risk:          'low' | 'medium' | 'high';
  flags:         Array<{ type: string; severity: 'low' | 'medium' | 'high'; message: string }>;
  numberFormat:  'ksef' | 'manual' | 'short';
}

// ─── Deterministic random helpers ─────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomDate(daysAgo: number, rng: () => number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(rng() * daysAgo));
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── Static vendor catalogue ──────────────────────────────────────────────────

const VENDOR_TEMPLATES = [
  { name: 'Technika Sp. z o.o.',        category: 'Technology',    risk_base: 15 },
  { name: 'LogiTrans S.A.',             category: 'Logistics',     risk_base: 28 },
  { name: 'MediaPlus Sp. z o.o.',       category: 'Marketing',     risk_base: 42 },
  { name: 'BuilderPro Sp. z o.o.',      category: 'Construction',  risk_base: 67 },
  { name: 'SupplyChain Masters S.A.',   category: 'Supply Chain',  risk_base: 35 },
  { name: 'CloudServ Sp. z o.o.',       category: 'IT Services',   risk_base: 12 },
  { name: 'FinConsult S.A.',            category: 'Finance',       risk_base: 54 },
  { name: 'GreenEnergy Sp. z o.o.',     category: 'Energy',        risk_base: 22 },
  { name: 'PrintShop Sp. z o.o.',       category: 'Printing',      risk_base: 18 },
  { name: 'SecureIT S.A.',              category: 'Cybersecurity', risk_base: 8  },
];

// Full vendor details for the 15 rich demo invoices
const RICH_VENDORS = [
  {
    name: 'Technika Sp. z o.o.',
    nip: '5260001829',
    address: 'ul. Mokotowska 15/3',
    postalCode: '00-640',
    city: 'Warszawa',
    iban: 'PL61109010140000071219812874',
    email: 'faktury@technika.pl',
  },
  {
    name: 'LogiTrans S.A.',
    nip: '7740001234',
    address: 'ul. Składowa 8',
    postalCode: '85-127',
    city: 'Bydgoszcz',
    iban: 'PL27114020040000300201355387',
    email: 'biuro@logitrans.pl',
  },
  {
    name: 'MediaPlus Sp. z o.o.',
    nip: '9820002341',
    address: 'al. Krakowska 110',
    postalCode: '02-256',
    city: 'Warszawa',
    iban: 'PL83160010131841007831640005',
    email: 'kontakt@mediaplus.pl',
  },
  {
    name: 'BuilderPro Sp. z o.o.',
    nip: '6120005678',
    address: 'ul. Ceglana 22',
    postalCode: '40-514',
    city: 'Katowice',
    iban: 'PL48102040270000010202024550',
    email: 'faktury@builderpro.pl',
  },
  {
    name: 'CloudServ Sp. z o.o.',
    nip: '5213000001',
    address: 'ul. Inflancka 4C',
    postalCode: '00-189',
    city: 'Warszawa',
    iban: 'PL10105010251000009030393057',
    email: 'finanse@cloudserv.pl',
  },
];

const BUYER = {
  name:       'Demo Company Sp. z o.o.',
  nip:        '1234567890',
  address:    'ul. Testowa 1',
  postalCode: '01-001',
  city:       'Warszawa',
};

// ─── Rich invoice specifications ──────────────────────────────────────────────
// 15 invoices: 5 high, 5 medium, 5 low risk

const RICH_INVOICE_SPECS: DemoInvoiceSpec[] = [
  // ── HIGH risk (5) ─────────────────────────────────────────────────────────
  {
    invoiceNumber: '0/0(095)0049/118017',
    vendorIdx: 3,
    daysAgo: 5,
    dueDays: 14,
    items: [
      { name: 'Roboty budowlane – etap I',  qty: 1,   unitPrice: 120000, vatRate: 23 },
      { name: 'Materiały konstrukcyjne',     qty: 50,  unitPrice: 840,    vatRate: 8  },
      { name: 'Nadzór inżynierski',          qty: 40,  unitPrice: 250,    vatRate: 23 },
    ],
    risk: 'high',
    flags: [
      { type: 'duplicate_invoice_after_first', severity: 'high',   message: 'Duplicate invoice detected — an earlier copy of invoice number "0/0(095)0049/118017" already exists for this vendor.' },
      { type: 'amount_outlier',                severity: 'high',   message: 'Invoice amount is significantly above this vendor\'s typical range (mean: 45 200.00, z-score: 4.2).' },
    ],
    numberFormat: 'ksef',
  },
  {
    invoiceNumber: 'FV/2025/0892',
    vendorIdx: 2,
    daysAgo: 12,
    dueDays: 30,
    items: [
      { name: 'Kampania reklamowa Q4',       qty: 1,   unitPrice: 85000, vatRate: 23 },
      { name: 'Produkcja materiałów wideo',   qty: 3,   unitPrice: 12000, vatRate: 23 },
    ],
    risk: 'high',
    flags: [
      { type: 'amount_outlier',    severity: 'high',   message: 'Invoice amount is significantly above this vendor\'s typical range (mean: 18 500.00, z-score: 3.8).' },
      { type: 'missing_seller_nip', severity: 'medium', message: 'Seller NIP not found on invoice.' },
    ],
    numberFormat: 'manual',
  },
  {
    invoiceNumber: '0/0(095)0049/118017',
    vendorIdx: 3,
    daysAgo: 3,
    dueDays: 14,
    items: [
      { name: 'Roboty budowlane – etap I',  qty: 1,   unitPrice: 120000, vatRate: 23 },
      { name: 'Materiały konstrukcyjne',     qty: 50,  unitPrice: 840,    vatRate: 8  },
    ],
    risk: 'high',
    flags: [
      { type: 'duplicate_invoice_after_first', severity: 'high', message: 'Duplicate invoice detected — an earlier copy of invoice number "0/0(095)0049/118017" already exists for this vendor.' },
    ],
    numberFormat: 'ksef',
  },
  {
    invoiceNumber: 'KSeF/2025/05/00341',
    vendorIdx: 1,
    daysAgo: 8,
    dueDays: 21,
    items: [
      { name: 'Transport krajowy – maj 2025',    qty: 24, unitPrice: 1200,  vatRate: 23 },
      { name: 'Magazynowanie (m²/miesiąc)',       qty: 500, unitPrice: 18,   vatRate: 23 },
      { name: 'Obsługa celna',                    qty: 6,  unitPrice: 850,   vatRate: 23 },
    ],
    risk: 'high',
    flags: [
      { type: 'bank_account_change', severity: 'high',   message: 'Bank account ending in ...8874 has not been used by this vendor before.' },
      { type: 'amount_outlier',      severity: 'medium',  message: 'Invoice amount is above this vendor\'s typical range (mean: 22 400.00, deviation: 2.1x std dev).' },
    ],
    numberFormat: 'ksef',
  },
  {
    invoiceNumber: 'FIN/2025/Q2/0044',
    vendorIdx: 4,
    daysAgo: 18,
    dueDays: 7,
    items: [
      { name: 'Audyt bezpieczeństwa IT',     qty: 1,  unitPrice: 28000, vatRate: 23 },
      { name: 'Raport powłamaniowy',          qty: 1,  unitPrice: 9500,  vatRate: 23 },
      { name: 'Szkolenie dla pracowników',    qty: 20, unitPrice: 450,   vatRate: 23 },
      { name: 'Licencja oprogramowania (rok)',qty: 5,  unitPrice: 3200,  vatRate: 23 },
    ],
    risk: 'high',
    flags: [
      { type: 'unregistered_vendor', severity: 'high',   message: 'Vendor NIP 5213000001 not found in public VAT registry.' },
      { type: 'high_value',          severity: 'medium', message: 'Invoice total exceeds company approval threshold of PLN 50 000.' },
    ],
    numberFormat: 'manual',
  },

  // ── MEDIUM risk (5) ───────────────────────────────────────────────────────
  {
    invoiceNumber: 'FV/2025/0455',
    vendorIdx: 0,
    daysAgo: 22,
    dueDays: 30,
    items: [
      { name: 'Serwer aplikacyjny Dell R740',  qty: 2,   unitPrice: 18500, vatRate: 23 },
      { name: 'Dyski SSD 4TB',                 qty: 8,   unitPrice: 1200,  vatRate: 23 },
      { name: 'Konfiguracja i wdrożenie',      qty: 16,  unitPrice: 320,   vatRate: 23 },
    ],
    risk: 'medium',
    flags: [
      { type: 'high_value',          severity: 'medium', message: 'Invoice total exceeds company approval threshold of PLN 50 000.' },
      { type: 'vat_rate_mismatch',   severity: 'low',    message: 'Applied VAT rate inconsistent with product category (expected 23%, found mixed rates).' },
    ],
    numberFormat: 'manual',
  },
  {
    invoiceNumber: 'LT/05/2025/0312',
    vendorIdx: 1,
    daysAgo: 35,
    dueDays: 14,
    items: [
      { name: 'Usługi spedycyjne – kwiecień', qty: 18,  unitPrice: 780,  vatRate: 23 },
      { name: 'Ubezpieczenie ładunku',         qty: 1,   unitPrice: 4200, vatRate: 23 },
    ],
    risk: 'medium',
    flags: [
      { type: 'late_submission', severity: 'medium', message: 'Invoice submitted 35 days after issue date, exceeding the 30-day threshold.' },
    ],
    numberFormat: 'manual',
  },
  {
    invoiceNumber: 'MP/2025/03/0189',
    vendorIdx: 2,
    daysAgo: 47,
    dueDays: 21,
    items: [
      { name: 'Zarządzanie mediami społecznościowymi', qty: 1, unitPrice: 6500,  vatRate: 23 },
      { name: 'Tworzenie treści (artykuły x20)',       qty: 20, unitPrice: 350,  vatRate: 23 },
      { name: 'Analityka i raportowanie',               qty: 1, unitPrice: 1800, vatRate: 23 },
    ],
    risk: 'medium',
    flags: [
      { type: 'duplicate_vendor_amount', severity: 'medium', message: 'Invoice amount 15 300.00 has appeared 2 time(s) for this vendor — possible duplicate.' },
    ],
    numberFormat: 'manual',
  },
  {
    invoiceNumber: 'KSeF/2025/04/00198',
    vendorIdx: 4,
    daysAgo: 55,
    dueDays: 30,
    items: [
      { name: 'Monitoring infrastruktury (miesięcznie)', qty: 3,  unitPrice: 4800,  vatRate: 23 },
      { name: 'Reagowanie na incydenty',                  qty: 2,  unitPrice: 2900,  vatRate: 23 },
      { name: 'Aktualizacja polityki bezpieczeństwa',     qty: 1,  unitPrice: 3500,  vatRate: 23 },
    ],
    risk: 'medium',
    flags: [
      { type: 'missing_bank_account', severity: 'medium', message: 'Bank account number is missing from the invoice.' },
    ],
    numberFormat: 'ksef',
  },
  {
    invoiceNumber: 'GE/2025/02/0077',
    vendorIdx: 0,
    daysAgo: 60,
    dueDays: 30,
    items: [
      { name: 'Licencja oprogramowania ERP (rok)',  qty: 1,   unitPrice: 22000, vatRate: 23 },
      { name: 'Wdrożenie i migracja danych',         qty: 80,  unitPrice: 280,   vatRate: 23 },
      { name: 'Szkolenie użytkowników',              qty: 2,   unitPrice: 3500,  vatRate: 23 },
    ],
    risk: 'medium',
    flags: [
      { type: 'amount_outlier', severity: 'medium', message: 'Invoice amount is above this vendor\'s typical range (mean: 18 200.00, deviation: 2.3x std dev).' },
    ],
    numberFormat: 'manual',
  },

  // ── LOW risk (5) ──────────────────────────────────────────────────────────
  {
    invoiceNumber: 'FV/2025/0101',
    vendorIdx: 0,
    daysAgo: 70,
    dueDays: 30,
    items: [
      { name: 'Wsparcie techniczne (h)',    qty: 20, unitPrice: 220, vatRate: 23 },
      { name: 'Aktualizacja licencji',      qty: 1,  unitPrice: 980, vatRate: 23 },
    ],
    risk: 'low',
    flags: [],
    numberFormat: 'manual',
  },
  {
    invoiceNumber: 'LT/02/2025/0088',
    vendorIdx: 1,
    daysAgo: 75,
    dueDays: 14,
    items: [
      { name: 'Transport drogowy – styczeń', qty: 10, unitPrice: 650,  vatRate: 23 },
      { name: 'Paliwo i opłaty drogowe',     qty: 1,  unitPrice: 1200, vatRate: 23 },
    ],
    risk: 'low',
    flags: [],
    numberFormat: 'manual',
  },
  {
    invoiceNumber: 'KSeF/2025/01/00055',
    vendorIdx: 4,
    daysAgo: 80,
    dueDays: 21,
    items: [
      { name: 'Subskrypcja platforma bezpieczeństwa', qty: 1, unitPrice: 2400, vatRate: 23 },
      { name: 'Raport miesięczny',                    qty: 1, unitPrice: 600,  vatRate: 23 },
    ],
    risk: 'low',
    flags: [],
    numberFormat: 'ksef',
  },
  {
    invoiceNumber: 'TK/2025/I/0033',
    vendorIdx: 0,
    daysAgo: 85,
    dueDays: 30,
    items: [
      { name: 'Dostawa sprzętu sieciowego',  qty: 3,  unitPrice: 1800, vatRate: 23 },
      { name: 'Instalacja i konfiguracja',   qty: 8,  unitPrice: 180,  vatRate: 23 },
      { name: 'Okablowanie strukturalne',    qty: 120, unitPrice: 12,   vatRate: 23 },
    ],
    risk: 'low',
    flags: [],
    numberFormat: 'short',
  },
  {
    invoiceNumber: 'MP/2024/12/0342',
    vendorIdx: 2,
    daysAgo: 90,
    dueDays: 21,
    items: [
      { name: 'Projekt graficzny logo',           qty: 1, unitPrice: 3200, vatRate: 23 },
      { name: 'Broszury reklamowe (nakład 500)',   qty: 1, unitPrice: 2800, vatRate: 8  },
      { name: 'Banery online (5 formatów)',        qty: 5, unitPrice: 320,  vatRate: 23 },
    ],
    risk: 'low',
    flags: [],
    numberFormat: 'manual',
  },
];

const BULK_RISK_FLAG_TEMPLATES = [
  { type: 'missing_nip',            severity: 'high',   message: 'Seller NIP not present on invoice' },
  { type: 'suspicious_bank',        severity: 'high',   message: 'Bank account not matching known vendor records' },
  { type: 'high_value',             severity: 'medium', message: 'Invoice amount exceeds company threshold' },
  { type: 'duplicate_invoice',      severity: 'high',   message: 'Possible duplicate invoice number detected' },
  { type: 'late_submission',        severity: 'low',    message: 'Invoice submitted more than 30 days after issue date' },
  { type: 'vat_rate_mismatch',      severity: 'medium', message: 'Applied VAT rate inconsistent with product category' },
  { type: 'unregistered_vendor',    severity: 'medium', message: 'Vendor NIP not found in public VAT registry' },
  { type: 'round_number_anomaly',   severity: 'low',    message: 'Invoice total is a suspiciously round number' },
  { type: 'currency_inconsistency', severity: 'low',    message: 'Currency differs from vendor contract currency' },
];

const BULK_INVOICE_NUMBERS = (rng: () => number, count: number) =>
  Array.from({ length: count }, (_, i) => `FV/${2024 + Math.floor(i / 100)}/${String(i + 1).padStart(4, '0')}`);

// ─── XML generator ────────────────────────────────────────────────────────────

function computeLineTotals(items: LineItem[]) {
  return items.map((item) => {
    const net  = Math.round(item.qty * item.unitPrice * 100) / 100;
    const vat  = Math.round(net * item.vatRate / 100 * 100) / 100;
    return { ...item, net, vat, gross: Math.round((net + vat) * 100) / 100 };
  });
}

function buildInvoiceXml(
  spec: DemoInvoiceSpec,
  vendor: typeof RICH_VENDORS[number],
  issueDate: string,
  dueDate: string,
): { xml: string; amount: number; taxAmount: number; totalAmount: number } {
  const lines = computeLineTotals(spec.items);
  const amount      = Math.round(lines.reduce((s, l) => s + l.net,   0) * 100) / 100;
  const taxAmount   = Math.round(lines.reduce((s, l) => s + l.vat,   0) * 100) / 100;
  const totalAmount = Math.round(lines.reduce((s, l) => s + l.gross, 0) * 100) / 100;

  const itemsXml = lines.map((l, i) => `
    <Pozycja>
      <NrWierszaFa>${i + 1}</NrWierszaFa>
      <P_7>${esc(l.name)}</P_7>
      <P_8A>szt</P_8A>
      <P_8B>${l.qty}</P_8B>
      <P_9A>${l.unitPrice.toFixed(2)}</P_9A>
      <P_11>${l.net.toFixed(2)}</P_11>
      <P_12>${l.vatRate}</P_12>
      <P_13_${l.vatRate === 23 ? '1' : '2'}>${l.vat.toFixed(2)}</P_13_${l.vatRate === 23 ? '1' : '2'}>
    </Pozycja>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${vendor.nip}</NIP>
      <Nazwa>${esc(vendor.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <AdresL1>${esc(vendor.address)}</AdresL1>
      <AdresL2>${vendor.postalCode} ${esc(vendor.city)}</AdresL2>
      <KodKraju>PL</KodKraju>
    </Adres>
    <DaneKontaktowe>
      <Email>${esc(vendor.email)}</Email>
    </DaneKontaktowe>
    <NrRachunku>${vendor.iban}</NrRachunku>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>${BUYER.nip}</NIP>
      <Nazwa>${esc(BUYER.name)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <AdresL1>${esc(BUYER.address)}</AdresL1>
      <AdresL2>${BUYER.postalCode} ${esc(BUYER.city)}</AdresL2>
      <KodKraju>PL</KodKraju>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${issueDate}</P_1>
    <P_2>${spec.invoiceNumber}</P_2>
    <P_15>${totalAmount.toFixed(2)}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <P_19>2</P_19>
      <P_23>2</P_23>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersze>${itemsXml}
    </FaWiersze>
    <Platnosc>
      <Termin>${dueDate}</Termin>
      <RachunekBankowy>${vendor.iban}</RachunekBankowy>
    </Platnosc>
  </Fa>
</Faktura>`;

  return { xml, amount, taxAmount, totalAmount };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Main seeder ──────────────────────────────────────────────────────────────

export async function seedDemoSession(opts: {
  preset:       Preset;
  ttlHours:     number;
  createdByIp?: string;
}): Promise<SeedResult> {
  const db     = getAdminClient();
  const rng    = seededRandom(Date.now() & 0xffffff);
  const preset = opts.preset;

  const bulkInvoiceCount = preset === 'small' ? 15 : 105;
  const vendorCount      = preset === 'small' ? 4  : 10;

  // ── 1. Create demo company ─────────────────────────────────────────────────
  const { data: company, error: coErr } = await db
    .from('companies')
    .insert({
      name:                'Demo Company Sp. z o.o.',
      nip:                 '1234567890',
      currency:            'PLN',
      subscription_status: 'active',
      is_demo:             true,
    })
    .select('id')
    .single();

  if (coErr || !company) throw new Error(`Company insert failed: ${coErr?.message}`);
  const companyId = company.id as string;

  // ── 2. Create demo Supabase auth user ──────────────────────────────────────
  const demoEmail    = `demo+${Date.now()}@riskguard-demo.example`;
  const demoPassword = generatePassword();

  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email:         demoEmail,
    password:      demoPassword,
    email_confirm: true,
    user_metadata: { is_demo: true, full_name: 'Demo User' },
    app_metadata:  { is_demo: true },
  });

  if (authErr || !authData.user) throw new Error(`Auth user creation failed: ${authErr?.message}`);
  const authUserId = authData.user.id as string;

  // ── 3. Upsert public users row ─────────────────────────────────────────────
  await db.from('users').upsert(
    { id: authUserId, email: demoEmail, company_id: companyId, role: 'owner' },
    { onConflict: 'id' }
  );

  // ── 4. Upsert profiles row ─────────────────────────────────────────────────
  await db.from('profiles').upsert(
    { id: authUserId, email: demoEmail, full_name: 'Demo User', role: 'owner' },
    { onConflict: 'id' }
  );

  // ── 5. Insert vendors ──────────────────────────────────────────────────────
  // NIPs are index-based to guarantee uniqueness within the company.
  const vendorTemplates = VENDOR_TEMPLATES.slice(0, vendorCount);
  const { data: vendors, error: vendorErr } = await db
    .from('vendors')
    .insert(
      vendorTemplates.map((v, idx) => ({
        user_id:       authUserId,
        company_id:    companyId,
        name:          v.name,
        category:      v.category,
        risk_score:    Math.min(100, v.risk_base + Math.floor(rng() * 20)),
        status:        v.risk_base > 50 ? 'under_review' : 'active',
        nip:           `${2000000000 + idx * 100000000 + Math.floor(rng() * 99999999)}`,
        contact_email: `contact@${v.name.toLowerCase().replace(/[^a-z]/g, '')}.pl`,
        bank_accounts: [
          JSON.stringify({ iban: `PL${Math.floor(10 + rng() * 89)}${Math.floor(10000000000000000 + rng() * 89999999999999999)}`, currency: 'PLN' }),
        ],
        notes: null,
      }))
    )
    .select('id');

  if (vendorErr) throw new Error(`Vendor insert failed: ${vendorErr.message}`);
  const vendorIds = (vendors ?? []).map((v: { id: string }) => v.id);

  // ── 6. Insert 15 rich demo invoices ───────────────────────────────────────
  // These use RICH_VENDORS which have fixed NIPs that won't conflict with the
  // randomly-generated vendor NIPs above (those start at 2000000000+).
  const richVendorIds: string[] = [];

  for (const rv of RICH_VENDORS) {
    const { data: existingV } = await db
      .from('vendors')
      .select('id')
      .eq('company_id', companyId)
      .eq('nip', rv.nip)
      .maybeSingle();

    if (existingV) {
      richVendorIds.push((existingV as { id: string }).id);
    } else {
      const { data: newV, error: rvErr } = await db
        .from('vendors')
        .insert({
          user_id:       authUserId,
          company_id:    companyId,
          name:          rv.name,
          nip:           rv.nip,
          contact_email: rv.email,
          category:      'Demo',
          risk_score:    20,
          status:        'active',
          bank_accounts: [JSON.stringify({ iban: rv.iban, currency: 'PLN' })],
          notes:         null,
        })
        .select('id')
        .single();
      if (rvErr || !newV) throw new Error(`Rich vendor insert failed: ${rvErr?.message}`);
      richVendorIds.push((newV as { id: string }).id);
    }
  }

  const richFlagRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < RICH_INVOICE_SPECS.length; i++) {
    const spec   = RICH_INVOICE_SPECS[i];
    const vendor = RICH_VENDORS[spec.vendorIdx];
    const vidx   = spec.vendorIdx < richVendorIds.length ? spec.vendorIdx : 0;
    const vendorId = richVendorIds[vidx];

    const issueD  = new Date();
    issueD.setDate(issueD.getDate() - spec.daysAgo);
    const dueD    = new Date(issueD);
    dueD.setDate(dueD.getDate() + spec.dueDays);

    // Spread created_at across the day to vary timestamps naturally
    const createdAt = new Date(issueD);
    createdAt.setHours(8 + (i % 12), i * 4 % 60, i * 7 % 60, 0);

    const issueDateStr = isoDate(issueD);
    const dueDateStr   = isoDate(dueD);

    const { xml, amount, taxAmount, totalAmount } = buildInvoiceXml(spec, vendor, issueDateStr, dueDateStr);

    // Upload XML to storage so the PDF route can parse full party data
    let rawFileUrl: string | null = null;
    try {
      const xmlBytes  = new TextEncoder().encode(xml);
      const storagePath = `demo/${companyId}/${spec.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${i}.xml`;

      const { error: uploadErr } = await db.storage
        .from('invoices')
        .upload(storagePath, xmlBytes, { contentType: 'application/xml', upsert: true });

      if (!uploadErr) {
        const { data: urlData } = db.storage.from('invoices').getPublicUrl(storagePath);
        rawFileUrl = urlData?.publicUrl ?? null;
      }
    } catch {
      // Non-fatal — PDF will still render from DB fields
    }

    const { data: inv, error: invErr } = await db
      .from('invoices')
      .insert({
        company_id:    companyId,
        vendor_id:     vendorId,
        invoice_number: spec.invoiceNumber,
        invoice_date:  issueDateStr,
        issue_date:    issueDateStr,
        due_date:      dueDateStr,
        amount,
        total_amount:  totalAmount,
        tax_amount:    taxAmount,
        currency:      'PLN',
        seller_nip:    vendor.nip,
        buyer_nip:     BUYER.nip,
        bank_account:  vendor.iban,
        overall_risk:  spec.risk,
        raw_file_url:  rawFileUrl,
        created_at:    createdAt.toISOString(),
      })
      .select('id')
      .single();

    if (invErr || !inv) throw new Error(`Rich invoice insert failed (${spec.invoiceNumber}): ${invErr?.message}`);
    const invoiceId = (inv as { id: string }).id;

    for (const flag of spec.flags) {
      richFlagRows.push({
        invoice_id: invoiceId,
        type:       flag.type,
        severity:   flag.severity,
        message:    flag.message,
        status:     'open',
      });
    }
  }

  if (richFlagRows.length > 0) {
    const { error: rfErr } = await db.from('risk_flags').insert(richFlagRows);
    if (rfErr) throw new Error(`Rich flag insert failed: ${rfErr.message}`);
  }

  // ── 7. Insert bulk invoices ────────────────────────────────────────────────
  const invNumbers  = BULK_INVOICE_NUMBERS(rng, bulkInvoiceCount);
  const riskLevels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  const currencies  = ['PLN', 'PLN', 'PLN', 'EUR'] as string[];

  const invoiceRows = invNumbers.map((num, i) => {
    const issueDate = randomDate(90, rng);
    const dueDate   = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const amount    = Math.round((500 + rng() * 49500) * 100) / 100;
    const riskIdx   = rng() < 0.15 ? 2 : rng() < 0.35 ? 1 : 0;
    const vendorId  = vendorIds.length > 0 ? pickRandom(vendorIds, rng) : null;

    return {
      company_id:     companyId,
      vendor_id:      vendorId,
      invoice_number: num,
      issue_date:     isoDate(issueDate),
      due_date:       isoDate(dueDate),
      amount,
      total_amount:   amount,
      currency:       pickRandom(currencies, rng),
      overall_risk:   riskLevels[riskIdx],
      seller_nip:     riskIdx === 2 && rng() < 0.3 ? null : `${Math.floor(1000000000 + rng() * 8999999999)}`,
      bank_account:   `PL${Math.floor(10 + rng() * 89)}XXXX`,
      raw_file_url:   null,
    };
  });

  const insertedBulkIds: string[] = [];
  for (let i = 0; i < invoiceRows.length; i += 50) {
    const { data: invBatch, error: invErr } = await db
      .from('invoices')
      .insert(invoiceRows.slice(i, i + 50))
      .select('id, overall_risk');
    if (invErr) throw new Error(`Bulk invoice insert failed: ${invErr.message}`);
    (invBatch ?? []).forEach((inv: { id: string }) => insertedBulkIds.push(inv.id));
  }

  // ── 8. Insert risk flags on bulk invoices ─────────────────────────────────
  const bulkFlagRows: Array<Record<string, unknown>> = [];
  invoiceRows.forEach((inv, i) => {
    const invId = insertedBulkIds[i];
    if (!invId) return;
    const flagCount =
      inv.overall_risk === 'high'   ? Math.floor(1 + rng() * 3) :
      inv.overall_risk === 'medium' ? Math.floor(1 + rng() * 2) :
      0;
    for (let f = 0; f < flagCount; f++) {
      const tpl = pickRandom(BULK_RISK_FLAG_TEMPLATES, rng);
      bulkFlagRows.push({
        invoice_id: invId,
        type:       tpl.type,
        severity:   inv.overall_risk === 'high' && f === 0 ? 'high' : tpl.severity,
        message:    tpl.message,
      });
    }
  });

  if (bulkFlagRows.length > 0) {
    for (let i = 0; i < bulkFlagRows.length; i += 100) {
      await db.from('risk_flags').insert(bulkFlagRows.slice(i, i + 100));
    }
  }

  // ── 9. Create demo_sessions record ────────────────────────────────────────
  const expiresAt = new Date(Date.now() + opts.ttlHours * 60 * 60 * 1000).toISOString();
  const { data: session, error: sessionErr } = await db
    .from('demo_sessions' as never)
    .insert({
      demo_company_id: companyId,
      demo_user_id:    authUserId,
      seed_preset:     preset,
      ttl_hours:       opts.ttlHours,
      expires_at:      expiresAt,
      created_by_ip:   opts.createdByIp ?? null,
      is_active:       true,
    } as never)
    .select('id')
    .single();

  if (sessionErr) throw new Error(`Session insert failed: ${sessionErr.message}`);
  const demoSessionId = (session as { id: string }).id;

  await db
    .from('companies')
    .update({ demo_session_id: demoSessionId })
    .eq('id', companyId);

  return {
    demoSessionId,
    demoCompanyId: companyId,
    demoUserId:    authUserId,
    demoEmail,
    demoPassword,
    expiresAt,
  };
}

// ─── Password generator ───────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 16; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}
