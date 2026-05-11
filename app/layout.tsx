import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SWRProvider } from '@/components/providers/swr-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RiskGuard — Vendor Risk Management',
  description: 'Intelligently manage and monitor your third-party vendor risk.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SWRProvider>{children}</SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
