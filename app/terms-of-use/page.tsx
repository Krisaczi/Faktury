'use client';

import Link from 'next/link';
import { Shield, Mail, FileText, Printer, Scale } from 'lucide-react';

const SECTIONS = [
  { id: 'ogolne',          label: '§1. Informacje ogólne' },
  { id: 'usługodawca',     label: '§2. Dane usługodawcy' },
  { id: 'zakres',          label: '§3. Zakres usług' },
  { id: 'warunki',         label: '§4. Warunki korzystania' },
  { id: 'umowa',           label: '§5. Zawarcie i rozwiązanie umowy' },
  { id: 'odpowiedzialnosc-uslugodawcy', label: '§6. Odpowiedzialność usługodawcy' },
  { id: 'odpowiedzialnosc-uzytkownika', label: '§7. Odpowiedzialność użytkownika' },
  { id: 'platnosci',       label: '§8. Płatności i rozliczenia' },
  { id: 'wlasnosc',        label: '§9. Własność intelektualna' },
  { id: 'dane-osobowe',    label: '§10. Dane osobowe' },
  { id: 'reklamacje',      label: '§11. Reklamacje' },
  { id: 'zmiany',          label: '§12. Zmiany regulaminu' },
  { id: 'postanowienia',   label: '§13. Postanowienia końcowe' },
];

