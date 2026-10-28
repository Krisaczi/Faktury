'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  RefreshCw,
  Copy,
  Download,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode2,
  Info,
  Clock,
  Hash,
  Calculator,
  AlertOctagon,
  Code2,
  GitCompare,
  Search,
  FileSearch,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationCheck {
  field: string;
  label: string;
  ksefField: string;
  present: boolean;
  value: string | null;
  severity: 'error' | 'warning';
  message: string;
}

interface ValidationGroup {
  name: string;
  checks: ValidationCheck[];
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationCheck[];
  warnings: ValidationCheck[];
  groups: ValidationGroup[];
  missingFields: string[];
  warningFields: string[];
}

interface FieldMapping {
  invoiceField: string;
  ksefElement: string;
  value: string | null;
  status: 'mapped' | 'missing' | 'invalid';
  note?: string;
}

interface DebugLogEntry {
  id: string;
  eventType: string;
  status: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface XmlValidationError {
  category: 'schema' | 'business';
  severity: 'error' | 'warning';
  rule: string;
  element?: string;
  message: string;
  detail?: string;
}

interface XmlValidationResult {
  valid: boolean;
  errors: XmlValidationError[];
  warnings: XmlValidationError[];
  schemaErrors: XmlValidationError[];
  businessErrors: XmlValidationError[];
  summaryCheck?: {
    p13Sum: number;
    p15: number;
    netTotal: number;
    grossTotal: number;
    consistent: boolean;
  } | null;
}

interface CorrectionInfo {
  type: string;
  label: string;
  details: string[];
}

interface ValidationSectionCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  detail?: string;
}

interface ValidationSection {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  checks: ValidationSectionCheck[];
}

interface VatLineTrace {
  linePosition: number;
  lineName: string;
  rawRate: string;
  netAmount: number;
  vatAmount: number;
}

interface VatSummaryGroup {
  rate: string;
  p12Value: string;
  p13Element: string;
  p14Element: string | null;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  order: number;
  businessReason: string;
  lineTraces: VatLineTrace[];
}

interface VatSummary {
  groups: VatSummaryGroup[];
  totalNet: number;
  p15: number;
  p13Sum: number;
  p14Sum: number;
  emittedP13Fields: string[];
  emittedP14Fields: string[];
  detectedRates: string[];
}

interface ActiveCategories {
  hasExempt: boolean;
  hasReverseCharge: boolean;
  hasNonTaxable: boolean;
  hasZero: boolean;
}

interface PreSubmissionReport {
  overallStatus: 'ready' | 'blocked' | 'warning';
  sections: ValidationSection[];
  generatedXml: string;
  detectedVatCategories: string[];
  emittedP13Fields: string[];
  emittedP14Fields: string[];
  computedTotalNet: number;
  computedP15: number;
  invoiceNetTotal: number;
  invoiceGrossTotal: number;
  mathConsistent: boolean;
  readyForKsef: boolean;
}

interface KsefValidationError {
  xpath?: string;
  element?: string;
  message?: string;
  errorCode?: string;
  expectedValue?: string;
  actualValue?: string;
}

interface KsefRejectionDetails {
  rejected: boolean;
  status: string;
  referenceNumber: string | null;
  processingCode: number | null;
  processingDescription: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorPath: string | null;
  validationErrors: KsefValidationError[];
  rawResponse: Record<string, unknown> | null;
  rejectionStage: 'send' | 'session' | 'auth' | 'unknown';
}

interface DiagnosticsData {
  invoiceId: string;
  invoiceNumber: string | null;
  valid: boolean;
  missingFields: string[];
  warnings: string[];
  xmlGenerated: boolean;
  submitted: boolean;
  validation: ValidationResult;
  fieldMappings: FieldMapping[];
  rawXml: string | null;
  ksefNumber: string | null;
  ksefStatus: string | null;
  submissionDate: string | null;
  lastAttempt: string | null;
  submissionId: string | null;
  responsePayload: Record<string, unknown> | null;
  rejectionDetails: KsefRejectionDetails | null;
  debugLogs: DebugLogEntry[];
  xmlValidation: XmlValidationResult | null;
  preSubmissionReport: PreSubmissionReport | null;
  vatSummary: VatSummary | null;
  activeCategories: ActiveCategories | null;
  correctionInfo: CorrectionInfo | null;
  correctedInvoiceNumber: string | null;
  correctedInvoiceDate: string | null;
  correctedInvoiceKsefNo: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
  } catch {
    return date;
  }
}

const STATUS_STYLES: Record<string, string> = {
  passed:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  accepted:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  started:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  info:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  XML_GENERATED:         <FileCode2 className="w-3.5 h-3.5" />,
  VALIDATION_PASSED:     <CheckCircle className="w-3.5 h-3.5" />,
  VALIDATION_FAILED:     <XCircle className="w-3.5 h-3.5" />,
  SUBMISSION_STARTED:    <RefreshCw className="w-3.5 h-3.5" />,
  SUBMISSION_ACCEPTED:   <CheckCircle className="w-3.5 h-3.5" />,
  SUBMISSION_REJECTED:   <XCircle className="w-3.5 h-3.5" />,
  RESPONSE_RECEIVED:     <Info className="w-3.5 h-3.5" />,
};

function syntaxHighlightXml(xml: string): string {
  return xml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(&lt;\/?)([\w:]+)/g, '$1<span style="color:#3b82f6;font-weight:600">$2</span>')
    .replace(/([\w:]+)=(&quot;[^&]*&quot;)/g, '<span style="color:#8b5cf6">$1</span>=<span style="color:#10b981">$2</span>')
    .replace(/(&gt;)([^&<]+)(&lt;)/g, '$1<span style="color:#f59e0b">$2</span>$3');
}

