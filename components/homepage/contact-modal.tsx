'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Mail, MapPin, Phone, Loader as Loader2, Send, X, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const schema = z.object({
  name:    z.string().min(2, 'Imię i nazwisko jest wymagane'),
  email:   z.string().email('Podaj prawidłowy adres e-mail'),
  subject: z.string().optional(),
  message: z.string().min(10, 'Wiadomość musi mieć co najmniej 10 znaków'),
  _hp:     z.string().max(0, 'Bot detected'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContactModal({ open, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', subject: '', message: '', _hp: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Błąd serwera');
      }

      toast.success('Wiadomość wysłana', {
        description: 'Skontaktujemy się z Tobą wkrótce.',
      });
      reset();
      onClose();
    } catch (err) {
      toast.error('Nie udało się wysłać wiadomości', {
        description: err instanceof Error ? err.message : 'Spróbuj ponownie później.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Custom close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Zamknij"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid sm:grid-cols-[240px_1fr]">
          {/* Left panel — contact details */}
          <div className="bg-blue-600 text-white px-6 py-8 flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg">RiskGuard</span>
            </div>

            <div>
              <DialogTitle className="text-xl font-bold text-white mb-1">
                Skontaktuj się
              </DialogTitle>
              <DialogDescription className="text-blue-100 text-sm leading-relaxed">
                Chętnie odpowiemy na Twoje pytania i pomożemy w wyborze odpowiedniego planu.
              </DialogDescription>
            </div>

            <div className="space-y-4 mt-auto">
              <ContactDetail icon={Mail} label="E-mail" value="support@riskguard.pl" href="mailto:support@riskguard.pl" />
              <ContactDetail icon={Phone} label="Telefon" value="+48 22 123 45 67" href="tel:+48221234567" />
              <ContactDetail icon={MapPin} label="Adres" value={<>ul. Prosta 12<br />00-850 Warszawa, Polska</>} />
            </div>

            <p className="text-blue-200 text-xs mt-2">
              Odpowiadamy w ciągu 1 dnia roboczego.
            </p>
          </div>

          {/* Right panel — form */}
          <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-8 flex flex-col gap-4" noValidate>
            {/* Honeypot — hidden from real users */}
            <input
              {...register('_hp')}
              type="text"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute opacity-0 pointer-events-none w-0 h-0"
              autoComplete="off"
            />

            <Field label="Imię i nazwisko" required error={errors.name?.message}>
              <input
                {...register('name')}
                type="text"
                placeholder="Jan Kowalski"
                autoComplete="name"
                className={inputCls(!!errors.name)}
              />
            </Field>

            <Field label="Adres e-mail" required error={errors.email?.message}>
              <input
                {...register('email')}
                type="email"
                placeholder="jan@firma.pl"
                autoComplete="email"
                className={inputCls(!!errors.email)}
              />
            </Field>

            <Field label="Temat" error={errors.subject?.message}>
              <input
                {...register('subject')}
                type="text"
                placeholder="np. Pytanie o integrację z KSeF"
                className={inputCls(!!errors.subject)}
              />
            </Field>

            <Field label="Wiadomość" required error={errors.message?.message} className="flex-1">
              <textarea
                {...register('message')}
                rows={5}
                placeholder="Opisz swoje pytanie lub potrzebę..."
                className={`${inputCls(!!errors.message)} resize-none`}
              />
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm shadow-blue-600/30"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wysyłanie…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Wyślij wiadomość
                </>
              )}
            </button>

            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Przesyłając formularz, akceptujesz naszą{' '}
              <a href="/privacy-policy" className="underline hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                Politykę prywatności
              </a>
              .
            </p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return [
    'w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors',
    hasError
      ? 'border-red-400 dark:border-red-500'
      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
  ].join(' ');
}

function Field({
  label,
  required,
  error,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function ContactDetail({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-blue-100" />
      </div>
      <div>
        <p className="text-xs text-blue-200 uppercase tracking-wide font-semibold">{label}</p>
        <p className="text-sm text-white leading-snug mt-0.5">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block hover:opacity-80 transition-opacity">
        {inner}
      </a>
    );
  }
  return inner;
}
