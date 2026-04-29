'use client';

import { useState } from 'react';
import { Plus, Search, Building2, RefreshCw } from 'lucide-react';
import { useVendors } from '@/hooks/use-vendors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const statusConfig = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  inactive: { label: 'Inactive', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  blocked: { label: 'Blocked', className: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function RiskBadge({ score }: { score: number }) {
  const color =
    score < 30
      ? 'text-emerald-600'
      : score < 60
      ? 'text-amber-600'
      : 'text-rose-600';
  const bg =
    score < 30
      ? 'bg-emerald-50'
      : score < 60
      ? 'bg-amber-50'
      : 'bg-rose-50';

  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex h-6 w-10 items-center justify-center rounded text-xs font-bold', bg, color)}>
        {score}
      </div>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', score < 30 ? 'bg-emerald-500' : score < 60 ? 'bg-amber-500' : 'bg-rose-500')}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function VendorTable() {
  const { data: vendors, isLoading, error, mutate } = useVendors();
  const [search, setSearch] = useState('');

  const filtered = (vendors ?? []).filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.tax_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (v.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => mutate()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor Name</TableHead>
              <TableHead>NIP / Tax ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk Score</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  Failed to load vendors. Please try again.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {search ? 'No matching vendors' : 'No vendors yet'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((vendor) => {
                const status = statusConfig[vendor.status];
                return (
                  <TableRow key={vendor.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{vendor.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {vendor.tax_id || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {vendor.email || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', status.className)}
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RiskBadge score={vendor.risk_score} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(vendor.created_at).toLocaleDateString('pl-PL')}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {vendors?.length ?? 0} vendors
        </p>
      )}
    </div>
  );
}
