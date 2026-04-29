'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, Eye, EyeOff, ExternalLink, Loader as Loader2, Check, Key, BookOpen, TriangleAlert as AlertTriangle, Copy, CheckCheck, RefreshCw, Clock, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { syncInvoices } from '@/lib/actions/sync-invoices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/providers/i18n-provider';

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid';
type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export function KsefSettingsForm() {
  const { user } = useAuth();
  const t = useT();
  const supabase = createClient();

  const INSTRUCTIONS = [
    {
      step: '1',
      title: t.ksef.steps[0].title,
      description: t.ksef.steps[0].description,
      link: 'https://ksef.mf.gov.pl',
      linkLabel: t.ksef.steps[0].linkLabel,
    },
    {
      step: '2',
      title: t.ksef.steps[1].title,
      description: t.ksef.steps[1].description,
    },
    {
      step: '3',
      title: t.ksef.steps[2].title,
      description: t.ksef.steps[2].description,
    },
    {
      step: '4',
      title: t.ksef.steps[3].title,
      description: t.ksef.steps[3].description,
    },
  ];

  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [validation, setValidation] = useState<ValidationState>('idle');
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [tokenCreatedAt, setTokenCreatedAt] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncResult, setSyncResult] = useState<{ total: number; newInvoices: number; errors: number } | null>(null);

  function formatRelative(dateStr: string | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t.common.justNow;
    if (mins < 60) return t.common.minutesAgo(mins);
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t.common.hoursAgo(hours);
    const days = Math.floor(hours / 24);
    return t.common.daysAgo(days);
  }

  const loadCompany = useCallback(async () => {
    if (!user) return;
    const { data: userRow } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRow?.company_id) return;
    setCompanyId(userRow.company_id);

    const { data: company } = await supabase
      .from('companies')
      .select('ksef_token, ksef_token_created_at, ksef_last_synced_at')
      .eq('id', userRow.company_id)
      .maybeSingle();

    if (company?.ksef_token) setHasExisting(true);
    setLastSynced((company as any)?.ksef_last_synced_at ?? null);
    setTokenCreatedAt(company?.ksef_token_created_at ?? null);
  }, [user]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  const validateToken = async () => {
    if (!token.trim()) return;
    setValidation('validating');
    setValidationError('');
    try {
      const res = await fetch('/api/ksef/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setValidation('valid');
      } else {
        setValidation('invalid');
        setValidationError(data.error ?? 'Token validation failed');
      }
    } catch {
      setValidation('invalid');
      setValidationError('Could not reach the validation service');
    }
  };

  const saveToken = async () => {
    if (!companyId || !token.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ ksef_token: token.trim(), ksef_token_created_at: new Date().toISOString() })
      .eq('id', companyId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setHasExisting(true);
      setToken('');
      setValidation('idle');
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleSync = async () => {
    if (!companyId) return;
    setSyncState('syncing');
    setSyncResult(null);
    try {
      const summary = await syncInvoices(companyId);
      const now = new Date().toISOString();
      await supabase.from('companies').update({ ksef_last_synced_at: now } as any).eq('id', companyId);
      setLastSynced(now);
      setSyncState('success');
      setSyncResult({ total: summary.total, newInvoices: summary.newInvoices, errors: summary.errors.length });
      setTimeout(() => setSyncState('idle'), 6000);
    } catch {
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 5000);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">{t.ksef.howToTitle}</CardTitle>
          </div>
          <CardDescription>
            {t.ksef.howToDesc}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4">
            {INSTRUCTIONS.map((item) => (
              <li key={item.step} className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 mt-0.5">
                  {item.step}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                      {item.linkLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              {t.ksef.testEnvWarning}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-base">{t.ksef.apiTokenTitle}</CardTitle>
            </div>
            {hasExisting && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                <Check className="mr-1 h-3 w-3" />{t.ksef.tokenConfigured}
              </Badge>
            )}
          </div>
          <CardDescription>
            {hasExisting ? (
              <>{t.ksef.tokenSaved}{tokenCreatedAt && <span className="ml-1 text-muted-foreground">{t.ksef.addedRelative(formatRelative(tokenCreatedAt) ?? '')}</span>}</>
            ) : (
              <>{t.ksef.tokenNew}{tokenCreatedAt && <span className="ml-1 text-muted-foreground">{t.ksef.addedRelative(formatRelative(tokenCreatedAt) ?? '')}</span>}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="ksefToken">{t.ksef.tokenLabel}</Label>
            <div className="relative flex-1">
              <Input
                id="ksefToken"
                type={showToken ? 'text' : 'password'}
                placeholder={hasExisting ? t.ksef.tokenPlaceholderExisting : t.ksef.tokenPlaceholderNew}
                value={token}
                onChange={(e) => { setToken(e.target.value); setValidation('idle'); setValidationError(''); }}
                className={cn('pr-20 font-mono text-sm',
                  validation === 'valid' && 'border-emerald-400 focus-visible:ring-emerald-400',
                  validation === 'invalid' && 'border-rose-400 focus-visible:ring-rose-400')}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {token && (
                  <button type="button" onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button type="button" onClick={() => setShowToken((v) => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            {validation === 'valid' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />{t.ksef.tokenValidated}
              </div>
            )}
            {validation === 'invalid' && (
              <div className="flex items-center gap-1.5 text-xs text-rose-700">
                <ShieldAlert className="h-3.5 w-3.5" />{validationError}
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={validateToken} disabled={!token.trim() || validation === 'validating'} className="gap-2">
              {validation === 'validating' ? <><Loader2 className="h-4 w-4 animate-spin" />{t.ksef.validating}</> : <><ShieldCheck className="h-4 w-4" />{t.ksef.validateToken}</>}
            </Button>
            <Button onClick={saveToken} disabled={!token.trim() || saving || saved} className="gap-2 bg-blue-600 hover:bg-blue-700">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />{t.ksef.savingToken}</> : saved ? <><Check className="h-4 w-4" />{t.ksef.savedToken}</> : t.ksef.saveToken}
            </Button>
          </div>

          <div className="rounded-lg bg-slate-50 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-slate-700">{t.ksef.securityNote}</span>{' '}
              {t.ksef.securityNoteDesc}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">{t.ksef.syncTitle}</CardTitle>
          </div>
          <CardDescription>
            {t.ksef.syncDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{t.ksef.lastSynced}</p>
              <p className="text-xs text-muted-foreground">
                {lastSynced ? formatRelative(lastSynced) : t.common.neverSynced}
              </p>
            </div>
            {lastSynced && (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {new Date(lastSynced).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {syncState === 'success' && syncResult && (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-xs text-emerald-800">
                <p className="font-semibold">{t.ksef.syncCompleted}</p>
                <p>{t.ksef.syncCompletedDetail(syncResult.total, syncResult.newInvoices, syncResult.errors)}</p>
              </div>
            </div>
          )}

          {syncState === 'error' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
              <div className="text-xs text-rose-800">
                <p className="font-semibold">{t.ksef.syncFailed}</p>
                <p>{t.ksef.syncFailedDetail}</p>
              </div>
            </div>
          )}

          <Button onClick={handleSync} disabled={!hasExisting || syncState === 'syncing'} className="gap-2 bg-blue-600 hover:bg-blue-700">
            {syncState === 'syncing' ? <><Loader2 className="h-4 w-4 animate-spin" />{t.ksef.syncing}</> : <><RefreshCw className="h-4 w-4" />{t.ksef.syncNow}</>}
          </Button>

          {!hasExisting && (
            <p className="text-xs text-muted-foreground">{t.ksef.configureFirst}</p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
