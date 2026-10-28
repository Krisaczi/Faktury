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

interface DiagnosticsData {
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
  debugLogs: DebugLogEntry[];
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

  async function handleValidate() {
    setValidating(true);
    await fetchDiagnostics();
    setValidating(false);
    // Log to browser console
    if (data) {
      // eslint-disable-next-line no-console
      console.group('[KSeF Validation]');
      // eslint-disable-next-line no-console
      console.log('Invoice:', data.rawXml ? 'XML Generated' : 'No XML');
      if (data.valid) {
        // eslint-disable-next-line no-console
        console.log('Result: PASSED');
        // eslint-disable-next-line no-console
        console.log('Ready for submission');
      } else {
        // eslint-disable-next-line no-console
        console.log('Result: FAILED');
        // eslint-disable-next-line no-console
        console.log('Missing Fields:', data.missingFields);
        // eslint-disable-next-line no-console
        console.log('Warnings:', data.warnings);
      }
      // eslint-disable-next-line no-console
      console.groupEnd();
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
              Waliduj KSeF
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
