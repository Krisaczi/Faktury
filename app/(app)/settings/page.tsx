'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useTheme } from 'next-themes';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader as Loader2, User, Shield, Bell, Palette, CircleCheck as CheckCircle, Building2, Mail, Copy, Check, ExternalLink, CreditCard, TriangleAlert as AlertTriangle, RefreshCw, Info, Zap, FlaskConical, CircleArrowUp as ArrowUpCircle, Star, X, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useCompanySettings,
  useBillingStatus,
  useUpgradePlan,
  logIngestionEmailCopy,
  type CompanyUpdateInput,
} from '@/hooks/use-settings';
import { DemoGuard, DemoTooltip } from '@/components/layout/demo-banner';
import { useDemoMode } from '@/components/providers/demo-provider';
import { BankAccountsCard } from '@/components/settings/bank-accounts-card';
import { ChangePasswordModal } from '@/components/settings/change-password-modal';

// ─── Zod schema ────────────────────────────────────────────────────────────────
const companySchema = z.object({
  name:     z.string().min(2, 'Nazwa musi składać się przynajmniej z 2 znaków').max(200),
  nip:      z.string().max(20).optional().or(z.literal('')),
  currency: z.enum(['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'HUF']),
});

type CompanyForm = z.infer<typeof companySchema>;

// ─── Billing status colors ──────────────────────────────────────────────────────
const billingStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Aktywny',    color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  past_due:  { label: 'Past Due',  color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-100 dark:bg-amber-900/30' },
  cancelled: { label: 'Anulowany', color: 'text-red-700 dark:text-red-400',      bg: 'bg-red-100 dark:bg-red-900/30' },
  paused:    { label: 'Wstrzymany',    color: 'text-slate-700 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800' },
};

function fmt(date: string | null | undefined) {
  if (!date) return null;
  try { return format(parseISO(date), 'MMM d, yyyy'); } catch { return null; }
}

