export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskInvoice {
  id: string;
  createdAt: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  sellerNip: string | null;
  sellerName: string | null;
  bankAccount: string | null;
}

export interface RiskFinding {
  ruleCode: string;
  ruleName: string;
  severity: RiskSeverity;
  score: number;
  message: string;
  details: Record<string, unknown>;
}

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];
const HIGH_VALUE_THRESHOLD = 50_000;
const AMOUNT_TOLERANCE = 0.01;

export function normalizeNip(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\s-]/g, '');
}

export function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const digits = nip.split('').map(Number);
  const sum = NIP_WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  return sum % 11 === digits[9];
}

function normalizeAccount(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

function normalizeText(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function maskAccount(account: string): string {
  return `...${account.slice(-4)}`;
}

function isEarlier(candidate: RiskInvoice, current: RiskInvoice): boolean {
  if (!candidate.createdAt || !current.createdAt) return false;
  return new Date(candidate.createdAt).getTime() < new Date(current.createdAt).getTime();
}

function checkMissingNip(nip: string): RiskFinding[] {
  if (nip) return [];
  return [{
    ruleCode: 'missing_supplier_nip',
    ruleName: 'Brak numeru NIP dostawcy',
    severity: 'high',
    score: 80,
    message: 'Na tej fakturze brakuje numeru identyfikacji podatkowej (NIP) dostawcy.',
    details: {},
  }];
}

function checkInvalidNip(nip: string): RiskFinding[] {
  if (!nip || isValidNip(nip)) return [];
  return [{
    ruleCode: 'invalid_supplier_nip',
    ruleName: 'Nieprawidłowy NIP dostawcy',
    severity: 'critical',
    score: 100,
    message: `Numer NIP dostawcy „${nip}” jest nieprawidłowy. Numer NIP musi składać się z dokładnie 10 cyfr i zawierać poprawną sumę kontrolną.`,
    details: { nip, length: nip.length },
  }];
}

function checkDuplicate(current: RiskInvoice, nip: string, history: RiskInvoice[]): RiskFinding[] {
  const number = normalizeText(current.invoiceNumber);
  if (!number || !current.invoiceDate || current.totalAmount === null) return [];

  const matches = history.filter((h) =>
    normalizeNip(h.sellerNip) === nip &&
    normalizeText(h.invoiceNumber) === number &&
    h.invoiceDate === current.invoiceDate &&
    h.totalAmount !== null &&
    Math.abs(h.totalAmount - current.totalAmount!) < AMOUNT_TOLERANCE &&
    isEarlier(h, current)
  );

  if (matches.length === 0) return [];

  return [{
    ruleCode: 'duplicate_invoice',
    ruleName: 'Duplikat',
    severity: 'high',
    score: 100,
    message: `Istnieje już pasująca faktura (numer ${current.invoiceNumber}, ten sam dostawca, data i kwota). Pewność: 100%.`,
    details: {
      matchedInvoiceIds: matches.map((m) => m.id),
      matchedFields: ['supplier_nip', 'invoice_number', 'invoice_date', 'gross_total'],
    },
  }];
}

function checkBankAccountChange(current: RiskInvoice, approvedAccounts: string[]): RiskFinding[] {
  const account = normalizeAccount(current.bankAccount);
  if (!account) return [];

  const approved = Array.from(new Set(approvedAccounts.map(normalizeAccount).filter(Boolean)));
  if (approved.includes(account)) return [];

  const message = approved.length > 0
    ? `Ten dostawca korzystał wcześniej z innych rachunków bankowych. Na tej fakturze wskazano rachunek ${maskAccount(account)}. Przed dokonaniem płatności prosimy o weryfikację..`
    : `Na tej fakturze wskazano rachunek ${maskAccount(account)}$, który nie znajduje się na liście zatwierdzonych rachunków bankowych dostawcy. Przed dokonaniem płatności należy zweryfikować te dane.`;

  return [{
    ruleCode: 'supplier_bank_account_changed',
    ruleName: 'Zmiana rachunku bankowego dostawcy',
    severity: 'high',
    score: 75,
    message,
    details: {
      currentAccount: maskAccount(account),
      previousAccounts: approved.map(maskAccount),
    },
  }];
}

function checkMasterDataChange(current: RiskInvoice, nip: string, history: RiskInvoice[]): RiskFinding[] {
  const name = normalizeText(current.sellerName);
  if (!name) return [];

  const knownNames = Array.from(new Set(
    history
      .filter((h) => normalizeNip(h.sellerNip) === nip)
      .map((h) => normalizeText(h.sellerName))
      .filter(Boolean)
  ));
  if (knownNames.length === 0 || knownNames.includes(name)) return [];

  return [{
    ruleCode: 'supplier_master_data_changed',
    ruleName: 'Zmieniono podstawowe dane dostawcy',
    severity: 'medium',
    score: 50,
    message: `Nazwa dostawcy na tej fakturze („${current.sellerName}”) różni się od nazwy na wcześniejszych fakturach dla tego samego numeru NIP („${knownNames[0]}").`,
    details: { currentName: current.sellerName, previousNames: knownNames },
  }];
}

function checkMissingBankAccount(current: RiskInvoice): RiskFinding[] {
  if (normalizeAccount(current.bankAccount)) return [];
  return [{
    ruleCode: 'missing_bank_account',
    ruleName: 'Brak numeru konta',
    severity: 'medium',
    score: 50,
    message: 'Na tej fakturze nie znaleziono numeru rachunku bankowego.',
    details: {},
  }];
}

function checkHighValue(current: RiskInvoice): RiskFinding[] {
  if (current.totalAmount === null || current.totalAmount <= HIGH_VALUE_THRESHOLD) return [];
  return [{
    ruleCode: 'high_value_invoice',
    ruleName: 'Faktura na wysoką kwotę',
    severity: 'high',
    score: 75,
    message: `Suma faktury ${current.totalAmount.toFixed(2)} przekracza ${HIGH_VALUE_THRESHOLD.toLocaleString('en-US')}.`,
    details: { totalAmount: current.totalAmount },
  }];
}

export interface RiskCheckResults {
  nip: string;
  nipValid: boolean;
  findings: RiskFinding[];
}

export function evaluateInvoiceRisk(
  current: RiskInvoice,
  history: RiskInvoice[],
  approvedBankAccounts: string[],
): RiskCheckResults {
  const nip = normalizeNip(current.sellerNip);
  const nipValid = nip !== '' && isValidNip(nip);

  const nipFindings = [...checkMissingNip(nip), ...checkInvalidNip(nip)];
  const historyFindings = nipValid
    ? [
        ...checkDuplicate(current, nip, history),
        ...checkMasterDataChange(current, nip, history),
      ]
    : [];

  return {
    nip,
    nipValid,
    findings: [
      ...nipFindings,
      ...historyFindings,
      ...checkBankAccountChange(current, approvedBankAccounts),
      ...checkMissingBankAccount(current),
      ...checkHighValue(current),
    ],
  };
}

export function highestSeverity(severities: RiskSeverity[]): RiskSeverity | null {
  const order: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];
  let best: RiskSeverity | null = null;
  for (const s of severities) {
    if (best === null || order.indexOf(s) > order.indexOf(best)) best = s;
  }
  return best;
}
