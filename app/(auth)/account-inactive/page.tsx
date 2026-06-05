import Link from 'next/link';
import { ShieldOff, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';

export const metadata = { title: 'Konto nieaktywne' };

export default function AccountInactivePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
          <CardHeader className="pb-4 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-5">
              <ShieldOff className="w-7 h-7 text-slate-500 dark:text-slate-400" />
            </div>
            <CardTitle className="text-xl text-slate-900 dark:text-white">
              Konto zostało dezaktywowane
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
              Dostęp do Twojego konta został tymczasowo wyłączony przez administratora organizacji.
              Skontaktuj się z właścicielem konta lub działem wsparcia, aby przywrócić dostęp.
            </CardDescription>
          </CardHeader>

          <div className="px-6 pb-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Jeśli uważasz, że dezaktywacja nastąpiła przez pomyłkę, skontaktuj się z właścicielem organizacji lub napisz na adres pomocy technicznej.
              </p>
            </div>
          </div>

          <CardFooter className="flex flex-col gap-2 pt-0">
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" />
                Wróć do strony logowania
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