// ─── Company Info Card ─────────────────────────────────────────────────────────
function CompanyInfoCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, error, updateCompany } = useCompanySettings();
  const company = data?.company;

  const [form, setForm] = useState<CompanyForm>({ name: '', nip: '', currency: 'PLN' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (company) {
      setForm({
        name:     company.name,
        nip:      company.nip ?? '',
        currency: company.currency as CompanyForm['currency'],
      });
      setDirty(false);
    }
  }, [company?.id]);

  function handleChange<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
    setDirty(true);
  }

  async function handleSave() {
    const result = companySchema.safeParse(form);
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setFieldErrors({
        name:     flat.name?.[0],
        nip:      flat.nip?.[0],
        currency: flat.currency?.[0],
      });
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const input: CompanyUpdateInput = { name: result.data.name, currency: result.data.currency };
      if (result.data.nip !== undefined) input.nip = result.data.nip || null;
      await updateCompany(input);
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Nie udało się załadować informacji o firmie. {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Dane firmy</CardTitle>
        </div>
        <CardDescription>Zaktualizuj dane firmy.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {saved && (
          <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">
              Dane firmy zostały zapisane pomyślnie.
            </AlertDescription>
          </Alert>
        )}
        {saveError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1.5"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Nazwa firmy <span className="text-red-500">*</span></Label>
              <Input
                id="company-name"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                disabled={!isAdmin}
                className={cn(fieldErrors.name && 'border-red-400 focus-visible:ring-red-400')}
              />
              {fieldErrors.name && <p className="text-xs text-red-500">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-nip">
                NIP
                <span className="ml-1.5 text-xs text-slate-400 font-normal">(NIP)</span>
              </Label>
              <Input
                id="company-nip"
                value={form.nip}
                onChange={(e) => handleChange('nip', e.target.value)}
                disabled={!isAdmin}
                placeholder="e.g. 1234567890"
                className={cn('font-mono', fieldErrors.nip && 'border-red-400')}
              />
              {fieldErrors.nip && <p className="text-xs text-red-500">{fieldErrors.nip}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => handleChange('currency', v as CompanyForm['currency'])}
                disabled={!isAdmin}
              >
                <SelectTrigger className={cn(fieldErrors.currency && 'border-red-400')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: 'PLN', label: 'PLN — Polish Złoty' },
                    { value: 'EUR', label: 'EUR — Euro' },
                    { value: 'USD', label: 'USD — US Dollar' },
                    { value: 'GBP', label: 'GBP — British Pound' },
                    { value: 'CZK', label: 'CZK — Czech Koruna' },
                    { value: 'HUF', label: 'HUF — Hungarian Forint' },
                  ].map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isAdmin && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Do edycji informacji o firmie wymagana jest rola administratora.
              </p>
            )}
          </>
        )}
      </CardContent>

      {isAdmin && (
        <CardFooter className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          <p className="text-xs text-slate-400">
            {company?.updated_at ? `Last updated ${fmt(company.updated_at)}` : ''}
          </p>
          <Button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : saved ? <><Check className="w-4 h-4 mr-2" />Saved</> : 'Save Changes'}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// ─── Ingestion Email Card ───────────────────────────────────────────────────────
function IngestionEmailCard() {
  const { data, isLoading } = useCompanySettings();
  const [copied, setCopied] = useState(false);

  const ingestionEmail = data?.company?.ingestion_email;

  async function handleCopy() {
    if (!ingestionEmail) return;
    try {
      await navigator.clipboard.writeText(ingestionEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      // Fire and forget audit log
      logIngestionEmailCopy().catch(() => {});
    } catch {
      // clipboard not available — silently ignore
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Ingestion Email</CardTitle>
        </div>
        <CardDescription>Faktury wysłane na ten adres są automatycznie procesowane.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : ingestionEmail ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">{ingestionEmail}</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'shrink-0 gap-1.5 transition-all',
                      copied && 'border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400'
                    )}
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Skopiuj wiadomość e-mail do schowka</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
            <Info className="w-4 h-4 flex-shrink-0" />
            Nie skonfigurowano adresu e-mail do odbioru. Skontaktuj się z pomocą techniczną, aby go skonfigurować.
          </div>
        )}

        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 p-3 space-y-1.5">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Jak to działa
          </p>
          <ul className="text-xs text-blue-600 dark:text-blue-500 space-y-1 list-disc list-inside">
            <li>Prześlij faktury na ten adres.</li>
            <li>Załączniki (XML, PDF) są przetwarzane automatycznie.</li>
            <li>Przetworzone faktury pojawiają się w Raporcie Ryzyka w ciągu kilku minut.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Billing Card ──────────────────────────────────────────────────────────────
const planConfig: Record<string, { label: string; badgeClass: string }> = {
  starter:      { label: 'Starter',      badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' },
  professional: { label: 'Professional', badgeClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
};

function BillingCard({ role }: { role: string }) {
  const { data, isLoading, error, mutate } = useBillingStatus();
  const { upgradePlan } = useUpgradePlan();
  const { status: demoStatus } = useDemoMode();
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [billingError, setBillingError] = useState('');

  const productType = data?.product_type ?? 'starter';
  const subscriptionStatus = data?.subscription_status ?? 'active';
  const canUpgrade = data?.canUpgrade ?? false;
  const auditHistory = data?.auditHistory;
  const statusCfg = billingStatusConfig[subscriptionStatus] ?? billingStatusConfig.active;
  const planCfg = planConfig[productType] ?? planConfig.starter;

  async function handleUpgrade() {
    setUpgrading(true);
    setBillingError('');
    setUpgradeSuccess(false);
    try {
      await upgradePlan();
      setUpgradeSuccess(true);
      setTimeout(() => setUpgradeSuccess(false), 4000);
      await mutate();
    } catch (e: unknown) {
      setBillingError(e instanceof Error ? e.message : 'Failed to upgrade plan');
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Twój Pakiet</CardTitle>
        </div>
        <CardDescription>Zarządzaj swoim pakietem.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {billingError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{billingError}</AlertDescription>
          </Alert>
        )}

        {/* Demo mode — show a special plan card instead of billing */}
        {demoStatus.isDemo ? (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pakiet Demo</p>
                <p className="text-xs text-slate-500 mt-0.5">Zobacz jak to działa z użyciem przykładowych danych — rozliczanie nieaktywne</p>
              </div>
              <Badge className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                Demo
              </Badge>
            </div>
            <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 rounded-lg px-3 py-2.5">
              <FlaskConical className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Zarejestruj się, aby bezpłatnie korzystać przez pierwsze 7 dni. Dostęp do wszystkich funkcji rozliczeniowych. Jeżeli się zdecydujesz dane Twojej firmy pozostaną w aplikacji</span>
            </div>
            <DemoTooltip message="Billing management is disabled in Demo Mode.">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 w-full"
                size="sm"
              >
                <Zap className="w-4 h-4" />
                Ulpesz swój pakiet do Pro
              </Button>
            </DemoTooltip>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-9 w-32" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Nie udało się wczytać informacji rozliczeniowych.
          </div>
        ) : (
          <>
            {/* Current plan card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Obecny Pakiet
                    </p>
                    <Badge className={cn('text-xs capitalize', planCfg.badgeClass)}>
                      {planCfg.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {productType === 'professional'
                      ? 'Maks. 3 użytkowników, nielimitowana liczba dostawców i generowanych raportów, możliwość wystawiania faktur w KSeF.'
                      : '1 użytkownik, 25 dostawców, 10 raportów miesięcznie.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {statusCfg.label}
                  </p>
                </div>
                <Badge className={cn('text-xs', statusCfg.bg, statusCfg.color)}>
                  {statusCfg.label}
                </Badge>
              </div>
            </div>

            {/* Billing history */}
            {auditHistory && auditHistory.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Twoje rozliczenia
                </p>
                <ul className="space-y-2">
                  {auditHistory.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span>{fmt(entry.created_at)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="capitalize">{entry.old_package}</span>
                        <ArrowUpCircle className="w-3 h-3 text-slate-400" />
                        <span className="capitalize font-medium text-slate-700 dark:text-slate-300">{entry.new_package}</span>
                      </span>
                      {entry.provider_tx_id && (
                        <span className="font-mono text-slate-400 text-[10px]">{entry.provider_tx_id}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {upgradeSuccess && (
              <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">
                  Twój plan został podniesiony do wersji Professional. Fakturowanie zostanie włączone po odświeżeniu strony.
                </AlertDescription>
              </Alert>
            )}

            {/* Upgrade card + plan comparison — visible for Starter when upgrade is allowed */}
            {productType === 'starter' && canUpgrade && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/10 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Star className="w-[18px] h-[18px]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Ulepsz swój pakiet to Pro
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Zyskaj dostęp dla maksymalnie 3 użytkowników, nielimitowaną liczbę dostawców i raportów oraz pełną obsługę fakturowania z KSeF.
                    </p>
                  </div>
                </div>

                {/* Plan comparison */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Starter</p>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />1 użytkownik</li>
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />25 dostawców</li>
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />10 raportów miesięcznie</li>
                      <li className="flex items-start gap-1.5"><X className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />Podgląd faktur z KSeF (tylko do odczytu)</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Profesjonalny</p>
                    <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Maks 3 users</li>
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Nielimitowana liczba dostawców i generowanych raportów</li>
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Możliwość wystawiania faktur w KSeF</li>
                      <li className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />Priorytetowe wsparcie</li>
                    </ul>
                  </div>
                </div>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  size="sm"
                  onClick={handleUpgrade}
                  disabled={upgrading}
                >
                  {upgrading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Upgrading…</>
                    : <><ArrowUpCircle className="w-4 h-4" />Upgrade to Professional</>}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── KSeF credentials card ──────────────────────────────────────────────────────
function canManageKSeF(role: string): boolean {
  return role === 'owner' || role === 'accountant';
}

function KsefCredentialsCard({ role }: { role: string }) {
  const supabase = getSupabaseBrowserClient();
  const [token, setToken] = useState('');
  const [env, setEnv] = useState<'test' | 'prod'>('test');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [existing, setExisting] = useState<{ environment: string; updated_at: string } | null | undefined>(undefined);

  const canManage = canManageKSeF(role);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: userRecord } = await supabase
        .from('users').select('company_id').eq('id', user.id).maybeSingle();
      if (!userRecord?.company_id) return;
      const { data } = await supabase
        .from('ksef_credentials')
        .select('environment, updated_at')
        .eq('company_id', userRecord.company_id)
        .maybeSingle();
      setExisting(data ?? null);
      if (data?.environment) setEnv(data.environment as 'test' | 'prod');
    });
  }, [supabase]);

  async function handleSave() {
    if (!token.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const res = await fetch('/api/ksef/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token: token.trim(), environment: env }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        throw new Error(err.error ?? 'Failed to save');
      }

      const data = await res.json() as { ok: boolean; environment: string; updated_at: string };
      setSaved(true);
      setToken('');
      setShowToken(false);
      setExisting({ environment: data.environment, updated_at: data.updated_at });
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Integracja z KseF</CardTitle>
        </div>
        <CardDescription>Połącz się z Krajowym Systemem e-Faktur <a
    href="https://ksef.podatki.gov.pl/aplikacja-podatnika-ksef-20/"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="KSeF — otwiera stronę Krajowego Systemu e-Faktur w nowej karcie"
    className=" text-blue-600"
  >(KSeF)</a>, aby automatycznie pobierać faktury.
        <br></br>
         Nie wiesz jak wygenerować token w KSeF?{" "}
  <a
    href="/docs/jak-wygenerowac-token-ksef.pdf"
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-600 underline hover:text-blue-700"
  >
    Zobacz jak to zrobić.
  </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current token status */}
        {existing !== undefined && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border',
            existing
              ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
          )}>
            {existing ? (
              <><CheckCircle className="w-4 h-4 shrink-0" />
              Token skonfigurowany &mdash; <span className="font-medium capitalize">{existing.environment}</span> środowisko
              {existing.updated_at && <span className="text-xs opacity-70 ml-auto">{fmt(existing.updated_at)}</span>}</>
            ) : (
              <><AlertTriangle className="w-4 h-4 shrink-0" />Brak zapisanego Tokenu &mdash; wprowadź Token, żeby połaczyć się z KSeF</>
            )}
          </div>
        )}

        {saved && (
          <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">Dane uwierzytelniające KSeF zapisane.</AlertDescription>
          </Alert>
        )}
        {error && <Alert variant="destructive" className="py-2"><AlertDescription>{error}</AlertDescription></Alert>}

        {canManage && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 px-3 py-2">
            <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Możesz zapisać token KSeF dla swojej firmy.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Środowisko</Label>
          <div className="flex gap-2">
            {(['test', 'prod'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                disabled={!canManage}
                className={cn(
                  'flex-1 py-2 text-sm rounded-lg border transition-colors capitalize',
                  env === e
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ksef-token">{existing ? 'Zmień Token' : 'API Token'}</Label>
          <div className="relative">
            <Input
              id="ksef-token"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={existing ? 'Wklej nowy token, aby zastąpić istniejący' : 'Wklej swój token API KSeF'}
              disabled={!canManage}
              className="font-mono text-sm pr-10"
            />
            {canManage && token.length > 0 && (
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label={showToken ? 'Ukryj token' : 'Pokaż token'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">Token jest przechowywany po stronie serwera i nigdy nie jest zwracany do przeglądarki.</p>
        </div>

        {canManage && (
          <Button
            onClick={handleSave}
            disabled={saving || !token.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie…</> : (existing ? 'Zmień Token' : 'Zapisz Token')}
          </Button>
        )}
      </CardContent>
    </Card>
      </>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, profile } = useAuth();
  const { data: settingsData } = useCompanySettings();
  const { theme, setTheme } = useTheme();
  const supabase = getSupabaseBrowserClient();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile?.full_name]);

  const role = settingsData?.role ?? 'accountant';
  const isAdmin = ['owner'].includes(role);

  const initials = (profile?.full_name ?? user?.email ?? 'U')
    .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  async function handleProfileSave() {
    setProfileSaving(true);
    setProfileError('');
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName }).eq('id', user!.id);
    setProfileSaving(false);
    if (error) {
      setProfileError('Failed to save profile.');
    } else {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    }
  }

  return (
    <TooltipProvider>
      <div className="max-w-5xl space-y-2">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Ustawienia</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Zarządzaj swoim kontem, konfiguracją firmy i połączniem z KseF.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left column */}
          <div className="space-y-6">
            {/* Company Info */}
            <CompanyInfoCard isAdmin={isAdmin} />

            {/* Ingestion Email */}
            <IngestionEmailCard />

            {/* Profile */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Profil</CardTitle>
                </div>
                <CardDescription>Zaktualizuj dane firmy.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14">
                    <AvatarFallback className="text-lg bg-blue-700 text-white">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{profile?.full_name ?? 'No name set'}</p>
                    <p className="text-sm text-slate-400">{user?.email}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge className="text-xs capitalize bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {profile?.role ?? 'user'}
                      </Badge>
                      {role !== 'accountant' && (
                        <Badge className="text-xs capitalize bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {role}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Separator />
                {profileSaved && (
                  <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">Profil uaktualniony.</AlertDescription>
                  </Alert>
                )}
                {profileError && (
                  <Alert variant="destructive" className="py-2"><AlertDescription>{profileError}</AlertDescription></Alert>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Pełna nazwa firmy</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={user?.email ?? ''} disabled className="bg-slate-50 dark:bg-slate-800 text-slate-400" />
                  <p className="text-xs text-slate-400">Tutaj nie można zmienić adresu e-mail.</p>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" size="sm" onClick={handleProfileSave} disabled={profileSaving}>
                  {profileSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie…</> : 'Save Profile'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Bank Accounts */}
            <BankAccountsCard role={role} />

            {/* Billing */}
            <BillingCard role={role} />

            {/* KSeF */}
            <KsefCredentialsCard role={role} />

            {/* Appearance */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Wygląd</CardTitle>
                </div>
                <CardDescription>Dostosuj wygląd aplikacji.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Tryb ciemny</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Przełączanie między jasnym i ciemnym motywem</p>
                  </div>
                  <Switch checked={theme === 'dark'} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} />
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Bezpieczeństwo</CardTitle>
                </div>
                <CardDescription>Zarządzaj ustawieniami bezpieczeństwa swojego konta.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Zmiana hasła</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Zaktualizuj hasło do swojego konta</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChangePasswordOpen(true)}
                  >
                    Zmień hasło
                  </Button>
                </div>
                <Separator />
              
              </CardContent>
            </Card>
          </div>
        </div>

        <ChangePasswordModal open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      </div>
    </TooltipProvider>
  );
}
