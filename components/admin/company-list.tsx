'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Search, Plus, MoveHorizontal as MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, FileText, X, Loader as Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CompanyFormModal } from '@/components/admin/company-form';
import type {
  BuyerCompanyWithInvoiceCount,
  BuyerCompany,
  BuyerCompanyFormValues,
} from '@/app/(admin)/admin/companies/types';
import { deleteBuyerCompany } from '@/app/(admin)/admin/companies/actions';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  rows:          BuyerCompanyWithInvoiceCount[];
  totalCount:    number;
  isOwner:       boolean;
  searchParams:  { q?: string; page?: string };
}

const PAGE_SIZE = 25;

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({
  value, onChange, onClear,
}: { value: string; onChange: (v: string) => void; onClear: () => void }) {
  return (
    <div className="relative flex-1 max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Szukaj nazwy, NIP..."
        className="pl-9 pr-9 h-9 text-sm"
        aria-label="Szukaj kontrahentów"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Wyczyść wyszukiwanie"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Row menu ─────────────────────────────────────────────────────────────────

function RowMenu({
  company, isOwner, onEdit, onDelete,
}: {
  company:   BuyerCompanyWithInvoiceCount;
  isOwner:   boolean;
  onEdit:    (c: BuyerCompanyWithInvoiceCount) => void;
  onDelete:  (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
          aria-label="Akcje"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={`/admin/companies/${company.id}`} className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Szczegóły
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/admin/invoices/new?buyer_company_id=${company.id}`}
            className="flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Nowa faktura
          </Link>
        </DropdownMenuItem>
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(company)} className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edytuj
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(company.id)}
              className="flex items-center gap-2 text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Usuń
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main list ────────────────────────────────────────────────────────────────

export function CompanyList({ rows: initialRows, totalCount, isOwner, searchParams }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const qs          = useSearchParams();

  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(totalCount);
  const [search, setSearch] = useState(searchParams.q ?? '');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; company?: BuyerCompanyWithInvoiceCount } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const pushQuery = useCallback(
    (updates: Record<string, string | undefined>) => {
      const p = new URLSearchParams(qs.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === '') p.delete(k);
        else p.set(k, v);
      }
      router.push(`${pathname}?${p.toString()}`);
    },
    [pathname, qs, router]
  );

  function handleSearchSubmit() {
    pushQuery({ q: search || undefined, page: undefined });
  }

  function handleDelete(id: string) {
    if (!confirm('Czy na pewno chcesz usunąć tego kontrahenta?')) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteBuyerCompany(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      setDeletingId(null);
    });
  }

  function handleCreated(company: BuyerCompany) {
    setModal(null);
    router.refresh();
  }

  function handleUpdated(company: BuyerCompany) {
    setModal(null);
    setRows((prev) => prev.map((r) => (r.id === company.id ? { ...r, ...company } : r)));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          onClear={() => { setSearch(''); pushQuery({ q: undefined, page: undefined }); }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSearchSubmit}
          className="h-9"
        >
          Szukaj
        </Button>
        {isOwner && (
          <Button
            size="sm"
            onClick={() => setModal({ mode: 'create' })}
            className="ml-auto h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" />
            Dodaj kontrahenta
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Building2 className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Brak kontrahentów</p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? 'Zmień kryteria wyszukiwania.' : 'Dodaj pierwszego kontrahenta, aby zacząć.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lista kontrahentów">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nazwa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">NIP</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Miasto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">VAT</th>
                  <th className="px-4 py-3 w-12" aria-label="Akcje" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((company) => (
                  <tr
                    key={company.id}
                    className={cn(
                      'group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                      deletingId === company.id && 'opacity-50 pointer-events-none'
                    )}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/companies/${company.id}`}
                        className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell tabular-nums">
                      {company.nip ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                      {company.city ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                      {company.email ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {company.vat_payer
                        ? <Badge variant="secondary" className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">VAT</Badge>
                        : <Badge variant="secondary" className="text-[10px] font-medium bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400">ZW</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu
                        company={company}
                        isOwner={isOwner}
                        onEdit={(c) => setModal({ mode: 'edit', company: c })}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-400 text-xs">
            Pokazuję {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} z {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => pushQuery({ page: String(page - 1) })}
              className="h-8 w-8 p-0"
              aria-label="Poprzednia strona"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="flex items-center px-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => pushQuery({ page: String(page + 1) })}
              className="h-8 w-8 p-0"
              aria-label="Następna strona"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {modal?.mode === 'create' && (
        <CompanyFormModal
          mode="create"
          onSuccess={handleCreated}
          onClose={() => setModal(null)}
        />
      )}

      {/* Edit modal */}
      {modal?.mode === 'edit' && modal.company && (
        <CompanyFormModal
          mode="edit"
          companyId={modal.company.id}
          defaultValues={modal.company}
          onSuccess={handleUpdated}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
