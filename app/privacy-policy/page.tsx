'use client';

import Link from 'next/link';
import { Shield, Mail, FileText, Printer } from 'lucide-react';


const SECTIONS = [
  { id: 'administrator',    label: '1. Administrator danych' },
  { id: 'zakres',           label: '2. Zakres przetwarzanych danych' },
  { id: 'cele',             label: '3. Cele przetwarzania' },
  { id: 'podstawa',         label: '4. Podstawa prawna' },
  { id: 'odbiorcy',         label: '5. Odbiorcy danych' },
  { id: 'eog',              label: '6. Przekazywanie poza EOG' },
  { id: 'okres',            label: '7. Okres przechowywania' },
  { id: 'prawa',            label: '8. Prawa użytkownika' },
  { id: 'automatyzacja',    label: '9. Zautomatyzowane decyzje' },
  { id: 'cookies',          label: '10. Pliki cookies' },
  { id: 'zmiany',           label: '11. Zmiany polityki' },
  { id: 'kontakt',          label: '12. Kontakt' },
];

export default function PrivacyPolicyPage() {
  const updated = '19 maja 2026';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Top navigation bar ── */}
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
              onClick={() => typeof window !== 'undefined' && window.print()}
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
        {/* ── Sticky sidebar TOC (desktop) ── */}
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

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">
          {/* Header card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-8 py-8 mb-8 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  Polityka Prywatności
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  Platforma <strong className="text-slate-700 dark:text-slate-300">RiskGuard</strong>
                  &nbsp;· Ostatnia aktualizacja: <strong className="text-slate-700 dark:text-slate-300">{updated}</strong>
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <Shield className="w-3.5 h-3.5" />
                RODO / GDPR
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Niniejsza Polityka Prywatności opisuje zasady przetwarzania danych osobowych przez
              platformę RiskGuard, zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE)
              2016/679 z dnia 27 kwietnia 2016 r. (RODO/GDPR) oraz ustawą z dnia 10 maja 2018 r.
              o ochronie danych osobowych (Dz.U. 2018 poz. 1000 ze zm.).
            </p>
          </div>

          <div className="space-y-8">
            {/* ── 1. Administrator ── */}
            <Section id="administrator" title="1. Administrator danych osobowych">
              <p>
                Administratorem Twoich danych osobowych jest spółka prowadząca platformę
                RiskGuard (dalej: <strong>„Administrator"</strong> lub <strong>„my"</strong>):
              </p>
              <InfoCard>
                <InfoRow label="Nazwa">RiskGuard Sp. z o.o. (podmiot przykładowy)</InfoRow>
                <InfoRow label="Adres">ul. Testowa 1, 01-001 Warszawa, Polska</InfoRow>
                <InfoRow label="NIP">0000000000</InfoRow>
                <InfoRow label="E-mail do spraw RODO">
                  <a href="mailto:privacy@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                    privacy@riskguard.pl
                  </a>
                </InfoRow>
              </InfoCard>
              <p>
                We wszystkich sprawach dotyczących ochrony danych osobowych możesz kontaktować się
                z nami pod powyższym adresem e-mail lub pisemnie na adres siedziby. Odpowiedzi
                udzielamy w terminie 30 dni od otrzymania zapytania, zgodnie z art. 12 ust. 3 RODO.
              </p>
            </Section>

            {/* ── 2. Zakres ── */}
            <Section id="zakres" title="2. Zakres przetwarzanych danych">
              <p>
                W zależności od sposobu korzystania z platformy przetwarzamy następujące kategorie
                danych osobowych:
              </p>
              <SubSection title="a) Dane konta użytkownika">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Adres e-mail</li>
                  <li>Imię i nazwisko (opcjonalnie podawane w profilu)</li>
                  <li>Hasło w postaci zaszyfrowanego skrótu (bcrypt)</li>
                  <li>Rola użytkownika w organizacji (owner, admin, member)</li>
                  <li>Data rejestracji i czas ostatniego logowania</li>
                </ul>
              </SubSection>
              <SubSection title="b) Dane firmy">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Nazwa firmy</li>
                  <li>Numer NIP</li>
                  <li>Waluta rozliczeniowa</li>
                  <li>Status subskrypcji i historia płatności</li>
                </ul>
              </SubSection>
              <SubSection title="c) Dane faktur i dokumentów księgowych">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Dane sprzedawcy: nazwa, NIP, adres, numer konta bankowego (IBAN)</li>
                  <li>Dane nabywcy: nazwa, NIP, adres</li>
                  <li>Numer faktury, daty wystawienia, sprzedaży i terminu płatności</li>
                  <li>Pozycje faktury: nazwa towaru/usługi, ilość, cena, stawka VAT, wartości netto/brutto</li>
                  <li>Pliki XML (KSeF) przesyłane przez użytkownika</li>
                </ul>
              </SubSection>
              <SubSection title="d) Dane kontrahentów (vendorów)">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Nazwa kontrahenta, NIP, adres e-mail kontaktowy</li>
                  <li>Numery rachunków bankowych</li>
                  <li>Kategoria, historia transakcji, wynik ryzyka</li>
                </ul>
              </SubSection>
              <SubSection title="e) Logi systemowe i dane analityczne">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Adres IP i nagłówki przeglądarki (User-Agent)</li>
                  <li>Dzienniki zdarzeń (audit logs): operacje na fakturach, logowania</li>
                  <li>Czas i typ wykonywanych operacji</li>
                </ul>
              </SubSection>
            </Section>

            {/* ── 3. Cele ── */}
            <Section id="cele" title="3. Cele przetwarzania danych">
              <Table
                headers={['Cel przetwarzania', 'Opis']}
                rows={[
                  ['Rejestracja i uwierzytelnianie', 'Tworzenie i zarządzanie kontem użytkownika, weryfikacja tożsamości przy logowaniu, reset hasła.'],
                  ['Przetwarzanie i analiza faktur', 'Parsowanie plików XML/KSeF, ekstrakcja danych, przechowywanie w bazie danych, udostępnianie w panelu.'],
                  ['Analiza ryzyka', 'Wykrywanie duplikatów, anomalii kwotowych, zmian rachunków bankowych, podejrzanych kontrahentów.'],
                  ['Integracja z KSeF', 'Pobieranie faktur z Krajowego Systemu e-Faktur na podstawie danych dostępowych przekazanych przez użytkownika.'],
                  ['Rozliczenia i subskrypcja', 'Obsługa płatności za subskrypcję, weryfikacja statusu abonamentu, wystawianie potwierdzeń zakupu.'],
                  ['Bezpieczeństwo i zapobieganie nadużyciom', 'Monitorowanie logów, wykrywanie nieautoryzowanego dostępu, ochrona przed atakami.'],
                  ['Komunikacja serwisowa', 'Wysyłanie powiadomień e-mail dotyczących konta, alertów bezpieczeństwa i zmian w usłudze.'],
                  ['Analityka i doskonalenie usługi', 'Pomiar sposobu korzystania z platformy w celu poprawy jakości i funkcjonalności.'],
                ]}
              />
            </Section>

            {/* ── 4. Podstawa prawna ── */}
            <Section id="podstawa" title="4. Podstawa prawna przetwarzania">
              <Table
                headers={['Podstawa prawna', 'Zastosowanie']}
                rows={[
                  ['Art. 6 ust. 1 lit. b RODO – wykonanie umowy', 'Przetwarzanie niezbędne do świadczenia usług platformy (konto, faktury, analiza ryzyka, KSeF).'],
                  ['Art. 6 ust. 1 lit. c RODO – obowiązek prawny', 'Przechowywanie dokumentów księgowych zgodnie z ustawą o rachunkowości (min. 5 lat); wypełnianie obowiązków podatkowych.'],
                  ['Art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes', 'Bezpieczeństwo systemu, zapobieganie nadużyciom, analityka wewnętrzna, dochodzenie lub obrona roszczeń.'],
                  ['Art. 6 ust. 1 lit. a RODO – zgoda', 'Marketing i komunikacja o charakterze nieobowiązkowym (tylko jeśli wyraziłeś na to zgodę). Zgodę możesz wycofać w każdej chwili.'],
                ]}
              />
            </Section>

            {/* ── 5. Odbiorcy ── */}
            <Section id="odbiorcy" title="5. Odbiorcy danych osobowych">
              <p>
                Twoje dane mogą być przekazywane wyłącznie zaufanym podmiotom przetwarzającym,
                z którymi zawarliśmy umowy powierzenia przetwarzania danych (art. 28 RODO):
              </p>
              <Table
                headers={['Podmiot', 'Rola', 'Cel']}
                rows={[
                  ['Supabase, Inc. (USA)', 'Podmiot przetwarzający', 'Hosting bazy danych PostgreSQL, uwierzytelnianie użytkowników, przechowywanie plików.'],
                  ['Ministerstwo Finansów / KSeF (PL)', 'Odbiorca danych', 'Pobieranie faktur elektronicznych na żądanie użytkownika.'],
                  ['Lemon Squeezy / Stripe (USA)', 'Podmiot przetwarzający', 'Obsługa płatności za subskrypcję. Dane kart płatniczych przetwarzane wyłącznie przez dostawcę.'],
                  ['Dostawca e-mail transakcyjnego', 'Podmiot przetwarzający', 'Wysyłka powiadomień e-mail (np. Resend lub SendGrid).'],
                  ['Organy państwowe', 'Odbiorca danych', 'Wyłącznie na podstawie obowiązującego prawa (np. sądy, prokuratura, organy podatkowe).'],
                ]}
              />
              <p>
                Nie sprzedajemy, nie wynajmujemy ani nie udostępniamy danych osobowych podmiotom
                trzecim w celach marketingowych bez Twojej wyraźnej zgody.
              </p>
            </Section>

            {/* ── 6. EOG ── */}
            <Section id="eog" title="6. Przekazywanie danych poza Europejski Obszar Gospodarczy">
              <p>
                Część naszych podwykonawców (w szczególności Supabase, Inc. oraz Lemon Squeezy)
                ma siedziby poza EOG, w tym w Stanach Zjednoczonych. Przekazywanie danych do tych
                podmiotów odbywa się z zachowaniem odpowiednich zabezpieczeń:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Standardowe Klauzule Umowne (SCC)</strong> – zatwierdzone przez Komisję
                  Europejską decyzją z dnia 4 czerwca 2021 r. (decyzja 2021/914/UE), stanowiące
                  prawnie wiążące zobowiązanie do ochrony danych na poziomie EOG.
                </li>
                <li>
                  <strong>Dodatkowe środki techniczne i organizacyjne</strong> – szyfrowanie danych
                  w tranzycie (TLS 1.2+) i w spoczynku (AES-256), pseudonimizacja tam gdzie to możliwe.
                </li>
                <li>
                  <strong>Data Processing Agreement (DPA)</strong> – zawarta z każdym podmiotem
                  przetwarzającym spoza EOG, precyzująca obowiązki w zakresie ochrony danych.
                </li>
              </ul>
              <p>
                Masz prawo uzyskać kopię zastosowanych zabezpieczeń. W tym celu skontaktuj się z
                nami pod adresem{' '}
                <a href="mailto:privacy@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                  privacy@riskguard.pl
                </a>.
              </p>
            </Section>

            {/* ── 7. Okres ── */}
            <Section id="okres" title="7. Okres przechowywania danych">
              <Table
                headers={['Kategoria danych', 'Okres przechowywania', 'Podstawa']}
                rows={[
                  ['Dane konta użytkownika', 'Do momentu usunięcia konta, a następnie do 30 dni (kopia zapasowa)', 'Art. 6 ust. 1 lit. b RODO'],
                  ['Dokumenty księgowe (faktury)', 'Minimum 5 lat od końca roku obrotowego', 'Art. 74 ustawy o rachunkowości (Dz.U. 1994 nr 121 poz. 591 ze zm.)'],
                  ['Dane kontrahentów (vendorów)', 'Do momentu usunięcia konta lub przez 5 lat (obowiązek prawny)', 'Art. 6 ust. 1 lit. c RODO'],
                  ['Logi systemowe i audit logi', '12–24 miesiące', 'Art. 6 ust. 1 lit. f RODO (bezpieczeństwo)'],
                  ['Dane rozliczeniowe i transakcyjne', '5 lat od zakończenia umowy', 'Przepisy podatkowe'],
                  ['Kopie zapasowe (backupy)', 'Do 90 dni od wykonania kopii', 'Uzasadniony interes administratora'],
                ]}
              />
              <p>
                Po upływie okresu przechowywania dane są trwale usuwane lub anonimizowane w sposób
                uniemożliwiający identyfikację osoby, której dotyczą.
              </p>
            </Section>

            {/* ── 8. Prawa ── */}
            <Section id="prawa" title="8. Prawa użytkownika">
              <p>
                Na podstawie RODO przysługują Ci następujące prawa. Możesz je realizować,
                kontaktując się z nami na adres{' '}
                <a href="mailto:privacy@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                  privacy@riskguard.pl
                </a>{' '}
                lub za pomocą formularza w sekcji <a href="#kontakt" className="text-blue-600 dark:text-blue-400 hover:underline">Kontakt</a>.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                {[
                  { right: 'Prawo dostępu (art. 15 RODO)', desc: 'Możesz uzyskać potwierdzenie, czy przetwarzamy Twoje dane, oraz kopię tych danych.' },
                  { right: 'Prawo sprostowania (art. 16 RODO)', desc: 'Możesz żądać poprawienia nieprawidłowych lub uzupełnienia niekompletnych danych.' },
                  { right: 'Prawo do usunięcia (art. 17 RODO)', desc: 'Możesz żądać usunięcia danych, gdy nie są już potrzebne lub zostały zebrane bezprawnie. Nie dotyczy danych przechowywanych na podstawie obowiązku prawnego.' },
                  { right: 'Prawo do ograniczenia przetwarzania (art. 18 RODO)', desc: 'Możesz żądać wstrzymania przetwarzania w określonych przypadkach, np. gdy kwestionujesz prawidłowość danych.' },
                  { right: 'Prawo do przenoszenia danych (art. 20 RODO)', desc: 'Możesz otrzymać swoje dane w ustrukturyzowanym, powszechnie używanym formacie (JSON/CSV) i przenieść je do innego administratora.' },
                  { right: 'Prawo sprzeciwu (art. 21 RODO)', desc: 'Możesz wnieść sprzeciw wobec przetwarzania opartego na prawnie uzasadnionym interesie (art. 6 ust. 1 lit. f).' },
                  { right: 'Prawo do cofnięcia zgody', desc: 'Jeśli przetwarzamy dane na podstawie zgody, możesz ją wycofać w dowolnym momencie bez wpływu na zgodność z prawem wcześniejszego przetwarzania.' },
                  { right: 'Prawo do skargi (art. 77 RODO)', desc: 'Masz prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (PUODO), ul. Stawki 2, 00-193 Warszawa, lub na adres elektroniczny: kancelaria@uodo.gov.pl.' },
                ].map(({ right, desc }) => (
                  <div key={right} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-1">{right}</p>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4">
                Odpowiedzi na wnioski udzielamy bez zbędnej zwłoki, nie później niż w ciągu 30 dni
                od ich otrzymania. W przypadku wniosków skomplikowanych lub ich dużej liczby termin
                może zostać przedłużony o kolejne 60 dni, o czym poinformujemy Cię z wyprzedzeniem.
              </p>
            </Section>

            {/* ── 9. Automatyzacja ── */}
            <Section id="automatyzacja" title="9. Zautomatyzowane podejmowanie decyzji i profilowanie">
              <p>
                Platforma RiskGuard wykonuje <strong>automatyczne obliczenia wyniku ryzyka</strong>{' '}
                (ang. <em>risk score</em>) dla faktur i kontrahentów. System analizuje między innymi:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>duplikaty numerów faktur lub identycznych kwot w krótkim przedziale czasowym,</li>
                <li>anomalie statystyczne w wartościach faktur (odchylenia od średniej dla danego kontrahenta),</li>
                <li>zmiany numerów rachunków bankowych kontrahenta,</li>
                <li>brakujące pola wymagane przez przepisy,</li>
                <li>obecność kontrahenta w rejestrach ryzyka.</li>
              </ul>
              <p className="mt-3">
                Wyniki analizy mają <strong>wyłącznie charakter informacyjny</strong> i służą jako
                wsparcie decyzyjne dla pracowników Twojej firmy. Żadna decyzja wywołująca skutki
                prawne wobec osoby fizycznej nie jest podejmowana wyłącznie przez system w sposób
                automatyczny (art. 22 RODO). Ostateczna decyzja o zatwierdzeniu lub odrzuceniu
                faktury należy zawsze do człowieka.
              </p>
            </Section>

            {/* ── 10. Cookies ── */}
            <Section id="cookies" title="10. Pliki cookies i podobne technologie">
              <p>
                Platforma RiskGuard używa plików cookies i podobnych technologii przechowywania
                danych w przeglądarce. Poniżej opisujemy stosowane przez nas kategorie:
              </p>
              <Table
                headers={['Nazwa / kategoria', 'Cel', 'Czas życia']}
                rows={[
                  ['sb-* (Supabase Auth)', 'Sesja uwierzytelnienia użytkownika (JWT). Niezbędne do działania usługi.', 'Sesja przeglądarki lub do 7 dni (jeśli zaznaczono „Zapamiętaj mnie")'],
                  ['rg_demo_session', 'Identyfikator sesji demonstracyjnej.', 'Do wylogowania z trybu demo lub 24 h'],
                  ['next-auth.*', 'Pomocnicze cookie zarządzania stanem auth po stronie Next.js.', 'Sesja przeglądarki'],
                  ['Analityczne (opcjonalne)', 'Pomiar ruchu i korzystania z aplikacji (tylko za zgodą).', 'Do 12 miesięcy'],
                ]}
              />
              <p>
                Możesz zablokować lub usunąć cookies w ustawieniach przeglądarki. Wyłączenie cookies
                sesji uwierzytelnienia uniemożliwi logowanie do platformy. Nie używamy cookies
                reklamowych ani śledzących podmiotów trzecich bez Twojej zgody.
              </p>
            </Section>

            {/* ── 11. Zmiany ── */}
            <Section id="zmiany" title="11. Zmiany w Polityce Prywatności">
              <p>
                Zastrzegamy sobie prawo do aktualizacji niniejszej Polityki Prywatności w przypadku:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>zmian w obowiązujących przepisach prawa,</li>
                <li>zmian w zakresie przetwarzanych danych lub celach przetwarzania,</li>
                <li>zmian w stosowanych technologiach lub podwykonawcach,</li>
                <li>decyzji organów nadzorczych lub wyroków sądowych.</li>
              </ul>
              <p className="mt-3">
                O każdej istotnej zmianie poinformujemy Cię:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>e-mailem na adres przypisany do konta (co najmniej 14 dni przed wejściem zmiany w życie),</li>
                <li>komunikatem w panelu platformy przy następnym logowaniu,</li>
                <li>poprzez aktualizację daty „Ostatnia aktualizacja" na tej stronie.</li>
              </ul>
              <p className="mt-3">
                Dalsze korzystanie z platformy po wejściu zmian w życie oznacza akceptację
                zaktualizowanej Polityki Prywatności.
              </p>
            </Section>

            {/* ── 12. Kontakt ── */}
            <Section id="kontakt" title="12. Kontakt w sprawach RODO">
              <p>
                Aby skorzystać z przysługujących Ci praw lub zadać pytanie dotyczące przetwarzania
                danych osobowych, skontaktuj się z nami:
              </p>
              <InfoCard>
                <InfoRow label="E-mail">
                  <a href="mailto:privacy@riskguard.pl" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    privacy@riskguard.pl
                  </a>
                </InfoRow>
                <InfoRow label="Poczta">RiskGuard Sp. z o.o., ul. Testowa 1, 01-001 Warszawa</InfoRow>
                <InfoRow label="Czas odpowiedzi">Do 30 dni roboczych od otrzymania wniosku</InfoRow>
              </InfoCard>
              <p className="mt-4">
                Jeżeli uważasz, że przetwarzamy Twoje dane niezgodnie z prawem, masz prawo wniesienia
                skargi do organu nadzorczego:{' '}
              </p>
              <InfoCard>
                <InfoRow label="Organ">Prezes Urzędu Ochrony Danych Osobowych (PUODO)</InfoRow>
                <InfoRow label="Adres">ul. Stawki 2, 00-193 Warszawa</InfoRow>
                <InfoRow label="Telefon">+48 22 531 03 00</InfoRow>
                <InfoRow label="E-mail">
                  <a href="mailto:kancelaria@uodo.gov.pl" className="text-blue-600 dark:text-blue-400 hover:underline">
                    kancelaria@uodo.gov.pl
                  </a>
                </InfoRow>
                <InfoRow label="Strona www">
                  <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                    uodo.gov.pl
                  </a>
                </InfoRow>
              </InfoCard>
            </Section>
          </div>

          {/* ── Print styles helper text ── */}
          <p className="mt-10 text-xs text-slate-400 dark:text-slate-600 text-center print:hidden">
            Aby zapisać tę stronę jako PDF, użyj funkcji Drukuj / PDF w przeglądarce (Ctrl+P) i
            wybierz opcję „Zapisz jako PDF".
          </p>
        </main>
      </div>

      {/* ── Footer ── */}
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
            <Link href="/privacy-policy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors font-medium text-blue-600 dark:text-blue-400">
              Polityka prywatności
            </Link>
            <Link href="/terms-of-use" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Regulamin</Link>
            <a href="mailto:privacy@riskguard.pl" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Kontakt</a>
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
      <div className="prose-custom space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
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
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-36 flex-shrink-0 pt-0.5">
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
                <td key={j} className={`px-4 py-3 text-slate-600 dark:text-slate-400 align-top leading-relaxed ${j === 0 ? 'font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap' : ''}`}>
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
