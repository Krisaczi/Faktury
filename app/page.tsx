import Link from 'next/link';
import { Shield, CircleCheck as CheckCircle, TrendingUp, Building2, ChartBar as FileBarChart2, Upload, ArrowRight, Star, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: Building2,
    title: 'Vendor Management',
    desc: 'Centralize all your third-party vendors. Track relationships, status, and risk scores in one place.',
  },
  {
    icon: FileBarChart2,
    title: 'Risk Reports',
    desc: 'Generate comprehensive risk assessments with automated scoring. Instantly see critical, high, medium, and low risks.',
  },
  {
    icon: Upload,
    title: 'Document Upload',
    desc: 'Upload vendor contracts, SOC 2 reports, and questionnaires. Our engine processes and extracts risk signals automatically.',
  },
  {
    icon: TrendingUp,
    title: 'Real-time Monitoring',
    desc: 'Continuous monitoring with instant alerts when vendor risk levels change. Never miss a critical issue.',
  },
  {
    icon: Shield,
    title: 'Compliance Ready',
    desc: 'Built-in frameworks aligned to SOC 2, ISO 27001, and NIST standards. Export audit-ready reports.',
  },
  {
    icon: CheckCircle,
    title: 'Role-based Access',
    desc: 'Granular permission controls for teams. Admins, reviewers, and viewers — everyone gets the right access.',
  },
];

const stats = [
  { value: '500+', label: 'Enterprises trust us' },
  { value: '2M+', label: 'Vendors monitored' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '<2min', label: 'Avg risk report time' },
];

const testimonials = [
  {
    text: 'RiskGuard cut our vendor review time by 70%. The automated risk scoring is genuinely impressive.',
    name: 'Sarah Chen',
    role: 'Head of Security',
    company: 'TechCorp',
  },
  {
    text: 'We went from spreadsheets to a fully auditable vendor risk program in a week. Game changer.',
    name: 'Marcus Williams',
    role: 'CISO',
    company: 'FinanceFlow',
  },
  {
    text: 'The real-time alerts caught a critical vendor issue before it became a breach. Worth every penny.',
    name: 'Priya Patel',
    role: 'Risk Manager',
    company: 'HealthTech',
  },
];

const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    desc: 'Perfect for small teams getting started with vendor risk.',
    features: ['Up to 25 vendors', '10 risk reports/month', 'File uploads', 'Email support'],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/month',
    desc: 'For growing security teams with advanced needs.',
    features: ['Unlimited vendors', 'Unlimited reports', 'API access', 'Priority support', 'Custom frameworks'],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'Tailored for large organizations with complex requirements.',
    features: ['White-labeling', 'SSO / SAML', 'Dedicated CSM', 'SLA guarantee', 'On-premise option'],
    cta: 'Contact sales',
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">RiskGuard</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Customers</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/demo">
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white gap-1.5">
                <Play className="w-3.5 h-3.5" />
                Live demo
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                Sign in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-50 dark:bg-blue-950/30 rounded-full blur-3xl opacity-60" />
        </div>
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-6 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-sm px-3 py-1">
            Trusted by 500+ security teams
          </Badge>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight">
            Vendor risk management{' '}
            <span className="text-blue-600 dark:text-blue-400">that actually works</span>
          </h1>
          <p className="mt-6 text-xl text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Identify, assess, and monitor third-party vendor risk in real time. Stop relying on spreadsheets and start making data-driven decisions.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-8 text-base shadow-lg shadow-blue-600/20">
                Start free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base border-slate-200 dark:border-slate-700 gap-2">
                <Play className="w-4 h-4 text-blue-600" />
                Try live demo
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
            No credit card required · 14-day free trial · Cancel anytime
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Everything you need to manage vendor risk
            </h2>
            <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              From onboarding to continuous monitoring, RiskGuard covers the entire vendor risk lifecycle.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-4 sm:px-6 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Loved by security teams
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {testimonials.map(({ text, name, role, company }) => (
              <div
                key={name}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <div className="flex mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
                  &ldquo;{text}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {role} · {company}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
              Start free, scale as you grow.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 items-start">
            {plans.map(({ name, price, period, desc, features: planFeatures, cta, highlight }) => (
              <div
                key={name}
                className={`p-6 rounded-2xl border transition-all duration-200 ${
                  highlight
                    ? 'border-blue-500 bg-blue-600 text-white shadow-xl shadow-blue-600/20 scale-105'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md'
                }`}
              >
                {highlight && (
                  <Badge className="mb-3 bg-white/20 text-white border-0 text-xs">
                    Most popular
                  </Badge>
                )}
                <h3 className={`font-bold text-lg ${highlight ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={`text-4xl font-bold ${highlight ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                    {price}
                  </span>
                  <span className={`text-sm ${highlight ? 'text-blue-200' : 'text-slate-400'}`}>{period}</span>
                </div>
                <p className={`mt-2 text-sm ${highlight ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  {desc}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {planFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-blue-200' : 'text-emerald-500'}`} />
                      <span className={highlight ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="block mt-6">
                  <Button
                    className={`w-full ${
                      highlight
                        ? 'bg-white text-blue-600 hover:bg-blue-50'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                    size="sm"
                  >
                    {cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-10 rounded-3xl bg-blue-600 text-white shadow-2xl shadow-blue-600/20">
            <h2 className="text-3xl font-bold mb-4">
              Start protecting your organization today
            </h2>
            <p className="text-blue-100 mb-8 text-lg">
              Join 500+ security teams who trust RiskGuard to manage their vendor risk.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 h-12 px-8 text-base font-semibold">
                  Start your free trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button size="lg" variant="ghost" className="text-white hover:bg-white/10 h-12 px-8 text-base gap-2 border border-white/30">
                  <Play className="w-4 h-4" />
                  Try live demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">RiskGuard</span>
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} RiskGuard. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-slate-400 dark:text-slate-500">
            <a href="#" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
