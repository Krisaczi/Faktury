'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { MapPin, Loader as Loader2, CircleCheck as CheckCircle, Pencil, History, TriangleAlert as AlertTriangle, Lock, Clock as Unlock, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface AddressData {
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  stateRegion: string;
  country: string;
  vatId: string;
}

interface AddressMeta {
  editPolicy: 'members' | 'admins';
  locked: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAtAudit: string | null;
}

interface HistoryEntry {
  id: string;
  changedBy: string;
  changedByName: string | null;
  changeType: string;
  before: AddressData | null;
  after: AddressData | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

const POSTAL_PATTERNS: Record<string, RegExp> = {
  PL: /^\d{2}-\d{3}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/,
  US: /^\d{5}(-\d{4})?$/,
  CZ: /^\d{3}\s?\d{2}$/,
  HU: /^\d{4}$/,
};

const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Adres jest wymagany').max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  city:         z.string().min(1, 'Miasto jest wymagane').max(100),
  postalCode:   z.string().min(1, 'Kod pocztowy jest wymagany').max(20),
  stateRegion:  z.string().max(100).optional().or(z.literal('')),
  country:      z.string().min(2, 'Kraj jest wymagany').max(2),
  vatId:        z.string().max(20).optional().or(z.literal('')),
}).superRefine((val, ctx) => {
  const pattern = POSTAL_PATTERNS[val.country];
  if (pattern && !pattern.test(val.postalCode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['postalCode'],
      message: `Nieprawidłowy kod pocztowy dla kraju ${val.country}`,
    });
  }
});

type AddressForm = z.infer<typeof addressSchema>;

const COUNTRIES = [
  { value: 'PL', label: 'Polska' },
  { value: 'DE', label: 'Niemcy' },
  { value: 'FR', label: 'Francja' },
  { value: 'GB', label: 'Wielka Brytania' },
  { value: 'US', label: 'USA' },
  { value: 'CZ', label: 'Czechy' },
  { value: 'HU', label: 'Węgry' },
];

function fmtDate(date: string | null | undefined) {
  if (!date) return null;
  try { return format(parseISO(date), 'MMM d, yyyy HH:mm'); } catch { return null; }
}

