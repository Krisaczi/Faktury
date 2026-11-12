export type BankAccountDecision = 'account_added' | 'kept_for_invoice';

export type BankWhiteListStatus = 'VALID' | 'INVALID' | 'NOT_FOUND' | 'ERROR';

export interface BankAccountReviewDetails {
  vendorName: string | null;
  currentAccount: string | null;
  previousAccounts: string[];
  newAccount: string | null;
  whiteList: {
    status: BankWhiteListStatus;
    companyName: string | null;
    message: string;
  } | null;
}

const WHITE_LIST_STATUSES: BankWhiteListStatus[] = ['VALID', 'INVALID', 'NOT_FOUND', 'ERROR'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseWhiteListStatus(details: unknown): BankWhiteListStatus {
  if (!isRecord(details) || !isRecord(details.whiteList)) return 'ERROR';
  const status = details.whiteList.status;
  return WHITE_LIST_STATUSES.includes(status as BankWhiteListStatus)
    ? (status as BankWhiteListStatus)
    : 'ERROR';
}

export function parseBankAccountReviewDetails(details: unknown): BankAccountReviewDetails {
  const record = isRecord(details) ? details : {};
  const wl = isRecord(record.whiteList) ? record.whiteList : null;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

  return {
    vendorName: typeof record.vendorName === 'string' ? record.vendorName : null,
    currentAccount: typeof record.currentAccount === 'string' ? record.currentAccount : null,
    previousAccounts: strings(record.previousAccounts),
    newAccount: typeof record.newAccount === 'string' ? record.newAccount : null,
    whiteList: wl
      ? {
          status: parseWhiteListStatus(record),
          companyName: typeof wl.companyName === 'string' ? wl.companyName : null,
          message: typeof wl.message === 'string' ? wl.message : '',
        }
      : null,
  };
}
