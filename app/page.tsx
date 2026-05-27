import Link from 'next/link';
import { Shield, CircleCheck as CheckCircle, TrendingUp, Building2, ChartBar as FileBarChart2, Upload, ArrowRight, Star, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HomepageStatsSection } from '@/components/homepage/stats-section';
import { HomepageFooter } from '@/components/homepage/homepage-footer';

const features = [
  {
    icon: Building2,
    title: 'Zarządzanie dostawcami',
    desc: 'Monitoruj wszystkich swoich dostawców. Śledź relacje, status i ocenę ryzyka w jednym miejscu.',
  },
  {
    icon: FileBarChart2,
    title: 'Raporty ryzyka',
    desc: 'Generuj kompleksowe oceny ryzyka z automatycznym scoringiem. Natychmiast zobacz poziom ryzyka krytycznego, wysokiego, średniego i niskiego.',
  },
  {
    icon: Upload,
    title: 'Wczytywanie dokumentów',
    desc: 'Prześlij umowy z dostawcami, raporty SOC 2 i kwestionariusze. Nasz program automatycznie przetwarza i wyodrębnia sygnały ryzyka.',
  },
  {
    icon: TrendingUp,
    title: 'Monitoring w czasie rzeczywistym',
    desc: 'Ciągły monitoring z natychmiastowymi alertami w przypadku zmiany poziomu ryzyka dostawcy. Nigdy nie przegap krytycznego problemu.',
  },
  {
    icon: Shield,
    title: 'Przygotowany do audytu',
    desc: 'Wbudowane narzędzia zgodne ze standardami SOC 2, ISO 27001 i NIST. Eksport raportów gotowych do audytu.',
  },
  {
    icon: CheckCircle,
    title: 'Kontrola dostępu',
    desc: 'Szczegółowa kontrola uprawnień dla zespołów. Administratorzy, recenzenci i przeglądający — każdy ma odpowiedni dostęp..',
  },
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
    price: 'PLN 149',
    period: '/miesięcznie',
    desc: 'Idealny dla małych firm, które chcą wdrożyć VMD',
    features: ['Do 25 dostawców', '10 raportów miesięcznie', 'Wczytywanie plików', 'Wsparcie email'],
    cta: 'Rozpocznij bezpłatny okres próbny',
    highlight: false,
  },
  {
    name: 'Pro',
    price: 'PLN 499',
    period: '/miesięcznie',
    desc: 'Dla rozwijających się firm o zaawansowanych potrzebach.',
    features: ['Nielimitowana liczba dostawców', 'Nielimitowane raporty', 'Priorytetowe wsparcie',],
    cta: 'Rozpocznij bezpłatny okres próbny',
    highlight: true,
  },
  {
    name: 'Przedsiębiorstwa',
    price: 'w zależności od wymagań',
    period: '',
    desc: 'Dostosowane do dużych organizacji o złożonych wymaganiach.',
    features: ['White-labeling', 'SSO / SAML', 'Dedykowany CSM', 'Gwarantowane SLA', 'Wizyty studyjne'],
    cta: 'Skontaktuj się z nami',
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
            <span className="font-bold text-lg tracking-tight">BezpieczneFaktury</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Usługi</a>
            <a href="#pricing" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Cennik</a>
            <a href="#testimonials" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Opinie</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/demo">
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white gap-1.5">
                <Play className="w-3.5 h-3.5" />
                Demo
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                Zaloguj się
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                Zapisz się
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
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight">
           Zarządzanie danymi dostawców,{' '}
            <span className="text-blue-600 dark:text-blue-400">które naprawdę działa</span>
          </h1>
          <p className="mt-6 text-xl text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Identyfikuj, oceniaj i monitoruj dane dostawców w czasie rzeczywistym. Przestań polegać na arkuszach kalkulacyjnych i zacznij podejmować decyzje w oparciu o dane.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-8 text-base shadow-lg shadow-blue-600/20">
                Rozpocznij bezpłatny okres próbny
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base border-slate-200 dark:border-slate-700 gap-2">
                Sign up
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
            Bez karty kredytowej · 14 dniowy okres próbny · Anuluj w dowolnym momencie
          </p>
        </div>
      </section>

      {/* Stats */}
      <HomepageStatsSection />

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Wszystko, czego potrzebujesz, aby zarządzać danymi dostawców 
            </h2>
            <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              BezpieczneFaktury obejmują cały cykl życia ryzyka dostawcy – od wdrażania po ciągły monitoring.
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

      {/* Testimonials 
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
      */}

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              Prosty i przejrzysty cennik
            </h2>
            <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
              Zacznij za darmo, dostosuj pakiet w miarę rozwoju.
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
                    Najpopularniejszy
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
              Zacznij chronić swoją firmę już dziś
            </h2>
            <p className="text-blue-100 mb-8 text-lg">
              Dołącz do firm, które zaufały BezpieczneFaktury w zakresie zarządzania kontrolą nad danymi dostawców.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 h-12 px-8 text-base font-semibold">
                  Rozpocznij bezpłatny okres próbny
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" variant="ghost" className="text-white hover:bg-white/10 h-12 px-8 text-base border border-white/30">
                  Zapisz się
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <HomepageFooter />
    </div>
  );
}
