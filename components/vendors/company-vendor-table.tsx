'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, RefreshCw, CreditCard } from 'lucide-react';
import { useCompanyVendors } from '@/hooks/use-company-vendors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/providers/i18n-provider';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(amount);

export function CompanyVendorTable() {
  const router = useRouter();
  const { data: vendors, isLoading, error, mutate } = useCompanyVendors();
  const [search, setSearch] = useState('');
  const t = useT();

  const filtered = (vendors ?? []).filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.nip.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.vendors.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => mutate()}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.vendors.colVendorName}</TableHead>
              <TableHead>{t.vendors.colNip}</TableHead>
              <TableHead>{t.vendors.colBankAccounts}</TableHead>
              <TableHead className="text-right">{t.vendors.colAvgInvoice}</TableHead>
              <TableHead>{t.vendors.colAdded}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  {t.vendors.failedToLoad}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {search ? t.vendors.noMatching : t.vendors.noVendors}
                    </p>
                    {!search && (
                      <p className="text-xs text-muted-foreground">
                        {t.vendors.noVendorsHint}
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((vendor) => (
                <TableRow
                  key={vendor.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => router.push(`/vendors/${vendor.id}`)}
                >
                  <TableCell className="font-medium">{vendor.name || '—'}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {vendor.nip || '—'}
                  </TableCell>
                  <TableCell>
                    {vendor.bank_accounts?.length > 0 ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span>{t.vendors.accounts(vendor.bank_accounts.length)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">{t.vendors.noAccounts}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {vendor.avg_amount > 0 ? formatCurrency(vendor.avg_amount) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(vendor.created_at).toLocaleDateString('pl-PL', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.vendors.showing(filtered.length, vendors?.length ?? 0)}
        </p>
      )}
    </div>
  );
}
