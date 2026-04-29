import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — KSeFApp',
  description: 'Terms of Service for KSeFApp — Invoice & Vendor Management',
};

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    content: `By accessing or using KSeFApp ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service. These Terms apply to all visitors, users, and others who access or use the Service.`,
  },
  {
    title: '2. Description of Service',
    content: `KSeFApp is a cloud-based invoice and vendor management platform that integrates with the Polish National e-Invoice System (KSeF). The Service allows businesses to synchronize, analyze, and manage their invoices, monitor vendor risk profiles, and generate compliance reports.`,
  },
  {
    title: '3. Eligibility',
    content: `You must be at least 18 years old and have the legal authority to enter into binding contracts on behalf of yourself or your organization. By using the Service, you represent and warrant that you meet these requirements. The Service is intended for business use and is directed at companies operating under Polish tax regulations.`,
  },
  {
    title: '4. Account Registration',
    content: `To access most features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate and complete. You are responsible for safeguarding your password and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.`,
  },
  {
    title: '5. Subscription and Billing',
    content: `The Service is offered on a subscription basis. Subscription fees are charged in advance on a monthly or annual basis. All fees are non-refundable except as expressly set forth in these Terms. We reserve the right to change subscription fees upon reasonable notice. If you do not cancel your subscription before the renewal date, your subscription will automatically renew and you authorize us to charge the applicable subscription fee.`,
  },
  {
    title: '6. Free Trial',
    content: `We may offer a free trial period for new accounts. At the end of the trial period, your account will automatically convert to a paid subscription unless you cancel before the trial ends. We reserve the right to modify or discontinue free trial offers at any time without notice.`,
  },
  {
    title: '7. KSeF Integration and Data',
    content: `By connecting your KSeF credentials to the Service, you authorize KSeFApp to access your KSeF account on your behalf solely to retrieve and process invoice data for the purposes of the Service. You are solely responsible for the accuracy of your KSeF credentials and for compliance with all applicable KSeF regulations. We do not store your KSeF private keys beyond the duration necessary to complete each authentication session.`,
  },
  {
    title: '8. Data Privacy and Security',
    content: `We take the security of your data seriously. All data transmitted between your browser and our servers is encrypted using TLS. Invoice data and company information you store in the Service is associated with your account and is not shared with third parties except as required to deliver the Service or as required by law. Please refer to our Privacy Policy for full details on how we collect, use, and protect your data.`,
  },
  {
    title: '9. Acceptable Use',
    content: `You agree not to use the Service to: (a) violate any applicable law or regulation; (b) infringe the intellectual property rights of others; (c) transmit any harmful, fraudulent, or malicious content; (d) attempt to gain unauthorized access to any part of the Service or its related systems; (e) use the Service for any purpose other than its intended business use. We reserve the right to suspend or terminate accounts that violate these restrictions.`,
  },
  {
    title: '10. Intellectual Property',
    content: `The Service, including all software, algorithms, interface designs, text, graphics, and other content, is owned by KSeFApp and its licensors. These Terms do not grant you any ownership rights in the Service. You may not copy, modify, distribute, sell, or lease any part of the Service, nor may you reverse engineer or attempt to extract the source code of the software.`,
  },
  {
    title: '11. User Content',
    content: `You retain ownership of all invoice data, vendor records, and other content you upload to the Service ("User Content"). By using the Service, you grant KSeFApp a limited, non-exclusive license to process and store your User Content solely for the purpose of providing and improving the Service. You represent that you have all rights necessary to grant this license.`,
  },
  {
    title: '12. Disclaimers',
    content: `The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, error-free, or completely secure. Risk analysis and vendor scoring features are provided for informational purposes only and do not constitute financial, legal, or tax advice. You should consult qualified professionals for such advice.`,
  },
  {
    title: '13. Limitation of Liability',
    content: `To the fullest extent permitted by applicable law, KSeFApp shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising out of or relating to your use of the Service, even if we have been advised of the possibility of such damages. Our total liability to you for any claim arising out of these Terms or the Service shall not exceed the amount you paid to us in the twelve months preceding the claim.`,
  },
  {
    title: '14. Indemnification',
    content: `You agree to indemnify, defend, and hold harmless KSeFApp and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with your access to or use of the Service, your violation of these Terms, or your infringement of any third-party rights.`,
  },
  {
    title: '15. Termination',
    content: `Either party may terminate these Terms at any time. You may terminate by canceling your subscription and ceasing use of the Service. We may suspend or terminate your access immediately if you violate these Terms or if we decide to discontinue the Service. Upon termination, your right to use the Service ceases immediately. You may request an export of your data within 30 days after termination; thereafter, we may delete your data.`,
  },
  {
    title: '16. Changes to Terms',
    content: `We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting the updated Terms on our website and updating the "Last Updated" date below. Your continued use of the Service after any changes constitutes your acceptance of the new Terms. If you do not agree to the updated Terms, you must stop using the Service.`,
  },
  {
    title: '17. Governing Law',
    content: `These Terms shall be governed by and construed in accordance with the laws of Poland, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts located in Warsaw, Poland.`,
  },
  {
    title: '18. Contact',
    content: `If you have any questions about these Terms, please contact us at legal@ksefapp.pl.`,
  },
];

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-slate-500 text-sm">Last updated: April 15, 2026</p>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Please read these Terms of Service carefully before using KSeFApp. These Terms govern
            your access to and use of our invoice and vendor management platform.
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
            Have questions about our Terms of Service?{' '}
            <a
              href="mailto:legal@ksefapp.pl"
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
