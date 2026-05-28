'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Package, Users, Loader, CircleCheck as CheckCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { upsertPricingTier } from '@/lib/packages/actions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tier {
  id:                  string;
  key:                 string;
  name:                string;
  monthly_price_cents: number;
  annual_price_cents:  number;
  features:            Record<string, unknown>;
  created_at:          string;
  updated_at:          string;
}

interface TierFormValues {
  key:                 string;
  name:                string;
  monthly_price_cents: number;
  annual_price_cents:  number;
  vendors_limit:       string;   // '' = unlimited
  reports_per_month:   string;   // '' = unlimited
  file_uploads:        boolean;
  invoicing:           boolean;
  support:             'none' | 'email' | 'priority';
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const TierFormSchema = z.object({
  key:                 z.string().min(1).regex(/^[a-z0-9_]+$/),
  name:                z.string().min(1),
  monthly_price_cents: z.number().int().min(0),
  annual_price_cents:  z.number().int().min(0),
  vendors_limit:       z.string(),
  reports_per_month:   z.string(),
  file_uploads:        z.boolean(),
  invoicing:           z.boolean(),
  support:             z.enum(['none', 'email', 'priority']),
});

// ─── Tier form modal ──────────────────────────────────────────────────────────

function TierFormModal({
  tier,
  onClose,
  onSuccess,
}: {
  tier:      Tier | null; // null = create
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  const features = tier?.features ?? {};
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<TierFormValues>({
    resolver: zodResolver(TierFormSchema),
    defaultValues: {
      key:                 tier?.key  ?? '',
      name:                tier?.name ?? '',
      monthly_price_cents: tier ? Math.round(tier.monthly_price_cents / 100) : 0,
      annual_price_cents:  tier ? Math.round(tier.annual_price_cents  / 100) : 0,
      vendors_limit:       features.vendors_limit != null ? String(features.vendors_limit) : '',
      reports_per_month:   features.reports_per_month != null ? String(features.reports_per_month) : '',
      file_uploads:        (features.file_uploads as boolean) ?? true,
      invoicing:           (features.invoicing   as boolean) ?? false,
      support:             (features.support     as 'none' | 'email' | 'priority') ?? 'email',
    },
  });

  const fileUploads = watch('file_uploads');
  const invoicing   = watch('invoicing');
  const support     = watch('support');

  function onSubmit(values: TierFormValues) {
    setError(null);
    start(async () => {
      const res = await upsertPricingTier({
        id:                  tier?.id,
        key:                 values.key,
        name:                values.name,
        monthly_price_cents: values.monthly_price_cents * 100,
        annual_price_cents:  values.annual_price_cents  * 100,
        features: {
          vendors_limit:     values.vendors_limit     !== '' ? Number(values.vendors_limit)     : null,
          reports_per_month: values.reports_per_month !== '' ? Number(values.reports_per_month) : null,
          file_uploads:      values.file_uploads,
          invoicing:         values.invoicing,
          support:           values.support,
        },
      });

      if (res.ok) {
        onSuccess();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tier ? 'Edytuj pakiet' : 'Nowy pakiet'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Klucz (np. starter, pro)</Label>
              <Input
                {...register('key')}
                placeholder="starter"
                className={cn('h-9 text-sm', errors.key && 'border-red-400')}
                disabled={!!tier && ['starter', 'pro'].includes(tier.key)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nazwa wyświetlana</Label>
              <Input
                {...register('name')}
                placeholder="Starter"
                className={cn('h-9 text-sm', errors.name && 'border-red-400')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Cena mies. (PLN)</Label>
              <Input
                type="number"
                min={0}
                {...register('monthly_price_cents', { valueAsNumber: true })}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cena roczna (PLN)</Label>
              <Input
                type="number"
                min={0}
                {...register('annual_price_cents', { valueAsNumber: true })}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Funkcje i limity</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Limit dostawców (puste = ∞)</Label>
                <Input
                  {...register('vendors_limit')}
                  type="number"
                  min={0}
                  placeholder="∞"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Raporty/mies. (puste = ∞)</Label>
                <Input
                  {...register('reports_per_month')}
                  type="number"
                  min={0}
                  placeholder="∞"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              {[
                { name: 'invoicing'    as const, label: 'Fakturowanie' },
                { name: 'file_uploads' as const, label: 'Upload plików' },
              ].map(({ name, label }) => (
                <div key={name} className="flex items-center justify-between py-1">
                  <Label className="text-sm cursor-pointer">{label}</Label>
                  <Switch
                    checked={name === 'invoicing' ? invoicing : fileUploads}
                    onCheckedChange={(v) => setValue(name, v)}
                  />
                </div>
              ))}

              <div className="space-y-1.5 pt-1">
                <Label className="text-xs text-slate-500">Wsparcie</Label>
                <div className="flex gap-2">
                  {(['none', 'email', 'priority'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setValue('support', v)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        support === v
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      )}
                    >
                      {{ none: 'Brak', email: 'Email', priority: 'Priorytet' }[v]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Anuluj
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
              {tier ? 'Zapisz zmiany' : 'Utwórz pakiet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tier card ────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  companyCount,
  onEdit,
}: {
  tier:         Tier;
  companyCount: number;
  onEdit:       (t: Tier) => void;
}) {
  const f = tier.features;
  const isCanonical = ['starter', 'pro'].includes(tier.key);

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return '∞';
    return String(v);
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2.5">
          <Package className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{tier.name}</p>
            <p className="text-xs text-slate-400 font-mono">{tier.key}</p>
          </div>
        </div>
        <button
          onClick={() => onEdit(tier)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Edytuj tier"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {tier.monthly_price_cents === 0 ? 'Bezpłatny' : `${tier.monthly_price_cents / 100} zł`}
          </span>
          {tier.monthly_price_cents > 0 && (
            <span className="text-xs text-slate-400">/mies.</span>
          )}
        </div>

        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex justify-between">
            <span>Dostawcy</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{fmtVal(f.vendors_limit)}</span>
          </div>
          <div className="flex justify-between">
            <span>Raporty/mies.</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{fmtVal(f.reports_per_month)}</span>
          </div>
          <div className="flex justify-between">
            <span>Fakturowanie</span>
            <span className={cn('font-medium', f.invoicing ? 'text-emerald-600' : 'text-slate-400')}>
              {f.invoicing ? 'Tak' : 'Nie'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Upload plików</span>
            <span className={cn('font-medium', f.file_uploads ? 'text-emerald-600' : 'text-slate-400')}>
              {f.file_uploads ? 'Tak' : 'Nie'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Wsparcie</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {{ none: 'Brak', email: 'Email', priority: 'Priorytet' }[f.support as string] ?? String(f.support)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">{companyCount} {companyCount === 1 ? 'firma' : 'firm'}</span>
          {isCanonical && (
            <span className="ml-auto text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              Systemowy
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main client ─────────────────────────────────────────────────────────────

export function PricingTiersClient({
  initialTiers,
  tierCounts,
}: {
  initialTiers: Tier[];
  tierCounts:   Record<string, number>;
}) {
  const router             = useRouter();
  const [editingTier, setEditingTier] = useState<Tier | null | 'new'>( null);
  const [saved, setSaved]  = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{initialTiers.length} pakiet(ów)</p>
        <Button
          size="sm"
          onClick={() => setEditingTier('new')}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Nowy pakiet
        </Button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Zmiany zapisane
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {initialTiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            companyCount={tierCounts[tier.id] ?? tierCounts[tier.key] ?? 0}
            onEdit={(t) => { setSaved(false); setEditingTier(t); }}
          />
        ))}
      </div>

      {editingTier !== null && (
        <TierFormModal
          tier={editingTier === 'new' ? null : editingTier}
          onClose={() => setEditingTier(null)}
          onSuccess={() => {
            setEditingTier(null);
            setSaved(true);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
