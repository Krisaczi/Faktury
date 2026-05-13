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
import { Loader as Loader2, User, Shield, Bell, Palette, CircleCheck as CheckCircle, Building2, Mail, Copy, Check, ExternalLink, CreditCard, TriangleAlert as AlertTriangle, RefreshCw, Info, Zap, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useCompanySettings,
  useBillingStatus,
  useCreateCheckout,
  logIngestionEmailCopy,
  type CompanyUpdateInput,
} from '@/hooks/use-settings';
import { DemoGuard, DemoTooltip } from '@/components/layout/demo-banner';
import { useDemoMode } from '@/components/providers/demo-provider';

// ─── Zod schema ────────────────────────────────────────────────────────────────
const companySchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(200),
  nip:      z.string().max(20).optional().or(z.literal('')),
  currency: z.enum(['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'HUF']),
});

type CompanyForm = z.infer<typeof companySchema>;

// ─── Billing status colors ──────────────────────────────────────────────────────
const billingStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  trial:     { label: 'Trial',     color: 'text-blue-700 dark:text-blue-400',    bg: 'bg-blue-100 dark:bg-blue-900/30' },
  active:    { label: 'Active',    color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  past_due:  { label: 'Past Due',  color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-100 dark:bg-amber-900/30' },
  cancelled: { label: 'Cancelled', color: 'text-red-700 dark:text-red-400',      bg: 'bg-red-100 dark:bg-red-900/30' },
  paused:    { label: 'Paused',    color: 'text-slate-700 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800' },
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
            Failed to load company info. {error.message}
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
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Company Info</CardTitle>
        </div>
        <CardDescription>Update your organization's details.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {saved && (
          <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">
              Company info saved successfully.
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
              <Label htmlFor="company-name">Company name <span className="text-red-500">*</span></Label>
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
                <span className="ml-1.5 text-xs text-slate-400 font-normal">(Tax ID)</span>
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
                Admin or owner role required to edit company info.
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
        <CardDescription>Send invoices directly to this address for automatic processing.</CardDescription>
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
                <TooltipContent>Copy ingestion email to clipboard</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
            <Info className="w-4 h-4 flex-shrink-0" />
            No ingestion email configured. Contact support to set one up.
          </div>
        )}

        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 p-3 space-y-1.5">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            How it works
          </p>
          <ul className="text-xs text-blue-600 dark:text-blue-500 space-y-1 list-disc list-inside">
            <li>Forward or CC invoices to this address.</li>
            <li>Attachments (XML, PDF) are parsed automatically.</li>
            <li>Processed invoices appear on your Risk Report within minutes.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Billing Card ──────────────────────────────────────────────────────────────
function BillingCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, error } = useBillingStatus();
  const { createCheckout } = useCreateCheckout();
  const { status: demoStatus } = useDemoMode();
  const [loading, setLoading] = useState(false);
  const [billingError, setBillingError] = useState('');

  const billing = data?.billing;
  const lsConfigured = data?.lsConfigured ?? false;
  const statusCfg = billingStatusConfig[billing?.status ?? 'trial'] ?? billingStatusConfig.trial;

  async function handleUpgrade() {
    setLoading(true);
    setBillingError('');
    try {
      const url = await createCheckout();
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e: unknown) {
      setBillingError(e instanceof Error ? e.message : 'Failed to open billing portal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Billing & Plan</CardTitle>
        </div>
        <CardDescription>Manage your subscription and billing details.</CardDescription>
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
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Demo Plan</p>
                <p className="text-xs text-slate-500 mt-0.5">Exploring with sample data — billing not active</p>
              </div>
              <Badge className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                Demo
              </Badge>
            </div>
            <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 rounded-lg px-3 py-2.5">
              <FlaskConical className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Sign up for a free account to access all billing features and keep your data.</span>
            </div>
            <DemoTooltip message="Billing management is disabled in Demo Mode.">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 w-full"
                size="sm"
              >
                <Zap className="w-4 h-4" />
                Upgrade to Pro
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
            Failed to load billing info.
          </div>
        ) : (
          <>
            {/* Plan card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {billing?.plan_name ?? 'Trial'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {billing?.status === 'trial' && 'Free trial — upgrade to unlock all features'}
                    {billing?.status === 'active' && billing.renews_at && `Renews ${fmt(billing.renews_at)}`}
                    {billing?.status === 'past_due' && 'Payment failed — please update your payment method'}
                    {billing?.status === 'cancelled' && billing.ends_at && `Access until ${fmt(billing.ends_at)}`}
                    {billing?.status === 'paused' && 'Subscription paused'}
                  </p>
                </div>
                <Badge className={cn('text-xs', statusCfg.bg, statusCfg.color)}>
                  {statusCfg.label}
                </Badge>
              </div>

              {billing?.status === 'trial' && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { label: 'Invoices', value: '100/mo', cap: true },
                    { label: 'Vendors',  value: '10',      cap: true },
                    { label: 'Exports',  value: '5/mo',    cap: true },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</p>
                      <p className="text-xs text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Features list for trial */}
            {billing?.status === 'trial' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">Pro includes</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    'Unlimited invoice ingestion',
                    'Unlimited vendor profiles',
                    'KSeF integration',
                    'CSV exports & audit logs',
                    'Priority support',
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!lsConfigured && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Billing is not configured for this deployment. Contact your administrator to set up a Lemon Squeezy integration.</span>
              </div>
            )}

            {isAdmin && lsConfigured && (
              <div className="flex gap-2">
                {billing?.status === 'trial' && (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    size="sm"
                    onClick={handleUpgrade}
                    disabled={loading}
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Upgrade to Pro
                  </Button>
                )}
                {billing?.status !== 'trial' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleUpgrade}
                    disabled={loading}
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Manage Billing
                  </Button>
                )}
              </div>
            )}

            {!isAdmin && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Admin or owner role required to manage billing.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── KSeF credentials card ──────────────────────────────────────────────────────
function KsefCredentialsCard({ isAdmin }: { isAdmin: boolean }) {
  const supabase = getSupabaseBrowserClient();
  const [token, setToken] = useState('');
  const [env, setEnv] = useState<'test' | 'prod'>('test');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<{ environment: string; updated_at: string } | null | undefined>(undefined);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: userRecord } = await supabase
        .from('users').select('company_id').eq('id', user.id).maybeSingle();
      if (!userRecord?.company_id) throw new Error('No company');
      const now = new Date().toISOString();
      const { error: upsertError } = await supabase.from('ksef_credentials').upsert({
        company_id:   userRecord.company_id,
        token:        token.trim(),
        environment:  env,
        updated_at:   now,
      }, { onConflict: 'company_id,environment' });
      if (upsertError) throw upsertError;
      setSaved(true);
      setToken('');
      setExisting({ environment: env, updated_at: now });
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-500" />
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">KSeF Integration</CardTitle>
        </div>
        <CardDescription>Connect to Krajowy System e-Faktur to fetch invoices automatically.</CardDescription>
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
              Token configured &mdash; <span className="font-medium capitalize">{existing.environment}</span> environment
              {existing.updated_at && <span className="text-xs opacity-70 ml-auto">{fmt(existing.updated_at)}</span>}</>
            ) : (
              <><AlertTriangle className="w-4 h-4 shrink-0" />No token saved &mdash; enter one below to enable KSeF sync</>
            )}
          </div>
        )}

        {saved && (
          <Alert className="py-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">KSeF credentials saved.</AlertDescription>
          </Alert>
        )}
        {error && <Alert variant="destructive" className="py-2"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="space-y-1.5">
          <Label>Environment</Label>
          <div className="flex gap-2">
            {(['test', 'prod'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                disabled={!isAdmin}
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
          <Label htmlFor="ksef-token">{existing ? 'Replace Token' : 'API Token'}</Label>
          <Input
            id="ksef-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={existing ? 'Paste new token to replace existing' : 'Paste your KSeF API token'}
            disabled={!isAdmin}
            className="font-mono text-sm"
          />
          <p className="text-xs text-slate-400">Token is stored server-side and never returned to the browser.</p>
        </div>

        {isAdmin && (
          <Button
            onClick={handleSave}
            disabled={saving || !token.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : (existing ? 'Replace Token' : 'Save Token')}
          </Button>
        )}
      </CardContent>
    </Card>
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

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile?.full_name]);

  const role = settingsData?.role ?? 'member';
  const isAdmin = ['owner', 'admin'].includes(role);

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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage your account, company configuration, and integrations.
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
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Profile</CardTitle>
                </div>
                <CardDescription>Update your personal information.</CardDescription>
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
                      {role !== 'member' && (
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
                    <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2">Profile updated.</AlertDescription>
                  </Alert>
                )}
                {profileError && (
                  <Alert variant="destructive" className="py-2"><AlertDescription>{profileError}</AlertDescription></Alert>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" value={user?.email ?? ''} disabled className="bg-slate-50 dark:bg-slate-800 text-slate-400" />
                  <p className="text-xs text-slate-400">Email cannot be changed here.</p>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" size="sm" onClick={handleProfileSave} disabled={profileSaving}>
                  {profileSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save Profile'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Billing */}
            <BillingCard isAdmin={isAdmin} />

            {/* KSeF */}
            <KsefCredentialsCard isAdmin={isAdmin} />

            {/* Appearance */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Appearance</CardTitle>
                </div>
                <CardDescription>Customize how RiskGuard looks.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Dark mode</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Switch between light and dark theme</p>
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
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Security</CardTitle>
                </div>
                <CardDescription>Manage your account security settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Change password</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Update your account password</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/forgot-password">Reset password</a>
                  </Button>
                </div>
                <Separator />
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Danger zone</p>
                  <p className="text-xs text-red-500 dark:text-red-500 mt-1">Permanently delete your account and all associated data.</p>
                  <Button variant="destructive" size="sm" className="mt-3">Delete account</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
