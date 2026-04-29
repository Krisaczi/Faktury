import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — KSeFApp',
  description: 'Privacy Policy for KSeFApp — Invoice & Vendor Management',
};

const SECTIONS = [
  {
    title: '1. Introduction',
    content: `KSeFApp ("we," "our," or "us") is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our cloud-based invoice and vendor management platform ("Service"). We process personal data in accordance with the General Data Protection Regulation (GDPR) and applicable Polish data protection law.`,
  },
  {
    title: '2. Data Controller',
    content: `KSeFApp is the data controller for personal data collected through the Service. If you have questions about this policy or our data practices, you may contact us at privacy@ksefapp.pl. For GDPR-related inquiries, you may also reach our Data Protection Officer at the same address.`,
  },
  {
    title: '3. Data We Collect',
    content: `We collect the following categories of data: (a) Account data — name, email address, and password hash when you register; (b) Company data — company name, tax identification number (NIP), and address provided during onboarding; (c) KSeF integration data — invoice metadata retrieved from the Polish National e-Invoice System on your behalf, including invoice numbers, dates, counterparty details, and amounts; (d) Usage data — log data, IP addresses, browser type, pages visited, and timestamps; (e) Billing data — subscription status and transaction identifiers processed by our payment provider (we do not store full card numbers).`,
  },
  {
    title: '4. How We Use Your Data',
    content: `We use your data to: (a) provide, operate, and maintain the Service; (b) authenticate your identity and authorize access to your account; (c) synchronize and display your invoice data from KSeF; (d) calculate vendor risk scores and generate compliance reports; (e) send transactional emails such as trial expiry notifications and weekly summaries (where enabled); (f) process subscription payments; (g) improve and develop new features; (h) comply with legal obligations and respond to lawful requests from authorities.`,
  },
  {
    title: '5. Legal Basis for Processing',
    content: `We rely on the following legal bases under GDPR Article 6: (a) Contract performance — processing necessary to deliver the Service you have subscribed to; (b) Legitimate interests — usage analytics and security monitoring, balanced against your rights; (c) Legal obligation — retention of billing and tax records as required by Polish law; (d) Consent — sending optional marketing communications, where you have explicitly opted in. You may withdraw consent at any time without affecting the lawfulness of prior processing.`,
  },
  {
    title: '6. KSeF Credentials and Authentication',
    content: `When you connect your KSeF account, we temporarily use your authentication token to retrieve invoice data on your behalf. We do not store your KSeF private keys or authentication certificates beyond the duration necessary to complete each synchronization session. Tokens are held in memory only and are discarded immediately after the session ends.`,
  },
  {
    title: '7. Data Sharing and Third Parties',
    content: `We do not sell your personal data. We may share data with: (a) Infrastructure providers — cloud hosting and database services used to operate the platform, bound by data processing agreements; (b) Payment processors — subscription billing providers who handle payment data under their own privacy policies and PCI-DSS compliance; (c) Email delivery providers — for sending transactional notifications; (d) Authorities — when required by applicable law, court order, or to protect our legal rights. All third-party processors are contractually required to protect your data in accordance with GDPR.`,
  },
  {
    title: '8. Data Retention',
    content: `We retain your personal data for as long as your account is active or as needed to provide the Service. Upon account termination you may request a data export within 30 days. After that period we will delete or anonymize your personal data, unless we are required to retain it for legal or regulatory purposes (e.g., financial records required by Polish tax law are retained for 5 years).`,
  },
  {
    title: '9. Data Security',
    content: `We implement appropriate technical and organizational measures to protect your data, including: TLS encryption for all data in transit; encryption at rest for sensitive database fields; access controls and role-based permissions; regular security reviews; and audit logging. No system is completely secure; in the event of a data breach affecting your rights and freedoms, we will notify you and the relevant supervisory authority within the timeframes required by GDPR.`,
  },
  {
    title: '10. Cookies and Tracking',
    content: `We use strictly necessary cookies to maintain your authenticated session. We do not use third-party advertising or tracking cookies. We may use first-party analytics to understand how features are used in aggregate; this data is not linked to your personal identity. You can disable cookies in your browser settings, though this may prevent certain features from functioning correctly.`,
  },
  {
    title: '11. International Transfers',
    content: `Your data is stored and processed within the European Economic Area (EEA). If any transfer outside the EEA is required (e.g., for a third-party service provider), we ensure appropriate safeguards are in place, such as Standard Contractual Clauses approved by the European Commission.`,
  },
  {
    title: '12. Your Rights',
    content: `Under GDPR you have the right to: (a) Access — request a copy of the personal data we hold about you; (b) Rectification — request correction of inaccurate or incomplete data; (c) Erasure — request deletion of your data, subject to legal retention requirements; (d) Restriction — request that we limit processing in certain circumstances; (e) Portability — receive your data in a structured, machine-readable format; (f) Objection — object to processing based on legitimate interests; (g) Withdraw consent — for any processing based on consent, at any time. To exercise these rights, contact us at privacy@ksefapp.pl. We will respond within 30 days.`,
  },
  {
    title: '13. Children\'s Privacy',
    content: `The Service is intended exclusively for business use by adults. We do not knowingly collect personal data from individuals under the age of 18. If we become aware that we have inadvertently collected data from a minor, we will delete it promptly.`,
  },
  {
    title: '14. Supervisory Authority',
    content: `If you believe your data protection rights have been violated, you have the right to lodge a complaint with the Polish supervisory authority: Urząd Ochrony Danych Osobowych (UODO), ul. Stawki 2, 00-193 Warsaw, Poland (uodo.gov.pl). You may also contact the supervisory authority in your country of residence within the EEA.`,
  },
  {
    title: '15. Changes to This Policy',
    content: `We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on our website and updating the "Last Updated" date below. Your continued use of the Service after any changes constitutes acceptance of the revised policy. If the changes materially affect how we process your data, we will seek fresh consent where required by law.`,
  },
  {
    title: '16. Contact Us',
    content: `For any questions, data subject requests, or concerns about this Privacy Policy, please contact us at privacy@ksefapp.pl or by mail at: KSeFApp, Warsaw, Poland.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900">KSeFApp</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            Legal
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900">
            Privacy Policy
          </h1>
          <p className="text-slate-500 text-sm">Last updated: April 15, 2026</p>
          <p className="mt-4 text-slate-600 leading-relaxed">
            This Privacy Policy describes how KSeFApp collects, uses, and protects your personal
            data in accordance with the General Data Protection Regulation (GDPR) and applicable
            Polish law.
          </p>
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">{section.title}</h2>
              <p className="text-slate-600 leading-[1.75] text-sm">{section.content}</p>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-600">
            Have questions about our Privacy Policy?{' '}
            <a
              href="mailto:privacy@ksefapp.pl"
              className="font-medium text-blue-600 hover:underline"
            >
              Contact us
            </a>
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} KSeFApp. All rights reserved.{' '}
            <Link href="/terms" className="hover:text-slate-700 transition-colors">
              Terms of Service
            </Link>
            {' · '}
            <Link href="/privacy" className="hover:text-slate-700 transition-colors">
              Privacy Policy
            </Link>
            {' · '}
            <Link href="/pricing" className="hover:text-slate-700 transition-colors">
              Pricing
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
