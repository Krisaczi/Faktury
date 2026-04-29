'use client';

import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { VendorInvoice } from '@/hooks/use-vendor-profile';

interface Props {
  invoices: VendorInvoice[];
  currency: string;
}

const riskConfig: Record<string, { label: string; className: string }> = {
  high: { label: 'High', className: 'bg-rose-100 text-rose-700 border-rose-200' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: 'Low', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

function getRisk(r: string) {
  return riskConfig[r?.toLowerCase()] ?? { label: r || 'Low', className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: currency || 'PLN' }).format(amount);

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function VendorInvoicesTable({ invoices, currency }: Props) {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Invoices</h3>
        <span className="ml-auto text-xs text-muted-foreground">{invoices.length} total</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Issue Date</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>KSeF Ref</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No invoices for this vendor</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((inv) => {
              const risk = getRisk(inv.overall_risk);
              return (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => router.push(`/invoices/${inv.id}`)}
                >
                  <TableCell className="font-medium">{inv.invoice_number || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.issue_date)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(inv.amount, currency)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[140px] truncate">
                    {inv.ksef_reference || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', risk.className)}>
                      {risk.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
