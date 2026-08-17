'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Plus, Building2, Check, Loader as Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
}

interface Props {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  onCustomerCreated?: (customer: Customer) => void;
}

export function CustomerPicker({ value, onChange, onCustomerCreated }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      params.set('limit', '20');

      const res = await fetch(`/api/customers?${params.toString()}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json() as { customers: Customer[] };
      setResults(data.customers ?? []);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onSearchChange = useCallback((val: string) => {
    setSearch(val);
    setShowDropdown(true);
    setHighlightedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(val);
    }, 250);
  }, [performSearch]);

  // Initial load: fetch recently used customers
  useEffect(() => {
    performSearch('');
  }, [performSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowDropdown(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && results[highlightedIndex]) {
      e.preventDefault();
      selectCustomer(results[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const selectCustomer = (customer: Customer) => {
    onChange(customer);
    setSearch('');
    setShowDropdown(false);
    setHighlightedIndex(-1);

    // Update last_used_at on the server (fire-and-forget)
    fetch(`/api/customers/${customer.id}/touch`, { method: 'POST' }).catch(() => {});
  };

  const handleCustomerCreated = (customer: Customer) => {
    setResults((prev) => [customer, ...prev]);
    selectCustomer(customer);
    onCustomerCreated?.(customer);
  };

  const fullAddress = (c: Customer) => {
    const parts = [c.street, [c.postal_code, c.city].filter(Boolean).join(' '), c.country]
      .filter(Boolean).join(', ');
    return parts || '—';
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected customer display */}
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                {value.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                NIP: {value.nip ?? '—'} · {fullAddress(value)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { onChange(null); setSearch(''); setShowDropdown(true); performSearch(''); }}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
          >
            Zmień
          </Button>
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={onKeyDown}
              placeholder="Szukaj klienta po nazwie lub NIP…"
              className="pl-9"
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>

          {/* Dropdown results */}
          {showDropdown && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-72 overflow-y-auto">
              {results.length > 0 ? (
                <ul className="py-1">
                  {results.map((c, i) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectCustomer(c)}
                        onMouseEnter={() => setHighlightedIndex(i)}
                        className={cn(
                          'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors',
                          highlightedIndex === i
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        )}
                      >
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {c.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            NIP: {c.nip ?? '—'} · {fullAddress(c)}
                          </p>
                        </div>
                        {c.last_used_at && (
                          <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
                            Ostatnio używany
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !isLoading ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    {search
                      ? `Brak wyników dla „${search}"`
                      : 'Brak zapisanych klientów'}
                  </p>
                </div>
              ) : null}

              {/* Add new customer CTA */}
              <div className="border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowDropdown(false); setShowCreateModal(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Dodaj nowego klienta
                  {search && <span className="text-slate-400 font-normal">„{search}"</span>}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create customer modal */}
      <CreateCustomerModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreated={handleCustomerCreated}
        defaultName={search}
      />
    </div>
  );
}

// ─── Create Customer Modal ────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: Customer) => void;
  defaultName?: string;
}

function CreateCustomerModal({ open, onOpenChange, onCreated, defaultName }: CreateModalProps) {
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName(defaultName ?? '');
      setNip('');
      setAddress('');
      setEmail('');
      setPhone('');
      setErrors({});
      setSubmitError('');
    }
  }, [open, defaultName]);

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
      const res = await fetch('/api/customers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:    name.trim(),
          nip:     nip.trim(),
          address: address.trim(),
          email:   email.trim() || undefined,
          phone:   phone.trim() || undefined,
        }),
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
          setSubmitError(data.error ?? 'Nie udało się utworzyć klienta.');
        }
        return;
      }

      onCreated(data.customer as Customer);
      onOpenChange(false);
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
            Dodaj nowego klienta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Company name */}
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

          {/* NIP */}
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

          {/* Address */}
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
            {/* Email */}
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

            {/* Phone */}
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
            ) : (
              <Check className="w-4 h-4" />
            )}
            Zapisz klienta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
