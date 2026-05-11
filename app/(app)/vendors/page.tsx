'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useVendors } from '@/hooks/use-vendors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2,
  Plus,
  Search,
  MoveHorizontal as MoreHorizontal,
  Trash2,
  Pencil,
  ExternalLink,
  TriangleAlert as AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StateCard } from '@/components/ui/state-card';
import { SkeletonList } from '@/components/ui/skeleton-loaders';
import { InlineLoader } from '@/components/ui/skeleton-loaders';
import { PageHeader, Stack, Grid, HStack } from '@/components/ui/layout-primitives';

const statusColors: Record<string, string> = {
  active:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  inactive:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const riskColor = (score: number | null) => {
  if (score === null) return 'text-slate-400';
  if (score >= 70)    return 'text-red-600 dark:text-red-400';
  if (score >= 40)    return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
};

interface VendorForm {
  name:          string;
  category:      string;
  contact_email: string;
  status:        'active' | 'inactive' | 'under_review';
  risk_score:    string;
}

const defaultForm: VendorForm = {
  name: '', category: '', contact_email: '', status: 'active', risk_score: '',
};

export default function VendorsPage() {
  const { vendors, isLoading, error, addVendor, deleteVendor, refresh } = useVendors();
  const [search,     setSearch]     = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form,       setForm]       = useState<VendorForm>(defaultForm);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  const filtered = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Vendor name is required'); return; }
    setSaving(true);
    try {
      await addVendor({
        name:          form.name.trim(),
        category:      form.category      || null,
        contact_email: form.contact_email || null,
        status:        form.status,
        risk_score:    form.risk_score ? parseFloat(form.risk_score) : null,
      });
      setDialogOpen(false);
      setForm(defaultForm);
    } catch {
      setFormError('Failed to add vendor. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="6" className="max-w-5xl">
      <PageHeader
        title="Vendors"
        description="Manage your third-party vendor relationships and risk profiles."
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => { setForm(defaultForm); setFormError(''); }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Vendor</DialogTitle>
              <DialogDescription>
                Enter details about your new vendor relationship.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {formError && (
                <div role="alert" className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {formError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Vendor name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Acme Corporation"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Software"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="risk_score">Risk score (0–100)</Label>
                  <Input
                    id="risk_score"
                    type="number"
                    min="0"
                    max="100"
                    value={form.risk_score}
                    onChange={(e) => setForm({ ...form, risk_score: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="contact@vendor.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as VendorForm['status'] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                  {saving ? (
                    <><InlineLoader size="sm" className="mr-2 text-white" />Adding…</>
                  ) : 'Add Vendor'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Error banner */}
      {error && !isLoading && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">
            Failed to load vendors.
          </p>
          <Button
            size="sm" variant="ghost"
            onClick={() => refresh()}
            className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 h-7 px-2"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Retry
          </Button>
        </div>
      )}

      {/* Stats */}
      {!isLoading && vendors.length > 0 && (
        <Grid cols={{ base: 3 }} gap="3">
          {[
            { label: 'Total',        value: vendors.length,                                        color: 'text-slate-900 dark:text-white' },
            { label: 'Active',       value: vendors.filter((v) => v.status === 'active').length,       color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Under Review', value: vendors.filter((v) => v.status === 'under_review').length, color: 'text-amber-600 dark:text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className={cn('text-2xl font-bold tabular', color)}>{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
            </div>
          ))}
        </Grid>
      )}

      {/* Search */}
      {!isLoading && vendors.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search vendors by name or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search vendors"
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonList rows={4} hasIcon />
      ) : error ? (
        <StateCard
          variant="error"
          title="Could not load vendors"
          description="There was a problem fetching your vendor list."
          primaryAction={{ label: 'Retry', onClick: () => refresh(), icon: RefreshCw, variant: 'default' }}
        />
      ) : filtered.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-0">
            <StateCard
              variant="empty"
              icon={Building2}
              title={vendors.length === 0 ? 'No vendors yet' : 'No matching vendors'}
              description={
                vendors.length === 0
                  ? 'Add your first vendor to start tracking risk and activity.'
                  : 'Try a different search term.'
              }
              primaryAction={vendors.length === 0
                ? { label: 'Add first vendor', onClick: () => setDialogOpen(true), icon: Plus, variant: 'default' }
                : undefined}
              secondaryAction={search
                ? { label: 'Clear search', onClick: () => setSearch('') }
                : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 animate-fade-in" role="list" aria-label="Vendor list">
          {filtered.map((vendor) => (
            <div
              key={vendor.id}
              role="listitem"
              className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-150 group"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>

              <div className="flex-1 min-w-0">
                <Link
                  href={`/vendors/${vendor.id}`}
                  className="font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block"
                >
                  {vendor.name}
                </Link>
                <HStack gap="2" className="mt-0.5 flex-wrap">
                  {vendor.category && (
                    <span className="text-xs text-slate-400">{vendor.category}</span>
                  )}
                  {vendor.contact_email && (
                    <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[12rem]">
                      {vendor.contact_email}
                    </span>
                  )}
                </HStack>
              </div>

              <HStack gap="3" className="flex-shrink-0">
                {vendor.risk_score !== null && (
                  <div className="text-right hidden sm:block">
                    <p className={cn('text-sm font-bold tabular', riskColor(vendor.risk_score))}>
                      {vendor.risk_score}
                    </p>
                    <p className="text-xs text-slate-400">risk</p>
                  </div>
                )}
                <Badge className={cn('text-xs capitalize', statusColors[vendor.status])}>
                  {vendor.status.replace('_', ' ')}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label={`Actions for ${vendor.name}`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/vendors/${vendor.id}`} className="flex items-center gap-2 cursor-pointer">
                        <ExternalLink className="w-4 h-4" />
                        View Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2">
                      <Pencil className="w-4 h-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 text-red-600 focus:text-red-600 dark:text-red-400"
                      onClick={() => deleteVendor(vendor.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </HStack>
            </div>
          ))}
        </div>
      )}
    </Stack>
  );
}
