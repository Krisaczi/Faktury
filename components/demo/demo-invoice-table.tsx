'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/providers/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface DemoInvoice {
  invoiceNumber: string;
  vendor: string;
  amount: number;
  issueDate: string;
  risk: string;
  flags: string[];
}

interface DemoInvoiceTableProps {
  invoices: DemoInvoice[];
}


const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pl-PL');

export function DemoInvoiceTable({ invoices }: DemoInvoiceTableProps) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');

  const riskConfig: Record<string, { label: string; className: string }> = {
    high: { label: t.invoices.riskLabels.high, className: 'bg-rose-100 text-rose-700 border-rose-200' },
    medium: { label: t.invoices.riskLabels.medium, className: 'bg-amber-100 text-amber-700 border-amber-200' },
    low: { label: t.invoices.riskLabels.low, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  };

  const vendors = useMemo(() => {
    return Array.from(new Set(invoices.map((inv) => inv.vendor))).sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !inv.invoiceNumber.toLowerCase().includes(q) &&
          !inv.vendor.toLowerCase().includes(q) &&
          !inv.flags.some((f) => f.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      if (riskFilter !== 'all' && inv.risk !== riskFilter) return false;
      return true;
    });
  }, [invoices, search, riskFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.invoices.filterSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="Risk level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.invoices.filterAllRisk}</SelectItem>
            <SelectItem value="high">{t.invoices.filterHighRisk}</SelectItem>
            <SelectItem value="medium">{t.invoices.filterMediumRisk}</SelectItem>
            <SelectItem value="low">{t.invoices.filterLowRisk}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[110px]">{t.invoices.tableRisk}</TableHead>
              <TableHead>{t.invoices.tableInvoiceNo}</TableHead>
              <TableHead>{t.invoices.tableVendor}</TableHead>
              <TableHead className="text-right">{t.invoices.tableAmount}</TableHead>
              <TableHead>{t.invoices.tableIssueDate}</TableHead>
              <TableHead>Flagi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-muted-foreground text-sm">
                  {t.invoices.noInvoicesFilter}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice, idx) => {
                const risk = riskConfig[invoice.risk] ?? riskConfig['low'];
                return (
                  <TableRow
                    key={invoice.invoiceNumber}
                    className={cn(
                      'transition-colors',
                      idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                    )}
                  >
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs font-medium', risk.className)}>
                        {risk.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                      {invoice.vendor}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm tabular-nums">
                      {formatCurrency(invoice.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(invoice.issueDate)}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {invoice.flags.length === 0 ? (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {invoice.flags.join(', ')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.invoices.showing(filtered.length, invoices.length)}
        </p>
      )}
    </div>
  );
}
