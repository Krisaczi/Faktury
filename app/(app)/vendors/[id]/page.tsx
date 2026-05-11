'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Building2, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Download, CreditCard as Edit, ExternalLink, FileText, GitMerge, Info, Mail, Phone, RefreshCw, Search, Shield, TrendingUp, X, Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  useVendor,
  useVendorInvoices,
  useVendorTrend,
  useExportVendorCsv,
  type VendorFull,
  type VendorInvoiceRow,
  type VendorInvoiceFilters,
} from '@/hooks/use-vendors';

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(date: string | null | undefined) {
  if (!date) return '—';
  try { return format(parseISO(date), 'MMM d, yyyy'); } catch { return date; }
}

function fmtCurrency(amount: number | null | undefined, currency = 'PLN') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

// ─── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string | null | undefined }) {
  if (!level) return <Badge variant="outline" className="text-slate-400 border-slate-200 dark:border-slate-700 text-xs">—</Badge>;
  const s: Record<string, string> = {
    critical: 'bg-red-200 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300',
    high:     'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
    medium:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    low:      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
  return <Badge variant="outline" className={cn('capitalize font-semibold text-xs', s[level] ?? '')}>{level}</Badge>;
}

function VendorStatusBadge({ status }: { status: VendorFull['status'] }) {
  const s: Record<string, string> = {
    active:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    inactive:     'bg-slate-100   text-slate-600   dark:bg-slate-800      dark:text-slate-400',
    under_review: 'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-400',
  };
  return <Badge className={cn('capitalize text-xs', s[status] ?? '')}>{status.replace(/_/g, ' ')}</Badge>;
}

// ─── Risk score display ────────────────────────────────────────────────────────
function RiskScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-400 text-sm">—</span>;
  const color = score >= 70 ? 'text-red-600 dark:text-red-400' : score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  return <span className={cn('font-bold text-lg', color)}>{score}</span>;
}