// ─── XML Viewer ───────────────────────────────────────────────────────────────

function XmlViewer({ xml, invoiceId }: { xml: string; invoiceId: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ksef-invoice-${invoiceId}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileCode2 className="w-3.5 h-3.5" />
          <span className="font-mono">{xml.length.toLocaleString()} chars</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm" variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={handleCopy}
          >
            {copied ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={handleDownload}
          >
            <Download className="w-3 h-3" />
            Download
          </Button>
        </div>
      </div>
      <pre
        className="overflow-auto max-h-96 text-xs font-mono p-3 bg-slate-900 text-slate-100 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: syntaxHighlightXml(xml) }}
      />
    </div>
  );
}

// ─── Validation Report View (6 sections) ─────────────────────────────────────

// ─── KSeF Semantic Validation View ───────────────────────────────────────────

function SemanticValidationView({
  report,
  vatSummary,
  correctionInfo,
  correctedInvoiceNumber,
  correctedInvoiceDate,
  correctedInvoiceKsefNo,
}: {
  report: PreSubmissionReport;
  vatSummary: VatSummary | null;
  correctionInfo: CorrectionInfo | null;
  correctedInvoiceNumber: string | null;
  correctedInvoiceDate: string | null;
  correctedInvoiceKsefNo: string | null;
}) {
  const [open, setOpen] = useState(true);

  const semanticSection = report.sections.find(s => s.name === 'KSeF Semantic Validation');
  if (!semanticSection) return null;

  const hasFail = semanticSection.status === 'fail';
  const hasWarning = semanticSection.status === 'warning';

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      hasFail
        ? 'border-red-200 dark:border-red-800/50'
        : hasWarning
          ? 'border-amber-200 dark:border-amber-800/50'
          : 'border-emerald-200 dark:border-emerald-800/50',
    )}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <ShieldCheck className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
          KSeF Semantic Validation
        </span>
        {hasFail
          ? <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 gap-1"><XCircle className="w-3 h-3" /> Issues</Badge>
          : hasWarning
            ? <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 gap-1"><AlertTriangle className="w-3 h-3" /> Warnings</Badge>
            : <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1"><CheckCircle className="w-3 h-3" /> Passed</Badge>}
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-3">

          {/* Semantic checks */}
          <div className="space-y-1.5">
            {semanticSection.checks.map((check) => (
              <div key={check.name} className="flex items-start gap-2 text-xs">
                {check.status === 'pass'
                  ? <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                  : check.status === 'warning'
                    ? <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                    : <XCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{check.name}:</span>{' '}
                  <span className={cn(
                    check.status === 'pass' ? 'text-slate-500 dark:text-slate-400' : '',
                    check.status === 'warning' ? 'text-amber-600 dark:text-amber-500' : '',
                    check.status === 'fail' ? 'text-red-600 dark:text-red-400' : '',
                  )}>{check.message}</span>
                  {check.detail && <div className="text-[10px] text-slate-400 mt-0.5">{check.detail}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Correction linkage review */}
          {correctionInfo && (
            <div className="rounded-md border border-slate-100 dark:border-slate-800 px-2.5 py-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <FileSearch className="w-3.5 h-3.5" />
                Correction Linkage Review
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-32">Original Number:</span>
                  <code className="font-mono text-slate-600 dark:text-slate-400">{correctedInvoiceNumber ?? '—'}</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-32">Original Date:</span>
                  <code className="font-mono text-slate-600 dark:text-slate-400">{correctedInvoiceDate ?? '—'}</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-32">Original KSeF No:</span>
                  {correctedInvoiceKsefNo ? (
                    <code className="font-mono text-emerald-600 dark:text-emerald-400">{correctedInvoiceKsefNo}</code>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Missing — KSeF may reject
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 w-32">Reference Status:</span>
                  {correctedInvoiceKsefNo
                    ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Linked</Badge>
                    : <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Unlinked</Badge>}
                </div>
              </div>
            </div>
          )}

          {/* Debug mode: VAT Category → P_13 Field → Amount → Reason */}
          <div className="rounded-md border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/30 text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Debug: VAT Category → P_13 → Amount → Reason
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {(vatSummary?.groups ?? []).map((group) => (
                <div key={`debug-${group.p13Element}`} className="px-2.5 py-1.5 text-[10px] font-mono">
                  <span className="text-blue-600 dark:text-blue-400">{group.p12Value}</span>
                  <span className="text-slate-400"> → </span>
                  <span className="text-amber-700 dark:text-amber-400">{group.p13Element}</span>
                  <span className="text-slate-400"> → </span>
                  <span className={cn(
                    group.netTotal < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400',
                  )}>{group.netTotal.toFixed(2)}</span>
                  <span className="text-slate-400"> → </span>
                  <span className="text-slate-500 dark:text-slate-400">{group.businessReason}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function ValidationReportView({ report }: { report: PreSubmissionReport }) {
  const [open, setOpen] = useState(!report.readyForKsef);

  const overallColor = report.overallStatus === 'ready'
    ? 'border-emerald-200 dark:border-emerald-800/50'
    : report.overallStatus === 'warning'
      ? 'border-amber-200 dark:border-amber-800/50'
      : 'border-red-200 dark:border-red-800/50';

  return (
    <div className={cn('rounded-lg border transition-colors', overallColor)}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
          Validation Report ({report.sections.length} sections)
        </span>
        {report.overallStatus === 'ready'
          ? <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1"><CheckCircle className="w-3 h-3" /> Ready</Badge>
          : report.overallStatus === 'warning'
            ? <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 gap-1"><AlertTriangle className="w-3 h-3" /> Warning</Badge>
            : <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 gap-1"><XCircle className="w-3 h-3" /> Blocked</Badge>}
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-3">
          {/* Ready for KSeF banner */}
          <div className={cn(
            'rounded-md px-3 py-2 text-sm font-semibold flex items-center gap-2',
            report.readyForKsef
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
          )}>
            {report.readyForKsef
              ? <><CheckCircle className="w-4 h-4" /> Ready for KSeF submission</>
              : <><XCircle className="w-4 h-4" /> Blocked — fix errors before submitting to KSeF</>}
          </div>

          {/* Section status grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {report.sections.map((section) => (
              <div
                key={section.name}
                className={cn(
                  'rounded-md px-2 py-1.5 text-xs flex items-center gap-1.5',
                  section.status === 'pass'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : section.status === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                )}
              >
                {section.status === 'pass'
                  ? <CheckCircle className="w-3 h-3" />
                  : section.status === 'warning'
                    ? <AlertTriangle className="w-3 h-3" />
                    : <XCircle className="w-3 h-3" />}
                <span className="font-medium">{section.name}</span>
              </div>
            ))}
          </div>

          {/* Detailed checks per section */}
          <div className="space-y-2 mt-2">
            {report.sections.map((section) => (
              <div key={section.name} className="border border-slate-100 dark:border-slate-800 rounded-md">
                <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                  {section.status === 'pass'
                    ? <CheckCircle className="w-3 h-3 text-emerald-500" />
                    : section.status === 'warning'
                      ? <AlertTriangle className="w-3 h-3 text-amber-500" />
                      : <XCircle className="w-3 h-3 text-red-500" />}
                  {section.name}
                </div>
                <div className="px-2.5 py-2 space-y-1">
                  {section.checks.map((check) => (
                    <div key={check.name} className="flex items-start gap-1.5 text-xs">
                      {check.status === 'pass'
                        ? <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                        : check.status === 'warning'
                          ? <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                          : <XCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />}
                      <div className="min-w-0">
                        <span className="text-slate-600 dark:text-slate-400">{check.name}:</span>{' '}
                        <span className={cn(
                          check.status === 'pass' ? 'text-slate-500 dark:text-slate-400' : '',
                          check.status === 'warning' ? 'text-amber-600 dark:text-amber-500' : '',
                          check.status === 'fail' ? 'text-red-600 dark:text-red-400' : '',
                        )}>{check.message}</span>
                        {check.detail && <div className="text-[10px] text-slate-400 mt-0.5">{check.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VAT Audit View (P_13 fields, P_15 calculation) ──────────────────────────

function VatAuditView({
  summary,
  report,
  activeCategories,
}: {
  summary: VatSummary;
  report: PreSubmissionReport | null;
  activeCategories: ActiveCategories | null;
}) {
  const [open, setOpen] = useState(false);
  const p15Diff = report ? Math.round((report.computedP15 - report.invoiceGrossTotal) * 100) / 100 : 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <Calculator className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
          VAT Summary Audit
        </span>
        <Badge className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0">
          {summary.emittedP13Fields.length} P_13 fields
        </Badge>
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-3">
          {/* Detected VAT categories */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Detected VAT Categories
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.detectedRates.map((rate) => (
                <Badge key={rate} className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                  {rate}
                </Badge>
              ))}
            </div>
          </div>

          {/* Active categories */}
          {activeCategories && (
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Active Annotations
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeCategories.hasReverseCharge && <Badge className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0">Reverse Charge (P_18=1)</Badge>}
                {activeCategories.hasExempt && <Badge className="text-[10px] bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-0">VAT Exempt (P_19=1)</Badge>}
                {activeCategories.hasNonTaxable && <Badge className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0">Non-taxable (NP)</Badge>}
                {activeCategories.hasZero && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">0% VAT</Badge>}
                {!activeCategories.hasReverseCharge && !activeCategories.hasExempt && !activeCategories.hasNonTaxable && !activeCategories.hasZero && (
                  <span className="text-xs text-slate-400">Standard VAT rates only</span>
                )}
              </div>
            </div>
          )}

          {/* P_13 field table */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Generated P_13 Summary Fields
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                    <th className="text-left px-2 py-1.5 font-medium">Element</th>
                    <th className="text-left px-2 py-1.5 font-medium">Rate</th>
                    <th className="text-right px-2 py-1.5 font-medium">Net</th>
                    <th className="text-right px-2 py-1.5 font-medium">VAT</th>
                    <th className="text-right px-2 py-1.5 font-medium">Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.groups.map((group) => (
                    <tr key={group.p13Element} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">{group.p13Element}</td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{group.p12Value}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-600 dark:text-slate-400">{group.netTotal.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-500 dark:text-slate-400">
                        {group.p14Element ? group.vatTotal.toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-600 dark:text-slate-400">{group.grossTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* VAT Mapping Trace — per-line-item traceability */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              VAT Mapping Trace (per line item)
            </div>
            <div className="space-y-1.5">
              {summary.groups.map((group) => (
                <div key={`trace-${group.p13Element}`} className="rounded-md border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/30 text-xs flex items-center gap-2">
                    <code className="font-mono text-slate-600 dark:text-slate-400">{group.p13Element}</code>
                    <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">{group.p12Value}</Badge>
                    <span className="text-slate-400 ml-auto">{group.lineTraces.length} line(s)</span>
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {group.lineTraces.map((lt, i) => (
                      <div key={i} className="px-2.5 py-1.5 grid grid-cols-1 sm:grid-cols-4 gap-1.5 text-[10px]">
                        <div>
                          <span className="text-slate-400">Line:</span>
                          <code className="font-mono text-slate-600 dark:text-slate-400 ml-1">#{lt.linePosition}</code>
                          <span className="text-slate-400 ml-1.5 truncate">{lt.lineName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">VAT Rate:</span>
                          <code className="font-mono text-slate-600 dark:text-slate-400 ml-1">{lt.rawRate}</code>
                        </div>
                        <div>
                          <span className="text-slate-400">Mapped To:</span>
                          <code className="font-mono text-amber-700 dark:text-amber-400 ml-1">{group.p13Element}</code>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400">Net:</span>
                          <code className="font-mono text-slate-600 dark:text-slate-400 ml-1">{lt.netAmount.toFixed(2)}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mapping Audit — category to P_13 with reason */}
          <div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <FileSearch className="w-3.5 h-3.5" />
              Mapping Audit (category → P_13 field with reason)
            </div>
            <div className="space-y-2">
              {summary.groups.map((group) => (
                <div key={`audit-${group.p13Element}`} className="rounded-md border border-slate-100 dark:border-slate-800 px-2.5 py-2">
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="text-slate-400 font-medium">Detected:</span>
                    <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">{group.p12Value}</Badge>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-400 font-medium">Generated:</span>
                    <code className="font-mono text-amber-700 dark:text-amber-400">{group.p13Element}</code>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="text-slate-400 font-medium">Reason: </span>
                    {group.businessReason}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    <span className="font-medium">Amount: </span>
                    <code className="font-mono">{group.netTotal.toFixed(2)}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* P_15 calculation breakdown */}
          <div className={cn(
            'rounded-md px-3 py-2 text-xs',
            report?.mathConsistent
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
          )}>
            <div className="flex items-center gap-1.5 font-semibold mb-1.5">
              {report?.mathConsistent
                ? <CheckCircle className="w-3.5 h-3.5" />
                : <XCircle className="w-3.5 h-3.5" />}
              P_15 Calculation
            </div>
            <div className="font-mono text-[10px] space-y-0.5 ml-5">
              <div>SUM(P_13_*) = {summary.p13Sum.toFixed(2)}</div>
              <div>SUM(P_14_*) = {summary.p14Sum.toFixed(2)}</div>
              <div className="border-t border-current/20 pt-0.5 mt-0.5">
                P_15 = SUM(P_13_*) + SUM(P_14_*) = {(summary.totalNet + summary.p14Sum).toFixed(2)}
              </div>
              <div>Computed P_15 = {summary.p15.toFixed(2)}</div>
              {report && (
                <>
                  <div>Invoice gross_total = {report.invoiceGrossTotal.toFixed(2)}</div>
                  {p15Diff !== 0 && (
                    <div className="text-red-500 font-semibold">Difference = {p15Diff.toFixed(2)}</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Emitted field lists */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-400 mb-1">Emitted P_13 fields:</div>
              <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400">
                {summary.emittedP13Fields.length > 0
                  ? summary.emittedP13Fields.join(', ')
                  : '(none)'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 mb-1">Emitted P_14 fields:</div>
              <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400">
                {summary.emittedP14Fields.length > 0
                  ? summary.emittedP14Fields.join(', ')
                  : '(none)'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── XML Validation View ─────────────────────────────────────────────────────

function XmlValidationView({ result }: { result: XmlValidationResult }) {
  const [open, setOpen] = useState(!result.valid);

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      result.valid
        ? 'border-emerald-200 dark:border-emerald-800/50'
        : 'border-red-200 dark:border-red-800/50',
    )}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
          Walidacja FA(3) XML
        </span>
        {result.valid
          ? <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1"><CheckCircle className="w-3 h-3" /> Passed</Badge>
          : <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>}
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-3">
          {result.summaryCheck && (
            <div className={cn(
              'rounded-md px-3 py-2 text-xs',
              result.summaryCheck.consistent
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
            )}>
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                {result.summaryCheck.consistent
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : <XCircle className="w-3.5 h-3.5" />}
                Summary Calculation
              </div>
              <div className="font-mono text-[10px] space-y-0.5 ml-5">
                <div>SUM(P_13_*) = {result.summaryCheck.p13Sum.toFixed(2)}</div>
                <div>P_15 = {result.summaryCheck.p15.toFixed(2)}</div>
                <div>net_total = {result.summaryCheck.netTotal.toFixed(2)}</div>
                <div>gross_total = {result.summaryCheck.grossTotal.toFixed(2)}</div>
              </div>
            </div>
          )}

          {result.schemaErrors.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5" />
                Schema Errors ({result.schemaErrors.length})
              </div>
              {result.schemaErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 ml-5">
                  <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-mono text-[10px] text-red-400">[{err.rule}]</span> {err.message}
                    {err.element && <code className="ml-1 text-[10px] font-mono text-red-400">{err.element}</code>}
                    {err.detail && <div className="text-[10px] text-red-400 mt-0.5">{err.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.businessErrors.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldX className="w-3.5 h-3.5" />
                Business Rule Errors ({result.businessErrors.length})
              </div>
              {result.businessErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 ml-5">
                  <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-mono text-[10px] text-red-400">[{err.rule}]</span> {err.message}
                    {err.element && <code className="ml-1 text-[10px] font-mono text-red-400">{err.element}</code>}
                    {err.detail && <div className="text-[10px] text-red-400 mt-0.5">{err.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Warnings ({result.warnings.length})
              </div>
              {result.warnings.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500 ml-5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-mono text-[10px] text-amber-400">[{err.rule}]</span> {err.message}
                    {err.element && <code className="ml-1 text-[10px] font-mono text-amber-400">{err.element}</code>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.valid && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 ml-5">
              <CheckCircle className="w-3.5 h-3.5" />
              All schema and business rule checks passed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Validation Group ─────────────────────────────────────────────────────────

function ValidationGroupView({ group }: { group: ValidationGroup }) {
  const [open, setOpen] = useState(group.checks.some(c => !c.present));
  const hasErrors = group.checks.some(c => !c.present && c.severity === 'error');
  const hasWarnings = group.checks.some(c => !c.present && c.severity === 'warning');

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      hasErrors
        ? 'border-red-200 dark:border-red-800/50'
        : hasWarnings
          ? 'border-amber-200 dark:border-amber-800/50'
          : 'border-slate-200 dark:border-slate-700',
    )}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">{group.name}</span>
        {hasErrors && <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">Error</Badge>}
        {hasWarnings && <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Warning</Badge>}
        {!hasErrors && !hasWarnings && <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">OK</Badge>}
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 space-y-1.5">
          {group.checks.map((check) => (
            <div key={check.field} className="flex items-center gap-2 text-xs">
              {check.present
                ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                : check.severity === 'error'
                  ? <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              <span className="text-slate-600 dark:text-slate-400 flex-1 min-w-0 truncate">{check.label}</span>
              <code className="font-mono text-slate-400 text-[10px] hidden sm:block">{check.ksefField}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field Mapping Table ──────────────────────────────────────────────────────

function FieldMappingTable({ mappings }: { mappings: FieldMapping[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
            <th className="text-left px-3 py-2 font-medium">Invoice Field</th>
            <th className="text-left px-3 py-2 font-medium">KSeF XML Element</th>
            <th className="text-left px-3 py-2 font-medium">Value</th>
            <th className="text-center px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {mappings.map((m, idx) => (
            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{m.invoiceField}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono">{m.ksefElement}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono max-w-[200px] truncate">
                {m.value ?? '—'}
                {m.note && <span className="block text-[10px] text-slate-400 italic">{m.note}</span>}
              </td>
              <td className="px-3 py-2 text-center">
                {m.status === 'mapped'
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 inline" />
                  : m.status === 'missing'
                    ? <XCircle className="w-3.5 h-3.5 text-red-500 inline" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Debug Log Timeline ───────────────────────────────────────────────────────

function DebugLogTimeline({ logs }: { logs: DebugLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm">
        <Terminal className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
        No diagnostic events recorded yet.
      </div>
    );
  }
  return (
    <ol className="space-y-0">
      {logs.map((log, idx) => (
        <li key={log.id} className="flex gap-3 relative">
          {idx < logs.length - 1 && (
            <div className="absolute left-3 top-6 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
          )}
          <div className={cn(
            'w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-1 relative z-10',
            log.status === 'accepted' || log.status === 'passed'
              ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400'
              : log.status === 'rejected' || log.status === 'failed'
                ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-600 dark:text-red-400'
                : log.status === 'started'
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500',
          )}>
            {EVENT_ICONS[log.eventType] ?? <Info className="w-3.5 h-3.5" />}
          </div>
          <div className="pb-3 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{log.eventType.replace(/_/g, ' ')}</span>
              <Badge className={cn('text-[10px] border', STATUS_STYLES[log.status] ?? STATUS_STYLES.info)}>{log.status}</Badge>
              <span className="text-[10px] text-slate-400 tabular-nums">{fmtDateTime(log.createdAt)}</span>
            </div>
            {log.message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{log.message}</p>}
            {log.payload && Object.keys(log.payload).length > 0 && (
              <pre className="text-[10px] font-mono text-slate-400 mt-1 bg-slate-50 dark:bg-slate-800/50 rounded p-2 overflow-auto max-h-32">
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── KSeF Rejection Details View ─────────────────────────────────────────────

// ─── Internal vs KSeF Comparison View ────────────────────────────────────────

function ValidationComparisonView({
  xmlValidation,
  preSubmissionReport,
  rejectionDetails,
}: {
  xmlValidation: XmlValidationResult | null;
  preSubmissionReport: PreSubmissionReport | null;
  rejectionDetails: KsefRejectionDetails | null;
}) {
  const internalSchema = xmlValidation ? (xmlValidation.schemaErrors.length === 0 ? 'PASS' : 'FAIL') : 'N/A';
  const internalBusiness = xmlValidation ? (xmlValidation.businessErrors.length === 0 ? 'PASS' : 'FAIL') : 'N/A';
  const internalSummary = preSubmissionReport ? (preSubmissionReport.mathConsistent ? 'PASS' : 'FAIL') : 'N/A';
  const internalReady = preSubmissionReport ? (preSubmissionReport.readyForKsef ? 'YES' : 'NO') : 'NO';

  const ksefRejected = rejectionDetails?.rejected ?? false;
  const ksefSchema = ksefRejected ? 'FAIL' : 'PASS';
  const ksefBusiness = ksefRejected ? 'FAIL' : 'PASS';
  const ksefReason = rejectionDetails?.errorMessage ?? rejectionDetails?.processingDescription ?? null;
  const ksefErrorNode = rejectionDetails?.errorPath ?? null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Internal vs KSeF Validation
        </span>
      </div>
      <div className="px-3 py-3 space-y-3">
        {/* Internal validation column */}
        <div>
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            InvoiceIQ Internal Validation
          </div>
          <div className="space-y-1 text-xs">
            <ComparisonRow label="Schema Validation" status={internalSchema} />
            <ComparisonRow label="Business Validation" status={internalBusiness} />
            <ComparisonRow label="Summary Validation" status={internalSummary} />
            <ComparisonRow label="Ready For KSeF" status={internalReady} />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 dark:border-slate-700" />

        {/* KSeF validation column */}
        <div>
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
            {ksefRejected
              ? <XCircle className="w-3 h-3 text-red-500" />
              : <CheckCircle className="w-3 h-3 text-emerald-500" />}
            KSeF Validation
          </div>
          <div className="space-y-1 text-xs">
            <ComparisonRow label="Schema Validation" status={ksefSchema} />
            <ComparisonRow label="Business Validation" status={ksefBusiness} />
            {ksefReason && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-2.5 py-1.5 mt-1.5">
                <div className="text-[10px] font-semibold text-red-700 dark:text-red-400 mb-0.5">Reason:</div>
                <p className="text-xs text-red-800 dark:text-red-300 break-words">{ksefReason}</p>
              </div>
            )}
            {ksefErrorNode && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-2.5 py-1.5 mt-1.5">
                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-0.5">XML Element:</div>
                <code className="text-xs font-mono text-amber-800 dark:text-amber-300 break-all">{ksefErrorNode}</code>
              </div>
            )}
            {!ksefRejected && (
              <div className="text-[10px] text-slate-400 italic mt-1">
                No KSeF rejection recorded — invoice not yet submitted or was accepted.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({ label, status }: { label: string; status: string }) {
  const isPass = status === 'PASS' || status === 'YES';
  const isFail = status === 'FAIL' || status === 'NO';
  return (
    <div className="flex items-center gap-2">
      {isPass
        ? <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
        : isFail
          ? <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
          : <span className="w-3 h-3 text-slate-400 text-[10px] flex-shrink-0">—</span>}
      <span className="text-slate-500 dark:text-slate-400 flex-1">{label}</span>
      <span className={cn(
        'font-mono font-semibold',
        isPass && 'text-emerald-600 dark:text-emerald-400',
        isFail && 'text-red-600 dark:text-red-400',
        !isPass && !isFail && 'text-slate-400',
      )}>{status}</span>
    </div>
  );
}

function RejectionDetailsView({ details }: { details: KsefRejectionDetails }) {
  const [showRaw, setShowRaw] = useState(false);
  const stageLabel = details.rejectionStage === 'send'
    ? 'Invoice send (HTTP 400/422)'
    : details.rejectionStage === 'session'
      ? 'Session processing'
      : details.rejectionStage === 'auth'
        ? 'Authentication'
        : 'Unknown';

  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800/60 overflow-hidden">
      <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/60 flex items-center gap-2">
        <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">
          Why KSeF rejected this document
        </span>
        <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-0 ml-auto">
          {stageLabel}
        </Badge>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* Key rejection fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DetailRow label="Status" value={details.status} />
          <DetailRow label="Reference Number" value={details.referenceNumber} mono />
          <DetailRow label="Processing Code" value={details.processingCode != null ? String(details.processingCode) : null} mono />
          <DetailRow label="Error Code" value={details.errorCode} mono highlight={!!details.errorCode} />
          <DetailRow label="Processing Description" value={details.processingDescription} />
          <DetailRow label="Rejection Stage" value={stageLabel} />
        </div>

        {/* Error message — the most important piece */}
        {details.errorMessage && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-3 py-2">
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
              Exact Error Message from KSeF
            </div>
            <p className="text-sm text-red-800 dark:text-red-300 font-mono break-all">
              {details.errorMessage}
            </p>
          </div>
        )}

        {/* XML element / XPath causing the failure */}
        {details.errorPath && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-3 py-2">
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
              XML Element Causing Rejection
            </div>
            <code className="text-xs font-mono text-amber-800 dark:text-amber-300 break-all">
              {details.errorPath}
            </code>
          </div>
        )}

        {/* Validation errors with full detail */}
        {details.validationErrors.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" />
              Validation Errors from KSeF ({details.validationErrors.length})
            </div>
            <div className="space-y-1.5">
              {details.validationErrors.map((ve, i) => (
                <div key={i} className="rounded-md border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 px-2.5 py-2 space-y-1">
                  {ve.errorCode && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 font-medium">Code:</span>
                      <code className="font-mono text-red-600 dark:text-red-400">{ve.errorCode}</code>
                    </div>
                  )}
                  {ve.message && (
                    <div className="text-xs text-red-700 dark:text-red-400 break-words">
                      {ve.message}
                    </div>
                  )}
                  {ve.xpath && (
                    <div className="flex items-start gap-2 text-[10px]">
                      <span className="text-slate-400 font-medium mt-0.5">XPath:</span>
                      <code className="font-mono text-amber-700 dark:text-amber-400 break-all">{ve.xpath}</code>
                    </div>
                  )}
                  {ve.element && (
                    <div className="flex items-start gap-2 text-[10px]">
                      <span className="text-slate-400 font-medium mt-0.5">Element:</span>
                      <code className="font-mono text-amber-700 dark:text-amber-400 break-all">{ve.element}</code>
                    </div>
                  )}
                  {(ve.expectedValue || ve.actualValue) && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] pt-0.5">
                      {ve.expectedValue && (
                        <div>
                          <span className="text-slate-400">Expected: </span>
                          <code className="font-mono text-emerald-700 dark:text-emerald-400">{ve.expectedValue}</code>
                        </div>
                      )}
                      {ve.actualValue && (
                        <div>
                          <span className="text-slate-400">Actual: </span>
                          <code className="font-mono text-red-600 dark:text-red-400">{ve.actualValue}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw KSeF response — collapsible */}
        {details.rawResponse && (
          <div>
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw
                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex-1">Raw KSeF Response</span>
            </button>
            {showRaw && (
              <pre className="mt-1.5 overflow-auto max-h-64 text-[10px] font-mono p-3 bg-slate-900 text-slate-100 rounded-md">
                {JSON.stringify(details.rawResponse, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, highlight }: { label: string; value: string | null; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-slate-400 font-medium min-w-[120px] flex-shrink-0">{label}:</span>
      <span
        className={cn(
          'text-slate-700 dark:text-slate-300 break-words',
          mono && 'font-mono',
          highlight && 'text-red-600 dark:text-red-400 font-semibold',
        )}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KsefDiagnosticsPanel({ invoiceId }: { invoiceId: string }) {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showXml, setShowXml] = useState(false);
  const [showMappings, setShowMappings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/invoices/${invoiceId}/ksef-diagnostics`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          throw new Error('KSeF diagnostics service unavailable.');
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as DiagnosticsData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KSeF diagnostics service unavailable.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  // Fetch on mount
  useEffect(() => {
    fetchDiagnostics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  function logValidationReport(report: DiagnosticsData) {
    const rpt = report.preSubmissionReport;
    // eslint-disable-next-line no-console
    console.group('[KSeF Validation]');
    // eslint-disable-next-line no-console
    console.log('Schema Status:', report.xmlValidation ? (report.xmlValidation.schemaErrors.length === 0 ? 'PASS' : 'FAIL') : 'N/A');
    // eslint-disable-next-line no-console
    console.log('Business Validation:', report.xmlValidation ? (report.xmlValidation.businessErrors.length === 0 ? 'PASS' : 'FAIL') : 'N/A');
    // eslint-disable-next-line no-console
    console.log('Summary Consistency:', rpt ? (rpt.mathConsistent ? 'PASS' : 'FAIL') : 'N/A');
    // eslint-disable-next-line no-console
    console.log('Correction Consistency:', rpt
      ? (rpt.sections.find(s => s.name === 'Correction Validation')?.status === 'pass' ? 'PASS' : rpt.sections.find(s => s.name === 'Correction Validation')?.status ?? 'N/A')
      : 'N/A');
    // eslint-disable-next-line no-console
    console.log('Ready For KSeF:', rpt ? (rpt.readyForKsef ? 'YES' : 'NO') : 'NO');
    if (rpt) {
      // eslint-disable-next-line no-console
      console.log('Overall:', rpt.overallStatus.toUpperCase());
      // eslint-disable-next-line no-console
      console.log('Detected VAT Categories:', rpt.detectedVatCategories);
      // eslint-disable-next-line no-console
      console.log('Emitted P_13 Fields:', rpt.emittedP13Fields);
      // eslint-disable-next-line no-console
      console.log('Computed Total Net:', rpt.computedTotalNet.toFixed(2));
      // eslint-disable-next-line no-console
      console.log('Computed P_15:', rpt.computedP15.toFixed(2));
      if (!rpt.mathConsistent) {
        // eslint-disable-next-line no-console
        console.error('Math mismatch: P_15 =', rpt.computedP15.toFixed(2), 'but gross_total =', rpt.invoiceGrossTotal.toFixed(2));
      }
      if (report.xmlValidation && report.xmlValidation.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.group('Errors');
        report.xmlValidation.errors.forEach(e => {
          // eslint-disable-next-line no-console
          console.error(`[${e.rule}] ${e.message}`, e.detail ?? '');
        });
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    }
    // eslint-disable-next-line no-console
    console.groupEnd();

    // ── Log KSeF rejection details if rejected ──
    if (report.rejectionDetails?.rejected) {
      const rd = report.rejectionDetails;
      // eslint-disable-next-line no-console
      console.group('[KSeF]');
      // eslint-disable-next-line no-console
      console.log('Status: REJECTED');
      // eslint-disable-next-line no-console
      console.log('Session:', rd.referenceNumber ?? 'N/A');
      // eslint-disable-next-line no-console
      console.log('Invoice:', report.invoiceNumber ?? 'N/A');
      // eslint-disable-next-line no-console
      console.log('ErrorCode:', rd.errorCode ?? 'N/A');
      // eslint-disable-next-line no-console
      console.log('ErrorNode:', rd.errorPath ?? 'N/A');
      // eslint-disable-next-line no-console
      console.log('Message:', rd.errorMessage ?? rd.processingDescription ?? 'N/A');
      if (rd.validationErrors.length > 0) {
        // eslint-disable-next-line no-console
        console.log('Validation Errors:', rd.validationErrors);
      }
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  }

  async function handleValidate() {
    setValidating(true);
    await fetchDiagnostics();
    setValidating(false);
    if (data) {
      logValidationReport(data);
    }
  }

  if (loading && !data) {
    return (
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-amber-200 dark:border-amber-800">
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>KSeF diagnostics service unavailable.</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 ml-6">{error}</p>
          <Button
            size="sm" variant="outline"
            className="mt-3 h-8 text-xs gap-1.5"
            onClick={() => fetchDiagnostics()}
          >
            <RefreshCw className="w-3 h-3" />
            Spróbuj ponownie
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            Diagnostyka KSeF
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.valid ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs gap-1">
                <CheckCircle className="w-3 h-3" /> Gotowe
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs gap-1">
                <XCircle className="w-3 h-3" /> Wymaga poprawy
              </Badge>
            )}
            <Button
              size="sm" variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={handleValidate}
              disabled={validating}
            >
              {validating
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <ShieldCheck className="w-3 h-3" />}
              Validate XML
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Submission Status Summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3 h-3" /> Status
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
              {data.ksefStatus ?? 'Not submitted'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Hash className="w-3 h-3" /> KSeF Number
            </div>
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-0.5 truncate">
              {data.ksefNumber ?? '—'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3 h-3" /> Last Attempt
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">
              {fmtDateTime(data.lastAttempt)}
            </p>
          </div>
        </div>

        {/* ── KSeF Rejection Details ── */}
        {data.rejectionDetails?.rejected && (
          <RejectionDetailsView details={data.rejectionDetails} />
        )}

        {/* ── Internal vs KSeF Validation Comparison ── */}
        <ValidationComparisonView
          xmlValidation={data.xmlValidation}
          preSubmissionReport={data.preSubmissionReport}
          rejectionDetails={data.rejectionDetails}
        />

        {/* ── Ready/Blocked banner ── */}
        {data.preSubmissionReport && (
          <div className={cn(
            'rounded-lg px-4 py-3 flex items-center gap-3',
            data.preSubmissionReport.readyForKsef
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
          )}>
            {data.preSubmissionReport.readyForKsef
              ? <CheckCircle className="w-5 h-5" />
              : <XCircle className="w-5 h-5" />}
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {data.preSubmissionReport.readyForKsef
                  ? 'Validation Passed — Ready for KSeF'
                  : `Validation Failed — ${data.xmlValidation?.errors.length ?? 0} error(s) must be fixed`}
              </div>
              {!data.preSubmissionReport.readyForKsef && data.xmlValidation && (
                <div className="text-xs mt-0.5 space-y-0.5">
                  {data.xmlValidation.errors.slice(0, 3).map((e, i) => (
                    <div key={i} className="font-mono text-[10px]">
                      Location: {e.element ?? 'Fa/P_13_*'} — {e.message}
                    </div>
                  ))}
                  {data.xmlValidation.errors.length > 3 && (
                    <div className="text-[10px] italic">+{data.xmlValidation.errors.length - 3} more errors...</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Validation Report (6 sections) ── */}
        {data.preSubmissionReport && (
          <ValidationReportView report={data.preSubmissionReport} />
        )}

        {/* ── VAT Summary Audit ── */}
        {data.vatSummary && (
          <VatAuditView
            summary={data.vatSummary}
            report={data.preSubmissionReport}
            activeCategories={data.activeCategories}
          />
        )}

        {/* ── FA(3) XML Validation Results ── */}
        {data.xmlValidation && (
          <XmlValidationView result={data.xmlValidation} />
        )}

        {/* ── Correction Invoice Info ── */}
        {data.correctionInfo && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 px-3 py-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
              <FileCode2 className="w-3.5 h-3.5" />
              Korekta Faktury
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Typ korekty:</span>
                <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                  {data.correctionInfo.label}
                </Badge>
              </div>
              {data.correctedInvoiceNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Faktura korygowana:</span>
                  <code className="font-mono text-slate-600 dark:text-slate-400">{data.correctedInvoiceNumber}</code>
                </div>
              )}
              {data.correctedInvoiceDate && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Data wyst.:</span>
                  <code className="font-mono text-slate-600 dark:text-slate-400">{data.correctedInvoiceDate}</code>
                </div>
              )}
              {data.correctedInvoiceKsefNo && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Nr KSeF:</span>
                  <code className="font-mono text-slate-600 dark:text-slate-400">{data.correctedInvoiceKsefNo}</code>
                </div>
              )}
            </div>
            {data.correctionInfo.details.length > 0 && (
              <ul className="text-[10px] text-slate-500 dark:text-slate-400 ml-5 space-y-0.5">
                {data.correctionInfo.details.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── KSeF Semantic Validation ── */}
        {data.preSubmissionReport && (
          <SemanticValidationView
            report={data.preSubmissionReport}
            vatSummary={data.vatSummary}
            correctionInfo={data.correctionInfo}
            correctedInvoiceNumber={data.correctedInvoiceNumber}
            correctedInvoiceDate={data.correctedInvoiceDate}
            correctedInvoiceKsefNo={data.correctedInvoiceKsefNo}
          />
        )}

        {/* ── Validation Groups ── */}
        {data.validation.groups.map((group) => (
          <ValidationGroupView key={group.name} group={group} />
        ))}

        {/* ── Missing Fields Summary ── */}
        {data.missingFields.length > 0 && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <XCircle className="w-4 h-4" />
              Missing Fields ({data.missingFields.length})
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-red-600 dark:text-red-400">
              {data.validation.errors.map((err) => (
                <li key={err.field} className="flex items-center gap-2">
                  <span className="font-mono">{err.field}</span>
                  <span className="text-red-400">→</span>
                  <span>{err.message}</span>
                  <code className="text-[10px] text-red-400 font-mono">({err.ksefField})</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Warnings ── */}
        {data.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Warnings ({data.warnings.length})
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {data.validation.warnings.map((w) => (
                <li key={w.field} className="flex items-center gap-2">
                  <span className="font-mono">{w.field}</span>
                  <span>→</span>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── XML Viewer ── */}
        <Collapsible open={showXml} onOpenChange={setShowXml}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
              {showXml ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <FileCode2 className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">View Generated XML</span>
              {data.rawXml
                ? <Badge className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0">{data.rawXml.length.toLocaleString()} chars</Badge>
                : <Badge className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-0">Not available</Badge>}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            {data.rawXml
              ? <XmlViewer xml={data.rawXml} invoiceId={invoiceId} />
              : <div className="text-xs text-slate-400 text-center py-4">XML could not be generated. Check that the invoice has line items and is not a draft.</div>}
          </CollapsibleContent>
        </Collapsible>

        {/* ── Field Mapping Table ── */}
        <Collapsible open={showMappings} onOpenChange={setShowMappings}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
              {showMappings ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <Info className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">Field Mapping Verification</span>
              <Badge className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0">{data.fieldMappings.length} fields</Badge>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <FieldMappingTable mappings={data.fieldMappings} />
          </CollapsibleContent>
        </Collapsible>

        {/* ── Debug Log Timeline ── */}
        <Collapsible open={showLogs} onOpenChange={setShowLogs}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
              {showLogs ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <Terminal className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">Submission History</span>
              {data.debugLogs.length > 0 && (
                <Badge className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0">{data.debugLogs.length} events</Badge>
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <DebugLogTimeline logs={data.debugLogs} />
          </CollapsibleContent>
        </Collapsible>

        {/* ── KSeF Response ── */}
        {data.responsePayload && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">KSeF Response</span>
            </div>
            <pre className="overflow-auto max-h-48 text-[10px] font-mono p-3 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
              {JSON.stringify(data.responsePayload, null, 2)}
            </pre>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
