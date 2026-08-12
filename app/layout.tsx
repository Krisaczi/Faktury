import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SWRProvider } from '@/components/providers/swr-provider';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BezpieczneFaktury - Zarządzaj fakturami Twojej firmy',
  description: 'Koncentruje się na kompleksowej obsłudze faktur: tworzeniu, weryfikacji, zatwierdzaniu i śledzeniu.',
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
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
