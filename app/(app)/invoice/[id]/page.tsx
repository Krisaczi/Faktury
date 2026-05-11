'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Download, FileText, Building2, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Clock, Circle as XCircle, ChevronDown, ChevronRight, Flag, MessageSquare, Shield, ChartBar as BarChart3, ExternalLink, RefreshCw, Check, X, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useInvoiceDetail,
  useVendorSummary,
  type InvoiceFlag,
} from '@/hooks/use-invoice-detail';

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(date: string | null) {
  if (!date) return '—';
  try { return format(parseISO(date), 'MMM d, yyyy'); } catch { return date; }
}

function fmtCurrency(amount: number | null, currency = 'PLN') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amount);
}

// ─── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string | null | undefined }) {
  if (!level) return <Badge variant="outline" className="text-slate-400 border-slate-200 dark:border-slate-700">—</Badge>;
  const styles: Record<string, string> = {
    critical: 'bg-red-200    text-red-800    border-red-300    dark:bg-red-900/50    dark:text-red-300    dark:border-red-700',
    high:     'bg-red-100    text-red-700    border-red-200    dark:bg-red-900/30    dark:text-red-400    dark:border-red-800',
    medium:   'bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900/30  dark:text-amber-400  dark:border-amber-800',
    low:      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  };
  return (
    <Badge variant="outline" className={cn('capitalize font-semibold text-xs', styles[level] ?? '')}>
      {level}
    </Badge>
  );
}

// ─── Severity badge ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: InvoiceFlag['severity'] }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-200    text-red-800    border-red-300    dark:bg-red-900/50    dark:text-red-300',
    high:     'bg-red-100    text-red-700    border-red-200    dark:bg-red-900/30    dark:text-red-400',
    medium:   'bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900/30  dark:text-amber-400',
    low:      'bg-sky-100    text-sky-700    border-sky-200    dark:bg-sky-900/30    dark:text-sky-400',
    info:     'bg-slate-100  text-slate-600  border-slate-200  dark:bg-slate-800     dark:text-slate-400',
  };
  return (
    <Badge variant="outline" className={cn('capitalize text-xs font-medium', styles[severity] ?? '')}>
      {severity}
    </Badge>
  );
}

// ─── Flag status icon ──────────────────────────────────────────────────────────
function FlagStatusIcon({ status }: { status: InvoiceFlag['status'] }) {
  if (status === 'acknowledged') return <Check className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'dismissed')    return <X    className="w-3.5 h-3.5 text-slate-400" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
}

// ─── MetaRow helper ────────────────────────────────────────────────────────────
function MetaRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0 w-36">{label}</span>
      <span className={cn('text-sm text-right text-slate-900 dark:text-slate-100 min-w-0 break-all', mono && 'font-mono text-xs')}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// ─── Flag card ─────────────────────────────────────────────────────────────────
