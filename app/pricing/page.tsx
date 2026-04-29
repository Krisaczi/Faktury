export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Check, Zap, TriangleAlert as AlertTriangle, Clock, ShieldCheck, ChartBar as BarChart3, FileText, RefreshCw, Bell, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LemonSqueezyEmbed } from '@/components/pricing/lemon-squeezy-embed';

const LEMON_SQUEEZY_CHECKOUT_URL =
  process.env.NEXT_PUBLIC_LEMON_SQUEEZY_CHECKOUT_URL ??
  'https://app.lemonsqueezy.com/checkout';

const benefits = [
  {
    icon: RefreshCw,
    title: 'Automated KSeF Sync',
    description:
      'Invoices pulled directly from the National e-Invoice System in real time — no manual exports.',
  },
  {
    icon: BarChart3,
    title: 'Advanced Risk Analytics',
    description:
      'Multi-factor risk scoring across financial, compliance, and operational dimensions for every vendor.',
  },
  {
    icon: FileText,
    title: 'Unlimited Invoices & Vendors',
    description:
      'No caps on invoice volume or the number of vendors you manage. Scale without limits.',
  },
  {
    icon: Bell,
    title: 'Weekly Summary Emails',
    description:
      'Automated digest of new invoices, risk changes, and overdue items delivered to your inbox.',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance Monitoring',
    description:
      'Continuous checks against VAT white-list and NIP validation to stay audit-ready at all times.',
  },
  {
    icon: Lock,
    title: 'Enterprise-grade Security',
    description:
      'Row-level security, encrypted tokens, and SOC-2-ready infrastructure powering every account.',
  },
];

const faqs = [
  {
    q: 'What happens to my data after the trial?',
    a: 'All your invoices, vendors, and reports are safely preserved. Subscribe at any time to regain full access instantly.',
  },
  {
    q: 'What is KSeF integration?',
    a: "KSeF (Krajowy System e-Faktur) is Poland's National e-Invoice System. We connect directly to the KSeF API to automate invoice processing.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your account settings at any time. You keep access until the end of the billing period.',
  },
  {
    q: 'What currencies are supported?',
    a: 'PLN, EUR, USD, and GBP with automatic conversion for reporting.',
  },
];

async function getTrialInfo() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!userRecord?.company_id) return null;

    const { data: company } = await supabase
      .from('companies')
      .select('trial_start, trial_end, subscription_status, name')
      .eq('id', userRecord.company_id)
      .maybeSingle();

    if (!company) return null;

    const now = new Date();
    const isActive = company.subscription_status === 'active';
    const trialEnd = company.trial_end ? new Date(company.trial_end) : null;
    const isTrialActive = trialEnd ? now < trialEnd : false;
    const daysRemaining = trialEnd
      ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    let status: 'active' | 'trial_active' | 'trial_expired';
    if (isActive) {
      status = 'active';
    } else if (isTrialActive) {
      status = 'trial_active';
    } else {
      status = 'trial_expired';
    }

    return {
      companyName: company.name,
      status,
      daysRemaining,
      trialEnd,
    };
  } catch {
    return null;
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  const trialInfo = await getTrialInfo();
  const isExpired = trialInfo?.status === 'trial_expired';
  const isTrialActive = trialInfo?.status === 'trial_active';
  const redirectMessage = searchParams?.message;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">KSeFApp</span>
          </Link>
          <div className="flex items-center gap-3">
            {trialInfo ? (
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  Back to Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {(isExpired || redirectMessage) && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto flex max-w-6xl items-start gap-3 px-6 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">
                {redirectMessage ?? 'Your trial has ended.'}
              </p>
              <p className="mt-0.5 text-sm text-red-700">
                To continue syncing invoices from KSeF and receiving risk analysis,
                please activate your subscription.
              </p>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        {trialInfo && trialInfo.status !== 'active' && (
          <div className="mb-12 flex justify-center">
            {isTrialActive ? (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-6 py-3.5">
                <Clock className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  {trialInfo.daysRemaining === 1
                    ? '1 day remaining in your free trial'
                    : `${trialInfo.daysRemaining} days remaining in your free trial`}
                </span>
                <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                  Trial active
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-3.5">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  Your 7-day free trial has ended
                </span>
                <Badge className="bg-red-600 text-white hover:bg-red-600">
                  Expired
                </Badge>
              </div>
            )}
          </div>
        )}

        <div className="mb-14 text-center">
          <Badge className="mb-4 bg-blue-50 text-blue-700 hover:bg-blue-50">
            Professional Plan
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Everything you need to manage
            <br />
            <span className="text-blue-600">KSeF invoices with confidence</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            One flat price. Unlimited invoices. Automated risk analysis. Direct KSeF
            integration.
          </p>
        </div>

        <div className="mx-auto mb-16 grid max-w-5xl gap-8 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-border bg-white p-8 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                Most popular
              </Badge>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Professional</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For businesses actively managing KSeF invoices and vendor risk
            </p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-5xl font-extrabold text-slate-900">PLN&nbsp;149</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Billed monthly. Cancel anytime.</p>

            <ul className="mb-8 mt-8 flex flex-1 flex-col gap-3">
              {[
                'Unlimited invoices synced from KSeF',
                'Unlimited vendors with risk scoring',
                'Advanced financial & compliance analytics',
                'Weekly risk summary emails',
                'VAT white-list & NIP validation',
                'Priority email support',
                'Bulk CSV export',
                'Audit log access',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Check className="h-3 w-3 text-blue-600" />
                  </div>
                  <span className="text-sm text-slate-700">{feature}</span>
                </li>
              ))}
            </ul>

            <LemonSqueezyEmbed checkoutUrl={LEMON_SQUEEZY_CHECKOUT_URL} />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Secure checkout powered by Lemon Squeezy
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={benefit.title}
                  className="flex items-start gap-4 rounded-xl border border-border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{benefit.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-16 rounded-2xl border border-border bg-slate-900 p-10 text-white">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold">
              {isExpired
                ? 'Regain access in seconds'
                : 'Start your subscription today'}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-300">
              {isExpired
                ? 'Your data is safe and waiting. Activate your plan to pick up exactly where you left off — invoices, vendors, and risk reports all intact.'
                : 'Join businesses already using KSeFApp to automate invoice processing and monitor vendor risk in real time.'}
            </p>
            <div className="mt-8">
              <LemonSqueezyEmbed checkoutUrl={LEMON_SQUEEZY_CHECKOUT_URL} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-10">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900">
            Frequently asked questions
          </h2>
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 md:grid-cols-2">
            {faqs.map(({ q, a }) => (
              <div key={q}>
                <p className="font-semibold text-slate-900">{q}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-xs text-muted-foreground">
          <p>2024 KSeFApp. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
