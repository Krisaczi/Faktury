'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/providers/i18n-provider';

export interface InvoiceFilters {
  search: string;
  vendor: string;
  risk: string;
  dateFrom: string;
  dateTo: string;
}

interface InvoiceFiltersBarProps {
  filters: InvoiceFilters;
  vendors: string[];
  onChange: (filters: InvoiceFilters) => void;
}

export function InvoiceFiltersBar({ filters, vendors, onChange }: InvoiceFiltersBarProps) {
  const t = useT();

  const RISK_OPTIONS = [
    { value: 'all', label: t.invoices.filterAllRisk },
    { value: 'high', label: t.invoices.filterHighRisk },
    { value: 'medium', label: t.invoices.filterMediumRisk },
    { value: 'low', label: t.invoices.filterLowRisk },
    { value: 'none', label: t.invoices.filterNoRisk },
  ];

  const hasActiveFilters =
    filters.search ||
    (filters.vendor && filters.vendor !== 'all') ||
    (filters.risk && filters.risk !== 'all') ||
    filters.dateFrom ||
    filters.dateTo;

  const reset = () =>
    onChange({ search: '', vendor: 'all', risk: 'all', dateFrom: '', dateTo: '' });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t.invoices.filterSearch}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <Select
        value={filters.vendor || 'all'}
        onValueChange={(v) => onChange({ ...filters, vendor: v })}
      >
        <SelectTrigger className="h-9 w-[180px] text-sm">
          <SelectValue placeholder={t.invoices.filterAllVendors} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t.invoices.filterAllVendors}</SelectItem>
          {vendors.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.risk || 'all'}
        onValueChange={(v) => onChange({ ...filters, risk: v })}
      >
        <SelectTrigger className="h-9 w-[160px] text-sm">
          <SelectValue placeholder={t.invoices.filterAllRisk} />
        </SelectTrigger>
        <SelectContent>
          {RISK_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          className="h-9 w-[140px] text-sm"
          title="From date"
        />
        <span className="text-muted-foreground text-xs">{t.common.to}</span>
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          className="h-9 w-[140px] text-sm"
          title="To date"
        />
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          {t.common.clear}
        </Button>
      )}
    </div>
  );
}
