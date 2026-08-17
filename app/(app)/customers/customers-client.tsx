'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Plus, Building2, Pencil, Trash2, FileText, Loader as Loader2, Check, User, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface Customer {
  id:            string;
  name:          string;
  nip:           string | null;
  street:        string | null;
  postal_code:   string | null;
  city:          string | null;
  country:       string;
  email:         string | null;
  phone:         string | null;
  billing_email: string | null;
  last_used_at:  string | null;
  created_at:    string;
}

interface Pagination {
  page:    number;
  limit:   number;
  total:   number;
  hasNext: boolean;
  hasPrev: boolean;
}

type SortKey = 'recent' | 'name' | 'createdAt';

const PAGE_SIZES = [10, 20, 50];

export function CustomersClient() {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(20);
  const [sort, setSort]             = useState<SortKey>('recent');

  const [showAddModal, setShowAddModal]         = useState(false);
  const [editingCustomer, setEditingCustomer]   = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting]             = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef   = useRef('');

  const fetchCustomers = useCallback(async (query: string, p: number, size: number, s: SortKey) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      params.set('page',  String(p));
      params.set('limit', String(size));
      params.set('sort',  s);

      const res = await fetch(`/api/customers?${params.toString()}`);
      if (!res.ok) { setCustomers([]); setPagination(null); return; }
      const data = await res.json() as { customers: Customer[]; pagination: Pagination };
      setCustomers(data.customers ?? []);
      setPagination(data.pagination ?? null);
    } catch {
      setCustomers([]); setPagination(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchCustomers('', 1, pageSize, 'recent');
  }, [fetchCustomers, pageSize]);

  // Debounced search
  const onSearchChange = useCallback((val: string) => {
    setSearch(val);
    searchRef.current = val;
    setPage(1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCustomers(searchRef.current, 1, pageSize, sort);
    }, 250);
  }, [fetchCustomers, pageSize, sort]);

  // Refetch on page/pageSize/sort changes
  useEffect(() => {
    fetchCustomers(search, page, pageSize, sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sort]);

  const handleSortChange = (newSort: SortKey) => {
    setSort(newSort);
    setPage(1);
  };

  const handleCreated = (customer: Customer) => {
    setCustomers((prev) => [customer, ...prev]);
    setShowAddModal(false);
    fetchCustomers(search, 1, pageSize, sort);
  };

  const handleUpdated = (customer: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === customer.id ? customer : c)));
    setEditingCustomer(null);
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/customers/${deletingCustomer.id}`, { method: 'DELETE' });
      if (res.ok) {
        setCustomers((prev) => prev.filter((c) => c.id !== deletingCustomer.id));
        setDeletingCustomer(null);
        fetchCustomers(search, page, pageSize, sort);
      }
    } catch {
      // ignore
    } finally {
      setIsDeleting(false);
    }
  };

  const formatAddress = (c: Customer) => {
    const parts = [c.street, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean);
    return parts.join(', ') || '—';
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' });

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Szukaj po nazwie lub NIP…"
            className="pl-9"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Sort selector */}
        <Select value={sort} onValueChange={(v) => handleSortChange(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-48">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Ostatnio użyte</SelectItem>
            <SelectItem value="name">Nazwa (A-Z)</SelectItem>
            <SelectItem value="createdAt">Data utworzenia</SelectItem>
          </SelectContent>
        </Select>

        {/* Page size selector */}
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>{s} / str.</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={() => setShowAddModal(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Dodaj klienta</span>
          <span className="sm:hidden">Dodaj</span>
        </Button>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">
                <button
                  onClick={() => handleSortChange(sort === 'name' ? 'name' : 'name')}
                  className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Nazwa firmy
                  {sort === 'name' && <ArrowUp className="w-3 h-3" />}
                </button>
              </th>
              <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">NIP</th>
              <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Adres</th>
              <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">E-mail</th>
              <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Telefon</th>
              <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">
                <button
                  onClick={() => handleSortChange(sort === 'createdAt' ? 'createdAt' : 'createdAt')}
                  className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Utworzono
                  {sort === 'createdAt' && <ArrowDown className="w-3 h-3" />}
                </button>
              </th>
              <th className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Loader2 className="w-6 h-6 text-slate-300 mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-slate-400">Ładowanie klientów…</p>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Building2 className="w-10 h-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                    {search ? `Brak wyników dla „${search}"` : 'Brak zapisanych klientów'}
                  </p>
                  {!search && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddModal(true)}
                      className="mt-3 gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Dodaj pierwszego klienta
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                        {c.last_used_at && (
                          <span className="text-[10px] text-slate-400">Ostatnio używany</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{c.nip ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">{formatAddress(c)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                        onClick={() => setEditingCustomer(c)}
                        title="Edytuj"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="Faktury klienta"
                        onClick={() => window.location.assign(`/invoice?buyer_company_id=${c.id}`)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => setDeletingCustomer(c)}
                        title="Usuń"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Card list — mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
            <Loader2 className="w-6 h-6 text-slate-300 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-slate-400">Ładowanie…</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
            <Building2 className="w-10 h-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {search ? `Brak wyników dla „${search}"` : 'Brak zapisanych klientów'}
            </p>
          </div>
        ) : (
          customers.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    NIP: <span className="font-mono">{c.nip ?? '—'}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{formatAddress(c)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] py-0">
                      {formatDate(c.created_at)}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingCustomer(c)}>
                  <Pencil className="w-3 h-3" /> Edytuj
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => window.location.assign(`/invoice?buyer_company_id=${c.id}`)}>
                  <FileText className="w-3 h-3" /> Faktury
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-red-500 hover:text-red-600" onClick={() => setDeletingCustomer(c)}>
                  <Trash2 className="w-3 h-3" /> Usuń
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} z {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Poprzednia
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400 px-2">
              {pagination.page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Następna
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Add customer modal */}
      <CustomerFormModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={handleCreated}
        mode="create"
      />

      {/* Edit customer modal */}
      <CustomerFormModal
        open={!!editingCustomer}
        onOpenChange={(open) => { if (!open) setEditingCustomer(null); }}
        onSuccess={handleUpdated}
        mode="edit"
        customer={editingCustomer}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingCustomer} onOpenChange={(open) => { if (!open) setDeletingCustomer(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć klienta?</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć <strong>{deletingCustomer?.name}</strong>?
              Klient zostanie ukryty z listy, ale faktury powiązane z tym klientem pozostaną zachowane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Usuń klienta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Customer Form Modal (Add / Edit) ─────────────────────────────────────────

interface FormModalProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  onSuccess:     (customer: Customer) => void;
  mode:          'create' | 'edit';
  customer?:     Customer | null;
}

function CustomerFormModal({ open, onOpenChange, onSuccess, mode, customer }: FormModalProps) {
  const [name, setName]         = useState('');
  const [nip, setNip]           = useState('');
  const [address, setAddress]   = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState('');

  // Populate form when modal opens
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && customer) {
        setName(customer.name);
        setNip(customer.nip ?? '');
        const addrParts = [customer.street, [customer.postal_code, customer.city].filter(Boolean).join(' '), customer.country]
          .filter(Boolean).join(', ');
        setAddress(addrParts || '');
        setEmail(customer.email ?? '');
        setPhone(customer.phone ?? '');
      } else {
        setName(''); setNip(''); setAddress(''); setEmail(''); setPhone('');
      }
      setErrors({});
      setSubmitError('');
    }
  }, [open, mode, customer]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nazwa firmy jest wymagana';
    if (!nip.trim()) {
      e.nip = 'NIP jest wymagany';
    } else if (!/^\d{10}$/.test(nip.trim())) {
      e.nip = 'NIP musi zawierać 10 cyfr';
    }
    if (!address.trim()) {
      e.address = 'Adres jest wymagany';
    } else if (address.trim().length < 3) {
      e.address = 'Adres musi mieć min. 3 znaki';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'Nieprawidłowy adres e-mail';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        name:    name.trim(),
        nip:     nip.trim(),
        address: address.trim(),
        email:   email.trim() || undefined,
        phone:   phone.trim() || undefined,
      };

      const url    = mode === 'edit' && customer ? `/api/customers/${customer.id}` : '/api/customers';
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) {
          const e: Record<string, string> = {};
          for (const [field, msgs] of Object.entries(data.fieldErrors)) {
            e[field] = (msgs as string[])[0] ?? 'Nieprawidłowa wartość';
          }
          setErrors(e);
        } else {
          setSubmitError(data.error ?? 'Operacja nie powiodła się.');
        }
        return;
      }

      onSuccess(data.customer as Customer);
    } catch {
      setSubmitError('Błąd połączenia z serwerem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            {mode === 'edit' ? 'Edytuj klienta' : 'Dodaj nowego klienta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Nazwa firmy <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Firma ABC Sp. z o.o."
              className={errors.name ? 'border-red-400' : ''}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              NIP <span className="text-red-500">*</span>
            </Label>
            <Input
              value={nip}
              onChange={(e) => setNip(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="1234567890"
              className={cn('font-mono', errors.nip && 'border-red-400')}
            />
            {errors.nip && <p className="text-xs text-red-500">{errors.nip}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Adres <span className="text-red-500">*</span>
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ul. Przykładowa 1, 00-001 Warszawa"
              className={errors.address ? 'border-red-400' : ''}
            />
            {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                E-mail
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="kontakt@firma.pl"
                className={errors.email ? 'border-red-400' : ''}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Telefon
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+48 123 456 789"
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Anuluj
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'edit' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {mode === 'edit' ? 'Zapisz zmiany' : 'Zapisz klienta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
