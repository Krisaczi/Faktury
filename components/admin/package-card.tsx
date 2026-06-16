'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, Zap, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, X, ChevronDown, ChevronUp, FileText, Upload, Users, ChartBar as BarChart2, Headphones, History, Loader, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { assignPackageToCompany, updateIndividualPackageOptions } from '@/lib/packages/actions';
import { IndividualOptionsSchema } from '@/lib/packages/types';
import type {
  EffectivePackage,
  CompanyUsage,
  PackageTier,
  PackageType,
  IndividualOptions,
  PackageAuditEntry,
} from '@/lib/packages/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(cents: number): string {
  if (cents === 0) return 'Bezpłatny';
  return `${(cents / 100).toFixed(0)} zł/mies.`;
}

function fmtLimit(val: number | null | undefined, unit: string): string {
  if (val === null || val === undefined) return `Nieograniczone ${unit}`;
  return `${val} ${unit}`;
}

const PACKAGE_COLORS: Record<PackageType, string> = {
  starter:      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  professional: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300',
  pro:          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300',
  individual:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300',
};

// ─── Feature row ─────────────────────────────────────────────────────────────

function FeatureRow({
  icon: Icon, label, value, warn,
}: {
  icon: React.ElementType; label: string; value: React.ReactNode; warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        {label}
      </div>
      <span className={cn('text-sm font-medium', warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200')}>
        {value}
      </span>
    </div>
  );
}

// ─── Usage bar ───────────────────────────────────────────────────────────────

function UsageBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  if (limit === null) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-400">{used} / ∞</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-blue-500 w-0" />
        </div>
      </div>
    );
  }
  const pct = limit === 0 ? 100 : Math.min(100, (used / limit) * 100);
  const warn = pct >= 80;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={cn('font-medium tabular-nums', warn ? 'text-amber-600' : 'text-slate-600')}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn('h-full rounded-full transition-all', warn ? 'bg-amber-500' : 'bg-blue-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Change Package Modal ─────────────────────────────────────────────────────

interface ChangePackageModalProps {
  companyId:   string;
  current:     EffectivePackage;
  tiers:       PackageTier[];
  onClose:     () => void;
  onSuccess:   () => void;
}

function ChangePackageModal({ companyId, current, tiers, onClose, onSuccess }: ChangePackageModalProps) {
  const [selectedType, setSelectedType] = useState<PackageType>(current.type);
  const [priceCents, setPriceCents]     = useState<string>(
    current.type === 'individual' && current.priceCents ? String(current.priceCents / 100) : ''
  );
  const [reason, setReason]   = useState('');
  const [isPending, start]    = useTransition();
  const [error, setError]     = useState<string | null>(null);

  const starterTier = tiers.find((t) => t.key === 'starter');
  const proTier     = tiers.find((t) => t.key === 'pro');

  function handleConfirm() {
    setError(null);
    start(async () => {
      const tierId = selectedType !== 'individual'
        ? (tiers.find((t) => t.key === selectedType)?.id ?? null)
        : null;

      const res = await assignPackageToCompany(companyId, {
        package_type:        selectedType,
        package_id:          tierId,
        package_custom:      selectedType === 'individual' ? (current.features as IndividualOptions) : null,
        package_price_cents: selectedType === 'individual' && priceCents ? Math.round(parseFloat(priceCents) * 100) : null,
        reason:              reason || undefined,
      });

      if (res.ok) {
        onSuccess();
      } else {
        setError(res.error);
      }
    });
  }

  const options: { type: PackageType; label: string; price: string; tier?: PackageTier }[] = [
    { type: 'starter', label: 'Starter', price: fmtPrice(starterTier?.monthly_price_cents ?? 0), tier: starterTier },
    { type: 'pro',     label: 'Pro',     price: fmtPrice(proTier?.monthly_price_cents ?? 9900),  tier: proTier },
    { type: 'individual', label: 'Individual', price: 'Własna cena' },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Zmień pakiet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            {options.map((opt) => (
              <button
                key={opt.type}
                onClick={() => setSelectedType(opt.type)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-all space-y-1',
                  selectedType === opt.type
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{opt.label}</p>
                <p className="text-xs text-slate-500">{opt.price}</p>
              </button>
            ))}
          </div>

          {/* Feature comparison */}
          {selectedType !== 'individual' && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Zawiera</p>
              {(() => {
                const tier = options.find((o) => o.type === selectedType)?.tier;
                if (!tier) return null;
                const f = tier.features;
                return (
                  <>
                    <FeatureRow icon={Users}    label="Dostawcy"       value={fmtLimit(f.vendors_limit as number | null, 'dostawców')} />
                    <FeatureRow icon={BarChart2} label="Raporty/mies."  value={fmtLimit(f.reports_per_month as number | null, 'raportów')} />
                    <FeatureRow icon={FileText}  label="Fakturowanie"   value={(f.invoicing as boolean) ? 'Tak' : 'Nie'} />
                    <FeatureRow icon={Upload}    label="Upload plików"  value={(f.file_uploads as boolean) ? 'Tak' : 'Nie'} />
                    <FeatureRow icon={Headphones} label="Wsparcie"      value={(f.support as string) === 'priority' ? 'Priorytetowe' : 'Email'} />
                  </>
                );
              })()}
            </div>
          )}

          {selectedType === 'individual' && (
            <div className="space-y-2">
              <Label className="text-xs">Własna cena (PLN/mies.)</Label>
              <Input
                type="number"
                min={0}
                value={priceCents}
                onChange={(e) => setPriceCents(e.target.value)}
                placeholder="np. 49"
                className="h-9 text-sm"
              />
              <p className="text-xs text-slate-400">Po przypisaniu skonfiguruj funkcje w sekcji "Dostosuj Individual".</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Powód zmiany (opcjonalnie)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. aktualizacja na wniosek klienta"
              className="h-9 text-sm"
            />
          </div>

          {current.overLimit && selectedType !== 'pro' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Aktualne użycie przekracza limity wybranego pakietu. Firma zostanie oznaczona jako przekraczająca limit — nowe akcje wymagające zasobów będą zablokowane do momentu ograniczenia użycia.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Anuluj</Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
            Potwierdź zmianę
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Individual options form ──────────────────────────────────────────────────

interface IndividualFormProps {
  companyId: string;
  current:   EffectivePackage;
  onSuccess: () => void;
}

function IndividualOptionsForm({ companyId, current, onSuccess }: IndividualFormProps) {
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);
  const [saved, setSaved]  = useState(false);

  const { control, register, handleSubmit } = useForm<IndividualOptions>({
    resolver: zodResolver(IndividualOptionsSchema),
    defaultValues: {
      vendors_limit:     current.features.vendors_limit,
      reports_per_month: current.features.reports_per_month,
      file_uploads:      current.features.file_uploads,
      invoicing:         current.features.invoicing,
      support:           current.features.support,
    },
  });

  function onSubmit(values: IndividualOptions) {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateIndividualPackageOptions(companyId, values);
      if (res.ok) {
        setSaved(true);
        onSuccess();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Limit dostawców (puste = bez limitu)</Label>
          <Input
            type="number"
            min={0}
            placeholder="np. 50"
            className="h-9 text-sm"
            {...register('vendors_limit', { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Raporty/mies. (puste = bez limitu)</Label>
          <Input
            type="number"
            min={0}
            placeholder="np. 30"
            className="h-9 text-sm"
            {...register('reports_per_month', { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
          />
        </div>
      </div>

      <div className="space-y-3">
        {[
          { name: 'invoicing'    as const, label: 'Fakturowanie' },
          { name: 'file_uploads' as const, label: 'Upload plików' },
        ].map(({ name, label }) => (
          <Controller
            key={name}
            control={control}
            name={name}
            render={({ field }) => (
              <div className="flex items-center justify-between py-1">
                <Label className="text-sm cursor-pointer">{label}</Label>
                <Switch
                  checked={field.value as boolean}
                  onCheckedChange={field.onChange}
                />
              </div>
            )}
          />
        ))}

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Poziom wsparcia</Label>
          <div className="flex gap-2">
            {(['none', 'email', 'priority'] as const).map((v) => (
              <Controller
                key={v}
                control={control}
                name="support"
                render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(v)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      field.value === v
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    )}
                  >
                    {{ none: 'Brak', email: 'Email', priority: 'Priorytet' }[v]}
                  </button>
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5" /> Zapisano
          </span>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={isPending}
          className="ml-auto gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isPending && <Loader className="w-3.5 h-3.5 animate-spin" />}
          Zapisz konfigurację
        </Button>
      </div>
    </form>
  );
}

// ─── Audit list ───────────────────────────────────────────────────────────────

function AuditList({ entries }: { entries: PackageAuditEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const ACTION_LABELS: Record<string, string> = {};

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <History className="w-3.5 h-3.5" />
        Historia zmian ({entries.length})
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {e.next?.package_type
                    ? `Zmieniono na: ${String(e.next.package_type)}`
                    : 'Aktualizacja opcji Individual'}
                </p>
                {e.reason && <p className="text-xs text-slate-400 truncate">{e.reason}</p>}
              </div>
              <time className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                {format(new Date(e.created_at), 'dd.MM.yyyy')}
              </time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main PackageCard ─────────────────────────────────────────────────────────

export interface PackageCardProps {
  companyId:   string;
  pkg:         EffectivePackage;
  usage:       CompanyUsage;
  tiers:       PackageTier[];
  audit:       PackageAuditEntry[];
  isOwner:     boolean;
}

export function PackageCard({ companyId, pkg, usage, tiers, audit, isOwner }: PackageCardProps) {
  const router = useRouter();
  const [showModal, setShowModal]         = useState(false);
  const [showIndividual, setShowIndividual] = useState(false);

  const typeLabel: Record<PackageType, string> = {
    starter:      'Starter',
    professional: 'Professional',
    pro:          'Pro',
    individual:   'Individual',
  };

  return (
    <>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2.5">
            <Package className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Pakiet</h2>
          </div>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              onClick={() => setShowModal(true)}
            >
              <Pencil className="w-3 h-3" />
              Zmień pakiet
            </Button>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Current package badge + over-limit warning */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border', PACKAGE_COLORS[pkg.type])}>
                  {typeLabel[pkg.type]}
                </span>
                {pkg.overLimit && (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Przekroczony limit
                  </Badge>
                )}
              </div>
              {pkg.assignedAt && (
                <p className="text-xs text-slate-400 mt-1">
                  Przypisano: {format(new Date(pkg.assignedAt), 'dd.MM.yyyy')}
                </p>
              )}
            </div>
            {pkg.priceCents !== null && pkg.priceCents > 0 && (
              <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {fmtPrice(pkg.priceCents)}
              </span>
            )}
          </div>

          {/* Over-limit warning banner */}
          {pkg.overLimit && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Użycie przekracza limity pakietu</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Nowe akcje wymagające zasobów są zablokowane. Zaktualizuj pakiet lub ogranicz użycie, aby odblokować.
                </p>
              </div>
            </div>
          )}

          {/* Feature summary */}
          <div>
            <FeatureRow icon={Users}    label="Dostawcy"       value={fmtLimit(pkg.features.vendors_limit, 'dostawców')} />
            <FeatureRow icon={BarChart2} label="Raporty/mies."  value={fmtLimit(pkg.features.reports_per_month, 'raportów')} />
            <FeatureRow
              icon={FileText}
              label="Fakturowanie"
              value={pkg.features.invoicing ? 'Dostępne' : 'Niedostępne'}
              warn={!pkg.features.invoicing}
            />
            <FeatureRow
              icon={Upload}
              label="Upload plików"
              value={pkg.features.file_uploads ? 'Dostępny' : 'Niedostępny'}
              warn={!pkg.features.file_uploads}
            />
            <FeatureRow
              icon={Headphones}
              label="Wsparcie"
              value={{ none: 'Brak', email: 'Email', priority: 'Priorytetowe' }[pkg.features.support]}
            />
          </div>

          <Separator />

          {/* Usage bars */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Użycie</p>
            <UsageBar
              used={usage.vendors_count}
              limit={pkg.features.vendors_limit}
              label="Dostawcy"
            />
            <UsageBar
              used={usage.reports_this_month}
              limit={pkg.features.reports_per_month}
              label="Raporty (ten miesiąc)"
            />
          </div>

          {/* Individual customization (owner only) */}
          {isOwner && pkg.type === 'individual' && (
            <>
              <Separator />
              <div>
                <button
                  onClick={() => setShowIndividual(!showIndividual)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <Zap className="w-4 h-4 text-amber-500" />
                  Dostosuj Individual
                  {showIndividual ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                </button>
                {showIndividual && (
                  <IndividualOptionsForm
                    companyId={companyId}
                    current={pkg}
                    onSuccess={() => router.refresh()}
                  />
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Audit trail */}
          <AuditList entries={audit} />
        </div>
      </div>

      {showModal && (
        <ChangePackageModal
          companyId={companyId}
          current={pkg}
          tiers={tiers}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); router.refresh(); }}
        />
      )}
    </>
  );
}