export function CompanyAddressCard({ role }: { role: string }) {
  const supabase = getSupabaseBrowserClient();
  const [address, setAddress] = useState<AddressData | null>(null);
  const [meta, setMeta] = useState<AddressMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AddressForm>({
    addressLine1: '', addressLine2: '', city: '', postalCode: '',
    stateRegion: '', country: 'PL', vatId: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddressForm, string>>>({});
  const [dirty, setDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);

  const canEdit = role === 'owner' || (meta?.editPolicy === 'members' && !meta?.locked);
  const isOwner = role === 'owner';
  const showHistoryButton = isOwner;

  const fetchAddress = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/companies/address', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(err.error ?? 'Failed to load');
      }
      const data = await res.json() as { address: AddressData; meta: AddressMeta };
      setAddress(data.address);
      setMeta(data.meta);
      setForm({
        addressLine1: data.address.addressLine1,
        addressLine2: data.address.addressLine2,
        city: data.address.city,
        postalCode: data.address.postalCode,
        stateRegion: data.address.stateRegion,
        country: data.address.country,
        vatId: data.address.vatId,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load address');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchAddress(); }, [fetchAddress]);

  function handleChange<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
    setDirty(true);
  }

  async function handleSave() {
    const result = addressSchema.safeParse(form);
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setFieldErrors({
        addressLine1: flat.addressLine1?.[0],
        city:         flat.city?.[0],
        postalCode:   flat.postalCode?.[0],
        country:      flat.country?.[0],
      });
      return;
    }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch('/api/companies/address', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        if (res.status === 429) {
          toast.error('Zbyt wiele aktualizacji. Spróbuj ponownie za godzinę.');
        } else if (res.status === 403) {
          toast.error(err.error ?? 'Brak uprawnień do edycji adresu.');
        } else {
          toast.error(err.error ?? 'Błąd zapisu adresu.');
        }
        return;
      }

      const data = await res.json() as { address: AddressData };
      setAddress(data.address);
      setEditing(false);
      setDirty(false);
      toast.success('Adres firmy został zapisany.');
      await fetchAddress();
    } catch {
      toast.error('Błąd połączenia z serwerem.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (address) {
      setForm({
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        postalCode: address.postalCode,
        stateRegion: address.stateRegion,
        country: address.country,
        vatId: address.vatId,
      });
    }
    setFieldErrors({});
    setDirty(false);
    setEditing(false);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch('/api/companies/address/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { history: HistoryEntry[] };
        setHistory(data.history);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleRevert(auditId: string) {
    setReverting(auditId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch('/api/companies/address/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ auditId }),
      });
      if (res.ok) {
        toast.success('Adres został przywrócony.');
        await fetchAddress();
        await fetchHistory();
      } else {
        toast.error('Błąd przywracania adresu.');
      }
    } finally {
      setReverting(null);
    }
  }

  if (loading) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Adres firmy</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Nie udało się załadować adresu. {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Adres firmy</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {meta?.locked && (
              <Badge className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 gap-1">
                <Lock className="w-3 h-3" /> Zablokowane
              </Badge>
            )}
            {meta && meta.editPolicy === 'admins' && (
              <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                Tylko admin
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>Adres i dane lokalizacyjne Twojej firmy.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!editing ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Adres</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{address?.addressLine1 || '—'}</p>
                {address?.addressLine2 && (
                  <p className="text-sm text-slate-700 dark:text-slate-300">{address.addressLine2}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Kod pocztowy / Miasto</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {address?.postalCode || '—'} {address?.city || ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Województwo / Region</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{address?.stateRegion || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Kraj</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {COUNTRIES.find((c) => c.value === address?.country)?.label ?? address?.country ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">NIP / VAT ID</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-mono">{address?.vatId || '—'}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-400">
                Ostatnia aktualizacja:{' '}
                {fmtDate(meta?.updatedAtAudit) ?? 'brak'}
                {meta?.updatedByName && ` przez ${meta.updatedByName}`}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="addr-line1">Adres <span className="text-red-500">*</span></Label>
              <Input
                id="addr-line1"
                value={form.addressLine1}
                onChange={(e) => handleChange('addressLine1', e.target.value)}
                className={cn(fieldErrors.addressLine1 && 'border-red-400')}
              />
              {fieldErrors.addressLine1 && <p className="text-xs text-red-500">{fieldErrors.addressLine1}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="addr-line2">Adres cd.</Label>
              <Input
                id="addr-line2"
                value={form.addressLine2}
                onChange={(e) => handleChange('addressLine2', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="addr-postal">Kod pocztowy <span className="text-red-500">*</span></Label>
                <Input
                  id="addr-postal"
                  value={form.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  className={cn(fieldErrors.postalCode && 'border-red-400')}
                />
                {fieldErrors.postalCode && <p className="text-xs text-red-500">{fieldErrors.postalCode}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-city">Miasto <span className="text-red-500">*</span></Label>
                <Input
                  id="addr-city"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className={cn(fieldErrors.city && 'border-red-400')}
                />
                {fieldErrors.city && <p className="text-xs text-red-500">{fieldErrors.city}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="addr-state">Województwo / Region</Label>
                <Input
                  id="addr-state"
                  value={form.stateRegion}
                  onChange={(e) => handleChange('stateRegion', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addr-country">Kraj <span className="text-red-500">*</span></Label>
                <Select value={form.country} onValueChange={(v) => handleChange('country', v)}>
                  <SelectTrigger className={cn(fieldErrors.country && 'border-red-400')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="addr-vat">NIP / VAT ID</Label>
              <Input
                id="addr-vat"
                value={form.vatId}
                onChange={(e) => handleChange('vatId', e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
        <div className="flex items-center gap-2">
          {showHistoryButton && (
            <Dialog open={historyOpen} onOpenChange={(v) => {
              setHistoryOpen(v);
              if (v) fetchHistory();
            }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-slate-500 gap-1.5">
                  <History className="w-3.5 h-3.5" /> Historia zmian
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Historia zmian adresu</DialogTitle>
                </DialogHeader>
                {historyLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Brak historii zmian.</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={cn(
                              'text-xs capitalize',
                              h.changeType === 'revert' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                              h.changeType === 'update' && 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                              h.changeType === 'lock' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                              h.changeType === 'unlock' && 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
                            )}>
                              {h.changeType}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {fmtDate(h.createdAt)}
                              {h.changedByName && ` · ${h.changedByName}`}
                            </span>
                          </div>
                          {h.changeType === 'update' && isOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs gap-1"
                              disabled={reverting === h.id}
                              onClick={() => handleRevert(h.id)}
                            >
                              {reverting === h.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RotateCcw className="w-3 h-3" />}
                              Przywróć
                            </Button>
                          )}
                        </div>
                        {h.after && (
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {h.after.addressLine1}, {h.after.postalCode} {h.after.city}, {h.after.country}
                          </p>
                        )}
                        {h.reason && (
                          <p className="text-xs text-slate-400 italic">{h.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!editing ? (
          canEdit && !meta?.locked && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edytuj
            </Button>
          )
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
              <X className="w-3.5 h-3.5 mr-1" /> Anuluj
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Zapisywanie…</>
                : <><CheckCircle className="w-3.5 h-3.5 mr-1" />Zapisz</>}
            </Button>
          </div>
        )}
      </CardFooter>

      {meta?.locked && !editing && (
        <div className="px-6 pb-4">
          <Alert className="py-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
            <Lock className="w-4 h-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-400 ml-2">
              Edycja adresu jest zablokowana przez właściciela platformy.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </Card>
  );
}
