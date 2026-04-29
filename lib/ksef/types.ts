export interface KSeFSession {
  sessionToken: string;
  referenceNumber: string;
  expiresAt: Date;
}

export interface KSeFContextIdentifier {
  type: 'onip' | 'pesel' | 'fingerprint' | 'nrId';
  identifier: string;
}

export interface KSeFInitTokenRequest {
  contextIdentifier: KSeFContextIdentifier;
  token: string;
}

export interface KSeFInitTokenResponse {
  referenceNumber: string;
  timestamp: string;
}

export type KSeFSessionStatus =
  | 'RECEIVED'
  | 'AUTHORISED'
  | 'WAITING'
  | 'CANCELLED'
  | 'ERROR';

export interface KSeFSessionStatusResponse {
  processingCode: number;
  processingDescription: string;
  referenceNumber: string;
  timestamp: string;
  sessionToken?: {
    token: string;
    context: {
      contextIdentifier: KSeFContextIdentifier;
      contextName: { type: string; tradeName: string | null; fullName: string };
      credentials: {
        credentialsIdentifier: KSeFContextIdentifier;
        credentialsRole: { roleType: string; roleDescription: string }[];
      }[];
    };
  };
}

export interface KSeFInvoiceHash {
  hashSHA: {
    algorithm: string;
    encoding: string;
    value: string;
  };
  fileSize: number;
}

export interface KSeFSubjectName {
  businessName?: string;
  fullName?: string;
  tradeName?: string | null;
}

export interface KSeFSubjectIdentifier {
  type: string;
  identifier: string;
}

export interface KSeFInvoiceData {
  invoiceNumber: string;
  issuingDate: string;
  gross: string;
  currency: string;
  net?: string;
  vat?: string;
}

export interface KSeFInvoiceHeader {
  ksefReferenceNumber: string;
  invoiceHash: KSeFInvoiceHash;
  invoiceData: KSeFInvoiceData;
  subjectBy: {
    issuedToIdentifier?: KSeFSubjectIdentifier;
    issuedToName?: KSeFSubjectName;
    issuedByIdentifier?: KSeFSubjectIdentifier;
    issuedByName?: KSeFSubjectName;
  };
  subjectTo: {
    issuedToIdentifier?: KSeFSubjectIdentifier;
    issuedToName?: KSeFSubjectName;
  };
  acquisitionTimestamp: string;
}

export interface KSeFInvoiceListResponse {
  pageOffset: number;
  pageSize: number;
  headerRowCount: number;
  invoiceHeaderList: KSeFInvoiceHeader[];
}

export interface KSeFFilteredListRequest {
  invoiceHeaderList: {
    subjectType: 'subject1' | 'subject2' | 'subject3';
    invoiceDateFrom?: string;
    invoiceDateTo?: string;
    dueValue?: number;
    amountFrom?: number;
    amountTo?: number;
    currencyCodes?: string[];
    subjectNip?: string;
  };
}

export interface KSeFPublicKeyResponse {
  publicKey: string;
  timestamp: string;
}

export interface KSeFInvoiceMetadata {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  sellerNip: string;
  sellerName: string;
  buyerNip: string;
  buyerName: string;
  totalGross: number;
  totalNet: number;
  totalVat: number;
  currency: string;
  ksefSchemaVersion: string;
  lineItems: KSeFLineItem[];
  bankAccount: string | null;
}

export interface KSeFLineItem {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  netAmount: number | null;
  vatRate: string | null;
  vatAmount: number | null;
  grossAmount: number | null;
}