export default function TermsOfUsePage() {
  const updated = '19 maja 2026';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top navigation */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              RiskGuard
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.print()}
              className="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <Printer className="w-4 h-4" />
              Drukuj / PDF
            </button>
            <Link
              href="/login"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Zaloguj się
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 flex gap-10">
        {/* Sticky sidebar TOC */}
        <aside className="hidden lg:block w-60 flex-shrink-0">
          <div className="sticky top-24">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Spis treści
            </p>
            <nav className="space-y-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:translate-x-0.5 transition-all py-0.5"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Header card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-8 py-8 mb-8 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  Regulamin świadczenia usług
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Platforma <strong className="text-slate-700 dark:text-slate-300">RiskGuard</strong>
                  &nbsp;· Ostatnia aktualizacja: <strong className="text-slate-700 dark:text-slate-300">{updated}</strong>
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <Scale className="w-3.5 h-3.5" />
                Prawo polskie
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Niniejszy Regulamin świadczenia usług drogą elektroniczną (dalej: <strong>„Regulamin"</strong>)
              określa zasady i warunki korzystania z platformy RiskGuard, zgodnie z ustawą z dnia
              18 lipca 2002 r. o świadczeniu usług drogą elektroniczną (Dz.U. 2002 nr 144 poz. 1204
              ze zm., dalej: „UŚUDE") oraz przepisami Kodeksu cywilnego. Przed rozpoczęciem korzystania
              z Serwisu prosimy o uważne zapoznanie się z treścią Regulaminu.
            </p>
          </div>

          <div className="space-y-8">

            {/* §1 Informacje ogólne */}
            <Section id="ogolne" title="§1. Informacje ogólne">
              <p>
                Platforma <strong>RiskGuard</strong> (dalej: <strong>„Serwis"</strong> lub
                <strong> „Platforma"</strong>) to usługa SaaS (Software as a Service) umożliwiająca
                przedsiębiorcom przetwarzanie faktur elektronicznych, analizę ryzyka kontrahentów,
                integrację z Krajowym Systemem e-Faktur (KSeF) oraz zarządzanie dokumentacją
                finansową.
              </p>
              <SubSection title="Definicje">
                <Table
                  headers={['Pojęcie', 'Definicja']}
                  rows={[
                    ['Usługodawca', 'RiskGuard Sp. z o.o. z siedzibą w Warszawie – podmiot prowadzący i udostępniający Serwis.'],
                    ['Użytkownik', 'Każda osoba fizyczna, prawna lub jednostka organizacyjna nieposiadająca osobowości prawnej, która korzysta z Serwisu na podstawie zawartej Umowy.'],
                    ['Konto', 'Indywidualne konto Użytkownika w Serwisie, dostępne po rejestracji, umożliwiające korzystanie z funkcji Platformy.'],
                    ['Firma / Organizacja', 'Podmiot gospodarczy, w imieniu którego działa Użytkownik. Jedno Konto może być powiązane z jedną Organizacją.'],
                    ['Usługa', 'Całokształt funkcjonalności udostępnianych w ramach Serwisu, w tym przetwarzanie faktur, analiza ryzyka, integracja z KSeF.'],
                    ['Faktura', 'Dokument księgowy (w szczególności plik XML w formacie KSeF) wczytany do Serwisu przez Użytkownika.'],
                    ['Kontrahent / Vendor', 'Podmiot (sprzedawca lub nabywca) widniejący na Fakturze, którego dane są przechowywane i analizowane w Serwisie.'],
                    ['Subskrypcja', 'Odpłatny dostęp do pełnych funkcji Serwisu, naliczany cyklicznie zgodnie z wybranym planem.'],
                    ['Plan', 'Wariant cenowy Subskrypcji określający zakres dostępnych funkcji i limity.'],
                    ['Regulamin', 'Niniejszy dokument regulujący zasady korzystania z Serwisu.'],
                    ['UŚUDE', 'Ustawa z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.'],
                    ['RODO', 'Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r.'],
                  ]}
                />
              </SubSection>
            </Section>

            {/* §2 Dane usługodawcy */}
            <Section id="usługodawca" title="§2. Dane usługodawcy">
              <InfoCard>
                <InfoRow label="Nazwa">RiskGuard Sp. z o.o.</InfoRow>
                <InfoRow label="Adres">ul. Testowa 1, 01-001 Warszawa, Polska</InfoRow>
                <InfoRow label="NIP">0000000000</InfoRow>
                <InfoRow label="REGON">000000000</InfoRow>
                <InfoRow label="KRS">0000000000</InfoRow>
                <InfoRow label="E-mail kontaktowy">
                  <a href="mailto:kontakt@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                    kontakt@riskguard.pl
                  </a>
                </InfoRow>
                <InfoRow label="E-mail do spraw prawnych">
                  <a href="mailto:legal@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                    legal@riskguard.pl
                  </a>
                </InfoRow>
              </InfoCard>
              <p>
                Usługodawca jest wpisany do rejestru przedsiębiorców Krajowego Rejestru Sądowego
                prowadzonego przez Sąd Rejonowy dla m.st. Warszawy w Warszawie, XII Wydział
                Gospodarczy KRS.
              </p>
            </Section>

            {/* §3 Zakres usług */}
            <Section id="zakres" title="§3. Zakres i charakter usług">
              <p>
                W ramach Serwisu Usługodawca świadczy na rzecz Użytkowników następujące usługi
                drogą elektroniczną:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Rejestracja i zarządzanie kontem</strong> – tworzenie konta, logowanie,
                  zarządzanie profilem użytkownika i organizacji, obsługa hasła i sesji.
                </li>
                <li>
                  <strong>Wczytywanie i przetwarzanie faktur</strong> – przesyłanie plików XML
                  (format KSeF), ich parsowanie, ekstrakcja danych, walidacja struktury oraz
                  przechowywanie w bazie danych.
                </li>
                <li>
                  <strong>Integracja z KSeF</strong> – pobieranie faktur elektronicznych z
                  Krajowego Systemu e-Faktur Ministerstwa Finansów na podstawie danych dostępowych
                  przekazanych przez Użytkownika.
                </li>
                <li>
                  <strong>Analiza ryzyka kontrahentów</strong> – automatyczne wykrywanie anomalii,
                  duplikatów faktur, zmian rachunków bankowych oraz generowanie wskaźników ryzyka.
                  Wyniki analizy mają charakter wyłącznie informacyjny.
                </li>
                <li>
                  <strong>Zarządzanie kontrahentami</strong> – przechowywanie, przeglądanie i
                  kategoryzacja danych kontrahentów, historia transakcji, eksport danych.
                </li>
                <li>
                  <strong>Przechowywanie dokumentów</strong> – udostępnianie podglądu faktur
                  (PDF/XML), pobieranie plików źródłowych.
                </li>
                <li>
                  <strong>Raporty i eksport danych</strong> – generowanie raportów ryzyka, eksport
                  do formatu CSV.
                </li>
                <li>
                  <strong>Subskrypcja i rozliczenia</strong> – zarządzanie planem abonamentowym,
                  obsługa płatności, wystawianie potwierdzeń.
                </li>
              </ol>
              <p>
                Usługodawca zastrzega sobie prawo do rozszerzania, modyfikowania lub wycofywania
                poszczególnych funkcji Serwisu, z zachowaniem praw Użytkowników wynikających z
                aktywnych Subskrypcji.
              </p>
            </Section>

            {/* §4 Warunki korzystania */}
            <Section id="warunki" title="§4. Warunki korzystania z Serwisu">
              <SubSection title="Wymagania techniczne">
                <p>
                  Do korzystania z Serwisu niezbędne jest posiadanie:
                </p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>urządzenia z dostępem do Internetu (komputer, tablet, smartfon),</li>
                  <li>aktualnej przeglądarki internetowej obsługującej JavaScript (Chrome ≥ 90, Firefox ≥ 88, Edge ≥ 90, Safari ≥ 14),</li>
                  <li>aktywnego adresu e-mail,</li>
                  <li>włączonej obsługi plików cookies (wymagane do uwierzytelnienia).</li>
                </ul>
              </SubSection>
              <SubSection title="Obowiązki Użytkownika">
                <p>Użytkownik zobowiązuje się do:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>podawania prawdziwych, aktualnych i kompletnych danych podczas rejestracji i korzystania z Serwisu,</li>
                  <li>zachowania w poufności danych dostępowych (hasła, tokenów API) i nieudostępniania ich osobom trzecim,</li>
                  <li>niezwłocznego powiadomienia Usługodawcy o podejrzeniu nieuprawnionego dostępu do Konta,</li>
                  <li>korzystania z Serwisu zgodnie z obowiązującym prawem, dobrymi obyczajami i postanowieniami niniejszego Regulaminu,</li>
                  <li>nienaruszania praw osób trzecich, w szczególności praw własności intelektualnej.</li>
                </ul>
              </SubSection>
              <SubSection title="Działania zabronione">
                <p>Użytkownikowi zabrania się w szczególności:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>wczytywania do Serwisu treści bezprawnych, w szczególności naruszających przepisy prawa lub prawa osób trzecich,</li>
                  <li>podejmowania prób nieautoryzowanego dostępu do systemów Usługodawcy lub innych Użytkowników,</li>
                  <li>prowadzenia jakichkolwiek działań mogących zakłócić prawidłowe funkcjonowanie Serwisu (ataki DoS, skanowanie portów, fuzzing),</li>
                  <li>automatycznego pozyskiwania danych z Serwisu (scraping) bez uprzedniej pisemnej zgody Usługodawcy,</li>
                  <li>odtwarzania, dekompilowania lub dezasemblowania kodu źródłowego Serwisu,</li>
                  <li>odsprzedaży lub sublicencjonowania dostępu do Serwisu bez zgody Usługodawcy,</li>
                  <li>korzystania z Serwisu w celu świadczenia usług konkurencyjnych wobec Usługodawcy (benchmarking w złej wierze).</li>
                </ul>
              </SubSection>
              <SubSection title="Wiek i zdolność prawna">
                <p>
                  Z Serwisu mogą korzystać wyłącznie osoby, które ukończyły 18 lat i posiadają
                  pełną zdolność do czynności prawnych lub działają w imieniu osoby prawnej
                  lub jednostki organizacyjnej posiadającej zdolność prawną.
                </p>
              </SubSection>
            </Section>

            {/* §5 Umowa */}
            <Section id="umowa" title="§5. Zawarcie i rozwiązanie umowy">
              <SubSection title="Zawarcie umowy">
                <p>
                  Umowa o świadczenie usług drogą elektroniczną zostaje zawarta z chwilą
                  skutecznego założenia Konta w Serwisie, tj. po wypełnieniu formularza
                  rejestracyjnego, zaakceptowaniu niniejszego Regulaminu oraz Polityki
                  Prywatności i potwierdzeniu rejestracji (o ile weryfikacja e-mail jest
                  wymagana). W przypadku Subskrypcji płatnej umowa obejmuje również akceptację
                  warunków wybranego Planu i realizację płatności.
                </p>
              </SubSection>
              <SubSection title="Czas trwania umowy">
                <p>
                  Umowa o świadczenie bezpłatnych usług (dostęp do konta) jest zawarta na czas
                  nieokreślony. Umowa Subskrypcji płatnej jest zawarta na okres rozliczeniowy
                  wybranego Planu (miesięczny lub roczny) i automatycznie odnawia się na kolejny
                  okres, chyba że Użytkownik ją wypowie przed końcem bieżącego okresu.
                </p>
              </SubSection>
              <SubSection title="Rozwiązanie umowy przez Użytkownika">
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>Użytkownik może w każdej chwili usunąć Konto w ustawieniach Serwisu lub przesyłając żądanie na adres <a href="mailto:kontakt@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">kontakt@riskguard.pl</a>.</li>
                  <li>Wypowiedzenie Subskrypcji jest skuteczne na koniec bieżącego okresu rozliczeniowego. Do tego momentu Użytkownik zachowuje pełen dostęp.</li>
                  <li>Usunięcie Konta powoduje trwałe usunięcie danych zgodnie z Polityką Prywatności, z zastrzeżeniem danych, które muszą być przechowywane na podstawie obowiązujących przepisów prawa.</li>
                </ul>
              </SubSection>
              <SubSection title="Rozwiązanie umowy przez Usługodawcę">
                <p>
                  Usługodawca może rozwiązać umowę ze skutkiem natychmiastowym lub zawiesić
                  dostęp do Konta, jeżeli Użytkownik:
                </p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>narusza postanowienia niniejszego Regulaminu lub obowiązujące przepisy prawa,</li>
                  <li>podał nieprawdziwe dane podczas rejestracji,</li>
                  <li>zalega z płatnościami przez co najmniej 14 dni od terminu wymagalności,</li>
                  <li>podejmuje działania zagrażające bezpieczeństwu Serwisu lub innych Użytkowników.</li>
                </ul>
                <p className="mt-2">
                  W pozostałych przypadkach Usługodawca może wypowiedzieć umowę z zachowaniem
                  30-dniowego okresu wypowiedzenia, informując Użytkownika drogą e-mailową.
                </p>
              </SubSection>
            </Section>

            {/* §6 Odpowiedzialność usługodawcy */}
            <Section id="odpowiedzialnosc-uslugodawcy" title="§6. Odpowiedzialność Usługodawcy">
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  Usługodawca zobowiązuje się do dołożenia należytej staranności w celu zapewnienia
                  ciągłości i poprawności działania Serwisu, jednak <strong>nie gwarantuje
                  nieprzerwanego dostępu</strong> do Serwisu. Przerwy techniczne, w szczególności
                  związane z konserwacją, aktualizacją lub awariami, nie stanowią podstawy do
                  roszczeń odszkodowawczych.
                </li>
                <li>
                  Usługodawca <strong>nie ponosi odpowiedzialności</strong> za szkody wynikające z:
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>nieprawidłowych, niekompletnych lub fałszywych danych wprowadzonych przez Użytkownika,</li>
                    <li>niedostępności lub błędów zewnętrznych systemów, w tym KSeF Ministerstwa Finansów,</li>
                    <li>działania lub zaniechania podmiotów trzecich (operatorów sieci, dostawców usług płatniczych),</li>
                    <li>siły wyższej (zdarzenia losowe, klęski żywiołowe, działania wojenne, cyberataki na infrastrukturę zewnętrzną),</li>
                    <li>decyzji biznesowych podjętych przez Użytkownika na podstawie wyników analizy ryzyka generowanych przez Serwis.</li>
                  </ul>
                </li>
                <li>
                  Wyniki analizy ryzyka (risk score, flagi, raporty) są generowane automatycznie
                  i mają charakter <strong>wyłącznie informacyjny i pomocniczy</strong>. Nie
                  stanowią porady prawnej, podatkowej ani finansowej. Ostateczna ocena i decyzja
                  należy zawsze do Użytkownika.
                </li>
                <li>
                  Całkowita odpowiedzialność Usługodawcy wobec Użytkownika z tytułu niewykonania
                  lub nienależytego wykonania Umowy jest ograniczona do kwoty opłat uiszczonych
                  przez Użytkownika w ciągu 3 miesięcy poprzedzających zdarzenie powodujące szkodę,
                  chyba że szkoda wynikła z winy umyślnej Usługodawcy.
                </li>
                <li>
                  Ograniczenia odpowiedzialności, o których mowa powyżej, nie dotyczą konsumentów
                  w zakresie, w jakim przepisy prawa bezwzględnie obowiązującego nie dopuszczają
                  takich ograniczeń.
                </li>
              </ol>
            </Section>

            {/* §7 Odpowiedzialność użytkownika */}
            <Section id="odpowiedzialnosc-uzytkownika" title="§7. Odpowiedzialność Użytkownika">
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  Użytkownik ponosi pełną odpowiedzialność za treści i dane wprowadzane do Serwisu,
                  w szczególności za prawdziwość, kompletność i legalność wczytywanych faktur oraz
                  danych kontrahentów.
                </li>
                <li>
                  Użytkownik odpowiada za wszelkie działania podejmowane za pośrednictwem swojego
                  Konta, w tym działania osób, którym udostępnił dane dostępowe.
                </li>
                <li>
                  W przypadku naruszenia przez Użytkownika postanowień Regulaminu lub przepisów
                  prawa, Użytkownik zobowiązany jest do naprawienia szkody wyrządzonej Usługodawcy
                  lub osobom trzecim na zasadach ogólnych Kodeksu cywilnego.
                </li>
                <li>
                  Użytkownik zapewnia, że posiada wszelkie uprawnienia niezbędne do przetwarzania
                  danych osobowych zawartych w wczytywanych dokumentach (w tym danych pracowników,
                  kontrahentów) i że przetwarzanie tych danych za pośrednictwem Serwisu jest zgodne
                  z obowiązującymi przepisami o ochronie danych osobowych.
                </li>
                <li>
                  Użytkownik ponosi odpowiedzialność za prawidłowe skonfigurowanie dostępu do KSeF
                  i za ważność przekazywanych danych uwierzytelniających.
                </li>
              </ol>
            </Section>

            {/* §8 Płatności */}
            <Section id="platnosci" title="§8. Płatności i rozliczenia">
              <SubSection title="Model subskrypcyjny">
                <p>
                  Serwis oferuje płatny dostęp w modelu subskrypcyjnym (SaaS). Dostępne plany,
                  ceny i zakres funkcji są opisane na stronie cennika Serwisu. Ceny podane są w
                  złotych polskich (PLN) lub euro (EUR), w zależności od wybranego planu, i są
                  cenami netto (bez VAT). Do ceny doliczany jest podatek VAT w wysokości obowiązującej
                  w Polsce (aktualnie 23%).
                </p>
              </SubSection>
              <SubSection title="Cykl rozliczeniowy">
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>Subskrypcja jest naliczana z góry za wybrany okres (miesięczny lub roczny).</li>
                  <li>Opłata jest pobierana automatycznie w dniu odnowienia Subskrypcji za pomocą metody płatności przypisanej do Konta.</li>
                  <li>Faktury/potwierdzenia płatności są przesyłane na adres e-mail Użytkownika przez operatora płatności.</li>
                </ul>
              </SubSection>
              <SubSection title="Okresy próbne">
                <p>
                  Usługodawca może udostępniać ograniczone bezpłatne okresy próbne (trial). Warunki
                  okresu próbnego są każdorazowo komunikowane w Serwisie. Po upływie okresu próbnego
                  dostęp do funkcji premium jest automatycznie blokowany do momentu aktywowania
                  Subskrypcji płatnej.
                </p>
              </SubSection>
              <SubSection title="Polityka zwrotów">
                <p>
                  Ze względu na cyfrowy charakter usługi, <strong>opłaty za Subskrypcję nie podlegają
                  zwrotowi</strong>, chyba że:
                </p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>Użytkownik jest konsumentem i odstępuje od umowy w ciągu 14 dni od jej zawarcia zgodnie z art. 27 ustawy z dnia 30 maja 2014 r. o prawach konsumenta, pod warunkiem że nie rozpoczął korzystania z usługi cyfrowej,</li>
                  <li>zwrot wynika z uzasadnionej reklamacji uwzględnionej przez Usługodawcę,</li>
                  <li>Usługodawca zaprzestaje świadczenia Serwisu przed upływem opłaconego okresu.</li>
                </ul>
              </SubSection>
              <SubSection title="Operator płatności">
                <p>
                  Płatności są obsługiwane przez zewnętrznego operatora (Lemon Squeezy lub inny
                  podmiot wskazany w Serwisie). Usługodawca nie przechowuje danych kart płatniczych.
                  Korzystanie z usług operatora płatności podlega jego własnym regulaminom.
                </p>
              </SubSection>
            </Section>

            {/* §9 Własność intelektualna */}
            <Section id="wlasnosc" title="§9. Prawa własności intelektualnej">
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  Wszelkie prawa własności intelektualnej do Serwisu, w tym kod źródłowy, projekt
                  graficzny, interfejs użytkownika, logotypy, znaki towarowe i dokumentacja, są
                  własnością Usługodawcy lub podmiotów, które udzieliły Usługodawcy licencji.
                  Są one chronione przepisami prawa autorskiego i praw pokrewnych, prawa o znakach
                  towarowych oraz innymi przepisami o ochronie własności intelektualnej.
                </li>
                <li>
                  Usługodawca udziela Użytkownikowi <strong>niewyłącznej, niezbywalnej, ograniczonej
                  licencji</strong> na korzystanie z Serwisu wyłącznie w zakresie niezbędnym do
                  korzystania z usług opisanych w Regulaminie, przez czas trwania Umowy.
                </li>
                <li>
                  Licencja, o której mowa w ust. 2, nie obejmuje w szczególności:
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>kopiowania, modyfikowania lub tworzenia dzieł zależnych na bazie Serwisu,</li>
                    <li>odtwarzania wstecznego (reverse engineering), dekompilowania lub dezasemblowania kodu,</li>
                    <li>usuwania lub modyfikowania oznaczeń praw autorskich lub informacji o prawach własności,</li>
                    <li>sublicencjonowania lub odsprzedaży dostępu do Serwisu.</li>
                  </ul>
                </li>
                <li>
                  Dane i dokumenty przesyłane przez Użytkownika (faktury, dane kontrahentów) pozostają
                  własnością Użytkownika lub jego kontrahentów. Użytkownik udziela Usługodawcy
                  ograniczonej licencji na przetwarzanie tych danych wyłącznie w celu świadczenia usług.
                </li>
                <li>
                  Opinie, sugestie i informacje zwrotne przekazywane przez Użytkowników mogą być
                  przez Usługodawcę wykorzystywane do ulepszania Serwisu bez obowiązku wynagrodzenia.
                </li>
              </ol>
            </Section>

            {/* §10 Dane osobowe */}
            <Section id="dane-osobowe" title="§10. Przetwarzanie danych osobowych">
              <p>
                Zasady przetwarzania danych osobowych Użytkowników i osób fizycznych, których dane
                są zawarte w przetwarzanych dokumentach, opisane są szczegółowo w{' '}
                <Link href="/privacy-policy" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Polityce Prywatności
                </Link>
                , stanowiącej integralną część niniejszego Regulaminu.
              </p>
              <p>
                Korzystając z Serwisu, Użytkownik przyjmuje do wiadomości, że:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>
                  Usługodawca przetwarza dane osobowe jako <strong>administrator danych</strong> w
                  odniesieniu do danych Użytkowników i ich pracowników.
                </li>
                <li>
                  W zakresie danych zawartych w fakturach i dokumentach, Usługodawca działa jako
                  <strong> podmiot przetwarzający</strong> na polecenie Użytkownika (który jest
                  administratorem tych danych), na podstawie odrębnej umowy powierzenia przetwarzania
                  danych (DPA), dostępnej na żądanie pod adresem{' '}
                  <a href="mailto:privacy@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                    privacy@riskguard.pl
                  </a>.
                </li>
                <li>
                  Użytkownik, przetwarzając za pośrednictwem Serwisu dane osobowe swoich kontrahentów
                  lub pracowników, jest odpowiedzialny za posiadanie właściwej podstawy prawnej tego
                  przetwarzania zgodnie z RODO.
                </li>
              </ul>
            </Section>

            {/* §11 Reklamacje */}
            <Section id="reklamacje" title="§11. Reklamacje">
              <SubSection title="Tryb składania reklamacji">
                <p>
                  Użytkownik może złożyć reklamację dotyczącą niewykonania lub nienależytego
                  wykonania Usługi w następujący sposób:
                </p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>
                    <strong>E-mailem</strong> na adres{' '}
                    <a href="mailto:kontakt@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                      kontakt@riskguard.pl
                    </a>{' '}
                    z tytułem wiadomości: „Reklamacja – [krótki opis problemu]"
                  </li>
                  <li>
                    <strong>Pisemnie</strong> na adres siedziby Usługodawcy: ul. Testowa 1,
                    01-001 Warszawa
                  </li>
                </ul>
              </SubSection>
              <SubSection title="Wymagana treść reklamacji">
                <p>Reklamacja powinna zawierać:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>imię i nazwisko lub nazwę firmy Użytkownika,</li>
                  <li>adres e-mail przypisany do Konta,</li>
                  <li>opis problemu z możliwie dokładnym wskazaniem daty i okoliczności zdarzenia,</li>
                  <li>oczekiwany sposób rozpatrzenia reklamacji (np. wyjaśnienie, zwrot opłaty).</li>
                </ul>
              </SubSection>
              <SubSection title="Rozpatrzenie reklamacji">
                <p>
                  Usługodawca rozpatruje reklamację i udziela odpowiedzi w terminie{' '}
                  <strong>14 dni roboczych</strong> od jej otrzymania, przesyłając odpowiedź na
                  adres e-mail Użytkownika. W przypadkach wymagających dodatkowych wyjaśnień
                  lub analiz termin może zostać przedłużony do 30 dni, o czym Użytkownik zostanie
                  poinformowany w pierwszej odpowiedzi.
                </p>
                <p className="mt-2">
                  Nierozpatrzenie reklamacji w terminie 30 dni oznacza jej uwzględnienie.
                </p>
              </SubSection>
              <SubSection title="Pozasądowe rozwiązywanie sporów">
                <p>
                  Użytkownik będący konsumentem ma prawo skorzystać z pozasądowych metod
                  rozwiązywania sporów, w szczególności:
                </p>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  <li>mediacji prowadzonej przez Inspekcję Handlową,</li>
                  <li>Stałych Polubownych Sądów Konsumenckich przy Inspekcji Handlowej,</li>
                  <li>
                    platformy ODR (Online Dispute Resolution) Komisji Europejskiej:{' '}
                    <a
                      href="https://ec.europa.eu/consumers/odr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      ec.europa.eu/consumers/odr
                    </a>.
                  </li>
                </ul>
              </SubSection>
            </Section>

            {/* §12 Zmiany */}
            <Section id="zmiany" title="§12. Zmiany Regulaminu">
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  Usługodawca zastrzega sobie prawo do zmiany niniejszego Regulaminu z ważnych
                  przyczyn, w szczególności w przypadku zmian przepisów prawa, zmian zakresu
                  świadczonych usług, decyzji organów regulacyjnych lub względów bezpieczeństwa.
                </li>
                <li>
                  O każdej zmianie Usługodawca informuje Użytkowników z co najmniej{' '}
                  <strong>14-dniowym wyprzedzeniem</strong> przed wejściem zmiany w życie,
                  wysyłając powiadomienie na adres e-mail powiązany z Kontem oraz wyświetlając
                  stosowny komunikat w Serwisie.
                </li>
                <li>
                  Jeżeli Użytkownik nie zgadza się z treścią zmienionego Regulaminu, ma prawo
                  wypowiedzieć umowę przed datą wejścia zmian w życie, usuwając Konto lub
                  kontaktując się z Usługodawcą. Kontynuowanie korzystania z Serwisu po dacie
                  wejścia zmian w życie oznacza akceptację nowego Regulaminu.
                </li>
                <li>
                  Zmiany nie będą miały wstecznego skutku wobec praw nabytych przez Użytkownika
                  przed datą ich wejścia w życie.
                </li>
              </ol>
            </Section>

            {/* §13 Postanowienia końcowe */}
            <Section id="postanowienia" title="§13. Postanowienia końcowe">
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  <strong>Prawo właściwe.</strong> Niniejszy Regulamin podlega prawu polskiemu.
                  W kwestiach nieuregulowanych Regulaminem zastosowanie mają w szczególności
                  przepisy Kodeksu cywilnego, ustawy UŚUDE oraz RODO.
                </li>
                <li>
                  <strong>Właściwość sądów.</strong> Wszelkie spory wynikające z Umowy lub
                  związane z Regulaminem będą rozstrzygane przez sąd właściwy miejscowo i
                  rzeczowo zgodnie z przepisami prawa polskiego. W przypadku Użytkowników
                  będących konsumentami właściwość sądu ustalana jest według przepisów Kodeksu
                  postępowania cywilnego, z zachowaniem praw konsumenta do wniesienia powództwa
                  przed sąd właściwy dla miejsca ich zamieszkania.
                </li>
                <li>
                  <strong>Separowalność.</strong> Jeżeli którekolwiek z postanowień Regulaminu
                  zostanie uznane za nieważne lub bezskuteczne, pozostałe postanowienia pozostają
                  w mocy. Nieważne lub bezskuteczne postanowienie zostanie zastąpione przepisem
                  prawa najbliższym celowi danego postanowienia.
                </li>
                <li>
                  <strong>Język.</strong> Regulamin jest sporządzony w języku polskim, który jest
                  językiem wiążącym dla jego interpretacji.
                </li>
                <li>
                  <strong>Całość porozumienia.</strong> Regulamin wraz z Polityką Prywatności i
                  ewentualnymi warunkami szczegółowymi danego Planu stanowią całość porozumienia
                  między Stronami, zastępując wszelkie wcześniejsze ustalenia w tym zakresie.
                </li>
                <li>
                  <strong>Kontakt.</strong> W sprawach nieuregulowanych Regulaminem oraz
                  wszelkich pytaniach prosimy o kontakt pod adresem{' '}
                  <a href="mailto:legal@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                    legal@riskguard.pl
                  </a>.
                </li>
              </ol>
              <InfoCard>
                <InfoRow label="Data wejścia w życie">{updated}</InfoRow>
                <InfoRow label="Wersja">1.0</InfoRow>
                <InfoRow label="Poprzednie wersje">Brak (pierwsza wersja Regulaminu)</InfoRow>
              </InfoCard>
            </Section>
          </div>

          <p className="mt-10 text-xs text-slate-400 dark:text-slate-600 text-center print:hidden">
            Aby zapisać tę stronę jako PDF, użyj funkcji Drukuj / PDF w przeglądarce (Ctrl+P) i
            wybierz opcję „Zapisz jako PDF".
          </p>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-4 sm:px-6 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">RiskGuard</span>
          </Link>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} RiskGuard. Wszelkie prawa zastrzeżone.
          </p>
          <div className="flex gap-5 text-sm text-slate-400 dark:text-slate-500">
            <Link href="/privacy-policy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              Polityka prywatności
            </Link>
            <Link href="/terms-of-use" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors font-medium text-blue-600 dark:text-blue-400">
              Regulamin
            </Link>
            <a href="mailto:kontakt@riskguard.pl" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Kontakt</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-8 py-7 shadow-sm scroll-mt-20">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {children}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 odd:bg-slate-50 dark:odd:bg-slate-800/40">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-44 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{children}</span>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 text-slate-600 dark:text-slate-400 align-top leading-relaxed ${
                    j === 0 ? 'font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap' : ''
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