// ─── Sort header ───────────────────────────────────────────────────────────────
function SortHeader({ label, field, current, dir, onSort }: { label: string; field: string; current: string; dir: string; onSort: (f: string) => void }) {
  const active = current === field;
  return (
    <button className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors group" onClick={() => onSort(field)}>
      {label}
      {active ? dir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5 opacity-30 group-hover:opacity-60" />}
    </button>
  );
}

// ─── Mobile invoice row ─────────────────────────────────────────────────────────
function MobileInvoiceRow({ row }: { row: VendorInvoiceRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button className="w-full flex items-center justify-between py-3 px-4 text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{row.invoice_number ?? 'No number'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{fmt(row.issue_date)} · {fmtCurrency(row.amount, row.currency)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RiskBadge level={row.overall_risk} />
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Due date</span>
            <span>{fmt(row.due_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Open flags</span>
            <span className={row.open_flag_count > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>
              {row.open_flag_count > 0 ? `${row.open_flag_count} open` : '—'}
            </span>
          </div>
          <Link href={`/invoice/${row.id}`} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-xs mt-1">
            <ExternalLink className="w-3 h-3" />
            View details
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Edit vendor dialog ─────────────────────────────────────────────────────────
function EditVendorDialog({
  vendor,
  onSave,
}: {
  vendor: VendorFull;
  onSave: (updates: Partial<VendorFull>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name:          vendor.name ?? '',
    category:      vendor.category ?? '',
    contact_email: vendor.contact_email ?? '',
    status:        vendor.status,
    nip:           vendor.nip ?? '',
    notes:         vendor.notes ?? '',
  });

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name:          form.name || undefined,
        category:      form.category || null,
        contact_email: form.contact_email || null,
        status:        form.status,
        nip:           form.nip || null,
        notes:         form.notes || null,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Edit className="w-4 h-4" />
          Edit Vendor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Vendor</DialogTitle>
          <DialogDescription>Update vendor details. Changes are recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label>Vendor Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>NIP</Label>
            <Input value={form.nip} onChange={(e) => setForm((f) => ({ ...f, nip: e.target.value }))} placeholder="Tax ID" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Email</Label>
            <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as VendorFull['status'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Internal notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Merge vendor dialog ────────────────────────────────────────────────────────
function MergeVendorDialog({ onMerge }: { onMerge: (sourceId: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [merging, setMerging] = useState(false);

  async function handleMerge() {
    if (!sourceId.trim()) return;
    setMerging(true);
    try {
      await onMerge(sourceId.trim());
      setOpen(false);
      setSourceId('');
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9 text-slate-600 dark:text-slate-400">
          <GitMerge className="w-4 h-4" />
          Merge Vendor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Vendor</DialogTitle>
          <DialogDescription>
            Move all invoices from another vendor into this one. The source vendor will keep its record but have no invoices. Requires admin role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Source Vendor ID</Label>
            <Input
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder="Paste the vendor UUID to merge from"
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-500">All invoices from this vendor will be reassigned to the current vendor.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-3 flex gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            This action is recorded in the audit log and cannot be undone automatically.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleMerge}
            disabled={merging || !sourceId.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {merging ? 'Merging...' : 'Confirm Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skeleton loaders ──────────────────────────────────────────────────────────
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="border-slate-200 dark:border-slate-700">
          <CardContent className="pt-4 pb-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-7 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function VendorProfilePage() {
  const { id: vendorId } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, error, isLoading, updateVendorProfile, mergeVendor } = useVendor(vendorId ?? null);

  // Invoice filters
  const [invoiceFilters, setInvoiceFilters] = useState<VendorInvoiceFilters>({
    page: 1,
    pageSize: 20,
    sortBy: 'issue_date',
    sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');
  const [riskInput, setRiskInput] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setInvoiceFilters((f) => ({ ...f, search: val || undefined, page: 1 }));
    }, 350);
  }, []);

  // Trend granularity
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('week');
  const [trendChartOpen, setTrendChartOpen] = useState(true);

  const { data: invoicesData, isLoading: invoicesLoading } = useVendorInvoices(vendorId ?? null, invoiceFilters);
  const { data: trendData, isLoading: trendLoading } = useVendorTrend(vendorId ?? null, undefined, undefined, granularity);
  const { exportCsv } = useExportVendorCsv(vendorId ?? null);

  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportCsv({ riskLevel: invoiceFilters.riskLevel, search: invoiceFilters.search });
      showToast('Export started', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleUpdateVendor(updates: Partial<VendorFull>) {
    await updateVendorProfile(updates);
    showToast('Vendor updated', 'success');
  }

  async function handleMerge(sourceId: string) {
    await mergeVendor(sourceId);
    showToast('Vendors merged successfully', 'success');
  }

  function handleSort(field: string) {
    setInvoiceFilters((f) => ({
      ...f,
      sortBy: field as 'issue_date' | 'amount',
      sortDir: f.sortBy === field && f.sortDir === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  }

  const totalPages = invoicesData ? Math.ceil(invoicesData.totalCount / (invoiceFilters.pageSize ?? 20)) : 0;
  const vendor = data?.vendor;
  const stats  = data?.stats;
  const lastActivity = data?.last_activity;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <Building2 className="w-12 h-12 text-slate-300" />
        <div>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Vendor not found</p>
          <p className="text-sm text-slate-500 mt-1">{error.message}</p>
        </div>
        <Button variant="outline" onClick={() => router.push('/vendors')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Vendors
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        {/* Toast */}
        {toast && (
          <div className={cn(
            'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium',
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          )}>
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
                onClick={() => router.push('/vendors')}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Link href="/vendors" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                Vendors
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-xs">
                {vendor?.name ?? vendorId}
              </span>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  {isLoading ? (
                    <>
                      <Skeleton className="h-7 w-48 mb-1.5" />
                      <Skeleton className="h-4 w-32" />
                    </>
                  ) : (
                    <>
                      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                        {vendor?.name ?? 'Vendor Profile'}
                      </h1>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {vendor && <VendorStatusBadge status={vendor.status} />}
                        {vendor?.category && (
                          <span className="text-xs text-slate-500">{vendor.category}</span>
                        )}
                        {vendor?.nip && (
                          <span className="text-xs font-mono text-slate-400">NIP: {vendor.nip}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!isLoading && vendor && (
                <div className="flex items-center gap-2 flex-wrap">
                  {vendor.contact_email && (
                    <a href={`mailto:${vendor.contact_email}`}>
                      <Button variant="outline" size="sm" className="gap-2 h-9">
                        <Mail className="w-4 h-4" />
                        Message
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9"
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export CSV
                  </Button>
                  <EditVendorDialog vendor={vendor} onSave={handleUpdateVendor} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* Stats row */}
          {isLoading ? (
            <StatsSkeleton />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Invoices',
                  value: stats?.total_invoices ?? 0,
                  sub: lastActivity?.last_invoice_date ? `Last: ${fmt(lastActivity.last_invoice_date)}` : undefined,
                  color: 'text-slate-900 dark:text-white',
                  bg: 'bg-slate-50 dark:bg-slate-800/50',
                  icon: <FileText className="w-4 h-4 text-slate-400" />,
                },
                {
                  label: 'Avg Invoice',
                  value: fmtCurrency(stats?.avg_amount ?? null),
                  sub: `Total: ${fmtCurrency(stats?.total_amount ?? null)}`,
                  color: 'text-blue-700 dark:text-blue-400',
                  bg: 'bg-blue-50 dark:bg-blue-900/20',
                  icon: <TrendingUp className="w-4 h-4 text-blue-400" />,
                },
                {
                  label: 'High Risk',
                  value: stats?.high_risk_count ?? 0,
                  sub: `${stats?.flagged_count ?? 0} flagged`,
                  color: (stats?.high_risk_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                  bg: (stats?.high_risk_count ?? 0) > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
                  icon: <Shield className="w-4 h-4 text-red-400" />,
                },
                {
                  label: 'Open Flags',
                  value: stats?.open_flags_count ?? 0,
                  sub: 'Across all invoices',
                  color: (stats?.open_flags_count ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500',
                  bg: (stats?.open_flags_count ?? 0) > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-800/50',
                  icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
                },
              ].map(({ label, value, sub, color, bg, icon }) => (
                <Card key={label} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', bg)}>{icon}</div>
                    </div>
                    <p className={cn('text-xl font-bold', color)}>{value}</p>
                    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Two-column main content */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left column — vendor details */}
            <div className="lg:col-span-2 space-y-5">
              {isLoading ? (
                <Card className="border-slate-200 dark:border-slate-700">
                  <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
                  <CardContent className="space-y-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-32" /></div>
                    ))}
                  </CardContent>
                </Card>
              ) : vendor ? (
                <>
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Vendor Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[
                        { label: 'Name',         value: vendor.name },
                        { label: 'NIP',          value: vendor.nip,            mono: true },
                        { label: 'Category',     value: vendor.category },
                        { label: 'Contact',      value: vendor.contact_email ? (
                          <a href={`mailto:${vendor.contact_email}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                            <Mail className="w-3 h-3" />{vendor.contact_email}
                          </a>
                        ) : null },
                        { label: 'Risk Score',   value: <RiskScoreBadge score={vendor.risk_score} /> },
                        { label: 'Member Since', value: fmt(vendor.created_at) },
                      ].map(({ label, value, mono }) => (
                        <div key={label} className="flex items-start justify-between gap-4 py-2.5">
                          <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0 w-28">{label}</span>
                          <span className={cn('text-sm text-right text-slate-900 dark:text-slate-100 min-w-0 break-all', mono && 'font-mono text-xs')}>
                            {value ?? <span className="text-slate-400">—</span>}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Bank accounts */}
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Bank Accounts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(vendor.bank_accounts ?? []).length === 0 ? (
                        <p className="text-sm text-slate-400 py-1">No bank accounts on file</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(vendor.bank_accounts ?? []).map((acc, i) => (
                            <div key={i} className="font-mono text-xs bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-2 text-slate-700 dark:text-slate-300">
                              {acc}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  {vendor.notes && (
                    <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <CardHeader className="pb-1">
                        <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{vendor.notes}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Actions */}
                  <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-2">
                      <EditVendorDialog vendor={vendor} onSave={handleUpdateVendor} />
                      <MergeVendorDialog onMerge={handleMerge} />
                      {vendor.contact_email && (
                        <a href={`mailto:${vendor.contact_email}`} className="block">
                          <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-9 text-sm">
                            <Mail className="w-4 h-4" />
                            Email Vendor
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 h-9 text-sm"
                        onClick={handleExport}
                        disabled={exporting}
                      >
                        {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Export Invoices CSV
                      </Button>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>

            {/* Right column */}
            <div className="lg:col-span-3 space-y-5">
              {/* Risk Trend Chart */}
              <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-slate-500" />
                        Risk Trend
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">Invoices vs flagged over time</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
                        <SelectTrigger className="w-24 h-7 text-xs border-slate-200 dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Daily</SelectItem>
                          <SelectItem value="week">Weekly</SelectItem>
                          <SelectItem value="month">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors md:hidden"
                        onClick={() => setTrendChartOpen((v) => !v)}
                      >
                        {trendChartOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <div className={cn('transition-all', !trendChartOpen && 'hidden md:block')}>
                  <CardContent>
                    {trendLoading ? (
                      <div className="h-48 flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                      </div>
                    ) : !trendData?.series.length ? (
                      <div className="h-48 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <TrendingUp className="w-8 h-8 text-slate-200" />
                        <p className="text-sm">No trend data yet</p>
                        <p className="text-xs">Upload invoices for this vendor to see risk trends.</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={trendData.series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradFlagged" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradHighRisk" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.15)" vertical={false} />
                          <XAxis
                            dataKey="period"
                            tick={{ fontSize: 10, fill: 'rgb(148 163 184)' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: string) => {
                              try { return format(parseISO(v), granularity === 'month' ? 'MMM yy' : 'MMM d'); } catch { return v; }
                            }}
                          />
                          <YAxis tick={{ fontSize: 10, fill: 'rgb(148 163 184)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <RechartsTooltip
                            contentStyle={{ background: 'rgb(15 23 42)', border: '1px solid rgb(51 65 85)', borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: 'rgb(148 163 184)', marginBottom: 4 }}
                            itemStyle={{ color: 'rgb(226 232 240)' }}
                          />
                          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                          <Area type="monotone" dataKey="total"     name="Total"     stroke="#3b82f6" strokeWidth={2} fill="url(#gradTotal)"    dot={false} />
                          <Area type="monotone" dataKey="flagged"   name="Flagged"   stroke="#f59e0b" strokeWidth={2} fill="url(#gradFlagged)"  dot={false} />
                          <Area type="monotone" dataKey="high_risk" name="High Risk" stroke="#ef4444" strokeWidth={2} fill="url(#gradHighRisk)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </div>
              </Card>

              {/* Invoice table */}
              <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500" />
                      Invoices
                      {invoicesData && (
                        <span className="text-xs font-normal text-slate-400">({invoicesData.totalCount})</span>
                      )}
                    </CardTitle>
                  </div>

                  {/* Inline filters */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <div className="relative flex-1 min-w-40">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search invoice #..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {searchInput && (
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => handleSearch('')}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <Select value={riskInput} onValueChange={(v) => { setRiskInput(v); setInvoiceFilters((f) => ({ ...f, riskLevel: v || undefined, page: 1 })); }}>
                      <SelectTrigger className="w-32 h-8 text-sm border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="All risk" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All risk</SelectItem>
                        {['critical', 'high', 'medium', 'low'].map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>

                <Separator />

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        {[
                          { label: 'Invoice #', field: null,        w: 'w-36' },
                          { label: 'Risk',       field: null,        w: 'w-24' },
                          { label: 'Issue Date', field: 'issue_date',w: 'w-28' },
                          { label: 'Amount',     field: 'amount',    w: 'w-28 text-right' },
                          { label: 'Flags',      field: null,        w: 'w-20 text-center' },
                          { label: 'Actions',    field: null,        w: 'w-16 text-center' },
                        ].map(({ label, field, w }) => (
                          <th key={label} className={cn('px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider', w)}>
                            {field ? (
                              <SortHeader label={label} field={field} current={invoiceFilters.sortBy ?? 'issue_date'} dir={invoiceFilters.sortDir ?? 'desc'} onSort={handleSort} />
                            ) : label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoicesLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50">
                            {Array.from({ length: 6 }).map((__, j) => (
                              <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                            ))}
                          </tr>
                        ))
                      ) : !invoicesData?.rows.length ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-400">
                              <FileText className="w-8 h-8 text-slate-200" />
                              <p className="text-sm">No invoices found</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        invoicesData.rows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300 max-w-0 truncate">
                              {row.invoice_number ?? <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3"><RiskBadge level={row.overall_risk} /></td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums">{row.issue_date ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                              {fmtCurrency(row.amount, row.currency)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {row.flag_count > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 cursor-default">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                      <span className={cn('text-sm font-medium', row.open_flag_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400')}>
                                        {row.flag_count}
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs p-2 space-y-1">
                                    {row.flags.slice(0, 4).map((f, i) => (
                                      <div key={i} className="text-xs flex gap-1.5">
                                        <span className="font-semibold capitalize text-amber-400">{f.severity}</span>
                                        <span className="text-slate-300">{f.message}</span>
                                      </div>
                                    ))}
                                    {row.flags.length > 4 && <p className="text-xs text-slate-400">+{row.flags.length - 4} more</p>}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-slate-300 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link href={`/invoice/${row.id}`} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent>View invoice</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile rows */}
                <div className="md:hidden">
                  {invoicesLoading ? (
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="space-y-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                      ))}
                    </div>
                  ) : !invoicesData?.rows.length ? (
                    <div className="py-10 text-center text-slate-400 text-sm">No invoices found</div>
                  ) : (
                    invoicesData.rows.map((row) => <MobileInvoiceRow key={row.id} row={row} />)
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        disabled={(invoiceFilters.page ?? 1) <= 1}
                        onClick={() => setInvoiceFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      </Button>
                      {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                        const page = i + 1;
                        const active = page === (invoiceFilters.page ?? 1);
                        return (
                          <Button
                            key={page}
                            size="sm"
                            variant={active ? 'default' : 'outline'}
                            className={cn('h-7 w-7 p-0 text-xs', active && 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600')}
                            onClick={() => setInvoiceFilters((f) => ({ ...f, page }))}
                          >
                            {page}
                          </Button>
                        );
                      })}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        disabled={(invoiceFilters.page ?? 1) >= totalPages}
                        onClick={() => setInvoiceFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }))}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <span className="text-xs text-slate-400">
                      Page {invoiceFilters.page ?? 1} of {totalPages}
                    </span>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
