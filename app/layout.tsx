import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/providers/auth-provider';
import { SWRProvider } from '@/providers/swr-provider';
import { I18nProvider } from '@/providers/i18n-provider';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  title: 'KSeFApp — Zarządzanie fakturami i dostawcami',
  description: 'Zarządzaj fakturami, dostawcami i raportami ryzyka z integracją KSeF',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className={inter.className}>
        <I18nProvider>
          <SWRProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </SWRProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