function FlagCard({
  flag,
  onUpdateStatus,
  updating,
}: {
  flag: InvoiceFlag;
  onUpdateStatus: (flagId: string, status: 'acknowledged' | 'dismissed' | 'open') => Promise<void>;
  updating: string | null;
}) {
  const [open, setOpen] = useState(flag.status === 'open');
  const isUpdating = updating === flag.id;

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors duration-200',
        flag.status === 'open'
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20'
          : flag.status === 'dismissed'
          ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 opacity-60'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
      )}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <FlagStatusIcon status={flag.status} />
        <SeverityBadge severity={flag.severity} />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1 min-w-0 truncate">
          {flag.message}
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-inherit pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div>
              <span className="font-medium text-slate-600 dark:text-slate-300">Type: </span>
              {flag.type.replace(/_/g, ' ')}
            </div>
            <div>
              <span className="font-medium text-slate-600 dark:text-slate-300">Created: </span>
              {fmt(flag.created_at)}
            </div>
            {flag.acknowledged_at && (
              <div className="col-span-2">
                <span className="font-medium text-slate-600 dark:text-slate-300">Acknowledged: </span>
                {fmt(flag.acknowledged_at)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {flag.status !== 'acknowledged' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                disabled={isUpdating}
                onClick={() => onUpdateStatus(flag.id, 'acknowledged')}
              >
                <Check className="w-3 h-3" />
                Acknowledge
              </Button>
            )}
            {flag.status !== 'dismissed' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                disabled={isUpdating}
                onClick={() => onUpdateStatus(flag.id, 'dismissed')}
              >
                <X className="w-3 h-3" />
                Dismiss
              </Button>
            )}
            {flag.status !== 'open' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/50"
                disabled={isUpdating}
                onClick={() => onUpdateStatus(flag.id, 'open')}
              >
                <RefreshCw className="w-3 h-3" />
                Reopen
              </Button>
            )}
            {isUpdating && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Review dialog ─────────────────────────────────────────────────────────────
function ReviewDialog({ onSubmit }: { onSubmit: (status: string, note?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('reviewed');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(status, note.trim() || undefined);
      setOpen(false);
      setNote('');
      setStatus('reviewed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 h-9">
          <MessageSquare className="w-4 h-4" />
          Mark as Reviewed
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Review</DialogTitle>
          <DialogDescription>
            Record your review decision for this invoice.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="review-status">Decision</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="review-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="flagged_for_follow_up">Flagged for Follow-up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-note">Note (optional)</Label>
            <Textarea
              id="review-note"
              placeholder="Add context, observations, or follow-up actions..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vendor summary card ────────────────────────────────────────────────────────
function VendorSummaryCard({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useVendorSummary(vendorId);

  if (isLoading) {
    return (
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { vendor, stats, recent_invoices } = data;
  const statusColors: Record<string, string> = {
    active:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    inactive:     'bg-slate-100   text-slate-600   dark:bg-slate-800      dark:text-slate-400',
    under_review: 'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  };

  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            {vendor.name}
          </CardTitle>
          <Badge className={cn('text-xs capitalize', statusColors[vendor.status] ?? '')}>
            {vendor.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        {vendor.category && (
          <CardDescription className="text-xs">{vendor.category}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{stats.total_invoices}</p>
            <p className="text-xs text-slate-500">Total Invoices</p>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20">
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{stats.high_risk_count}</p>
            <p className="text-xs text-slate-500">High Risk</p>
          </div>
        </div>

        {vendor.contact_email && (
          <div className="text-xs text-slate-500">
            <span className="font-medium text-slate-600 dark:text-slate-400">Email: </span>
            <a href={`mailto:${vendor.contact_email}`} className="text-blue-600 hover:underline dark:text-blue-400">
              {vendor.contact_email}
            </a>
          </div>
        )}

        {recent_invoices.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Recent Invoices</p>
            <div className="space-y-1">
              {recent_invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoice/${inv.id}`}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                >
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate group-hover:text-slate-900 dark:group-hover:text-slate-100">
                    {inv.invoice_number ?? 'No number'}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <RiskBadge level={inv.overall_risk} />
                    <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Link href={`/vendors`}>
          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5 mt-1">
            <ExternalLink className="w-3 h-3" />
            View All Vendors
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton screens ───────────────────────────────────────────────────────────
function LeftPanelSkeleton() {
  return (
    <div className="space-y-5">
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex justify-between py-2.5 border-b last:border-0 border-slate-100 dark:border-slate-800">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="pt-5 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function RightPanelSkeleton() {
  return (
    <div className="space-y-5">
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, updateFlag, addReview, getDownloadUrl } = useInvoiceDetail(id ?? null);
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleUpdateFlag(flagId: string, status: 'acknowledged' | 'dismissed' | 'open') {
    setUpdatingFlag(flagId);
    try {
      await updateFlag(flagId, status);
      showToast(`Flag ${status}`, 'success');
    } catch {
      showToast('Failed to update flag', 'error');
    } finally {
      setUpdatingFlag(null);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = await getDownloadUrl();
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Download failed';
      showToast(message, 'error');
    } finally {
      setDownloading(false);
    }
  }

  async function handleReview(status: string, note?: string) {
    await addReview(status as 'reviewed' | 'approved' | 'flagged_for_follow_up', note);
    showToast('Review submitted', 'success');
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertTriangle className="w-12 h-12 text-red-400" />
        <div>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Invoice not found</p>
          <p className="text-sm text-slate-500 mt-1">{error.message}</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/risk-report')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Risk Report
        </Button>
      </div>
    );
  }

  const invoice = data?.invoice;
  const flags = data?.flags ?? [];
  const reviews = data?.reviews ?? [];
  const vendor = data?.vendor;

  const openFlags       = flags.filter((f) => f.status === 'open');
  const resolvedFlags   = flags.filter((f) => f.status !== 'open');
  const latestReview    = reviews[0] ?? null;
  const reviewStatusIcon: Record<string, React.ReactNode> = {
    reviewed:             <CheckCircle className="w-4 h-4 text-blue-500" />,
    approved:             <CheckCircle className="w-4 h-4 text-emerald-500" />,
    flagged_for_follow_up:<Flag className="w-4 h-4 text-amber-500" />,
  };

  return (
    <TooltipProvider>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        {/* Toast */}
        {toast && (
          <div
            className={cn(
              'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all',
              toast.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            )}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 h-8 px-2"
                onClick={() => router.back()}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Link href="/risk-report" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                Risk Report
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-xs">
                {invoice?.invoice_number ?? id}
              </span>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  {isLoading ? (
                    <>
                      <Skeleton className="h-6 w-48 mb-1" />
                      <Skeleton className="h-4 w-32" />
                    </>
                  ) : (
                    <>
                      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                        {invoice?.invoice_number ?? 'Invoice Detail'}
                      </h1>
                      <div className="flex items-center gap-2 mt-0.5">
                        <RiskBadge level={invoice?.overall_risk} />
                        {latestReview && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                {reviewStatusIcon[latestReview.status]}
                                <span className="capitalize">{latestReview.status.replace(/_/g, ' ')}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              Last reviewed {fmt(latestReview.created_at)}
                              {latestReview.note && ` · "${latestReview.note}"`}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!isLoading && (
                <div className="flex items-center gap-2 flex-wrap">
                  <ReviewDialog onSubmit={handleReview} />
                  {invoice?.raw_file_url && (
                    <Button
                      size="sm"
                      className="gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleDownload}
                      disabled={downloading}
                    >
                      {downloading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Download XML
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Summary stats bar */}
          {!isLoading && flags.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{flags.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Total Flags</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{openFlags.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Open</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {flags.filter((f) => f.status === 'acknowledged').length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Acknowledged</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-slate-400">{reviews.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">Reviews</p>
              </div>
            </div>
          )}

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left panel */}
            <div className="lg:col-span-2 space-y-5">
              {isLoading ? (
                <LeftPanelSkeleton />
              ) : (
                <>
                  {/* Invoice metadata */}
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Invoice Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
                      <MetaRow label="Invoice No." value={invoice?.invoice_number} />
                      <MetaRow label="Invoice Date" value={fmt(invoice?.invoice_date ?? null)} />
                      <MetaRow label="Issue Date"   value={fmt(invoice?.issue_date ?? null)} />
                      <MetaRow label="Due Date"     value={fmt(invoice?.due_date ?? null)} />
                      <MetaRow
                        label="Amount"
                        value={
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {fmtCurrency(invoice?.amount ?? null, invoice?.currency ?? 'PLN')}
                          </span>
                        }
                      />
                      {invoice?.tax_amount != null && (
                        <MetaRow
                          label="Tax Amount"
                          value={fmtCurrency(invoice.tax_amount, invoice.currency ?? 'PLN')}
                        />
                      )}
                      <MetaRow label="Currency"     value={invoice?.currency ?? '—'} />
                    </CardContent>
                  </Card>

                  {/* Tax / banking details */}
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Tax & Banking
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
                      <MetaRow label="Seller NIP"   value={invoice?.seller_nip}   mono />
                      <MetaRow label="Buyer NIP"    value={invoice?.buyer_nip}    mono />
                      <MetaRow label="Bank Account" value={invoice?.bank_account} mono />
                    </CardContent>
                  </Card>

                  {/* Actions */}
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Quick Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-2">
                      <ReviewDialog onSubmit={handleReview} />
                      {invoice?.raw_file_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 h-9 text-sm"
                          onClick={handleDownload}
                          disabled={downloading}
                        >
                          {downloading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          Download XML
                        </Button>
                      )}
                      {invoice?.vendor_id && (
                        <Link href={`/vendors`}>
                          <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9 text-sm">
                            <Building2 className="w-4 h-4" />
                            View Vendor Profile
                          </Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>

                  {/* Review history */}
                  {reviews.length > 0 && (
                    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Review History
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-2">
                        {reviews.map((review) => (
                          <div
                            key={review.id}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                {reviewStatusIcon[review.status]}
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 capitalize">
                                  {review.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400">{fmt(review.created_at)}</span>
                            </div>
                            {review.note && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                                "{review.note}"
                              </p>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>

            {/* Right panel */}
            <div className="lg:col-span-3 space-y-5">
              {isLoading ? (
                <RightPanelSkeleton />
              ) : (
                <>
                  {/* Risk flags */}
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Shield className="w-4 h-4 text-slate-500" />
                          Risk Flags
                          {openFlags.length > 0 && (
                            <Badge className="ml-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-xs">
                              {openFlags.length} open
                            </Badge>
                          )}
                        </CardTitle>
                        {flags.length > 0 && (
                          <span className="text-xs text-slate-400">{flags.length} total</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {flags.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
                          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">No risk flags</p>
                          <p className="text-xs mt-1">This invoice passed all automated risk checks.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {openFlags.length > 0 && (
                            <>
                              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                                Open ({openFlags.length})
                              </p>
                              {openFlags.map((flag) => (
                                <FlagCard
                                  key={flag.id}
                                  flag={flag}
                                  onUpdateStatus={handleUpdateFlag}
                                  updating={updatingFlag}
                                />
                              ))}
                            </>
                          )}
                          {resolvedFlags.length > 0 && (
                            <>
                              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-4 mb-2">
                                Resolved ({resolvedFlags.length})
                              </p>
                              {resolvedFlags.map((flag) => (
                                <FlagCard
                                  key={flag.id}
                                  flag={flag}
                                  onUpdateStatus={handleUpdateFlag}
                                  updating={updatingFlag}
                                />
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Vendor summary */}
                  {vendor ? (
                    <VendorSummaryCard vendorId={vendor.id} />
                  ) : invoice?.seller_nip ? (
                    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-500" />
                          Vendor
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-2">
                          <Info className="w-4 h-4 flex-shrink-0" />
                          <span>
                            No vendor profile found for NIP{' '}
                            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                              {invoice.seller_nip}
                            </code>
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {/* Invoice metadata card — upload source info */}
                  {invoice?.upload_session_id && (
                    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Source
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
                        <MetaRow label="Created"       value={fmt(invoice.created_at)} />
                        <MetaRow label="Session ID"    value={invoice.upload_session_id} mono />
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
