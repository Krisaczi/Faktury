'use client';

import { FileCheck, TriangleAlert as AlertTriangle, Loader as Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type KsefModalVariant = 'no_new' | 'error' | 'loading';

interface KsefResultModalProps {
  variant:   KsefModalVariant;
  open:      boolean;
  onOpenChange: (v: boolean) => void;
  errorMessage?: string;
}

const CONTENT: Record<KsefModalVariant, { title: string; body: string; icon: typeof FileCheck }> = {
  no_new: {
    title: 'Brak nowych faktur',
    body:  'KSeF nie zwrócił żadnych nowych dokumentów. Wszystkie faktury z wybranego zakresu są już w systemie.',
    icon:  FileCheck,
  },
  error: {
    title: 'Błąd KSeF',
    body:  'Nie udało się pobrać faktur z KSeF. Sprawdź połączenie z internetem i poprawność tokena KSeF, a następnie spróbuj ponownie.',
    icon:  AlertTriangle,
  },
  loading: {
    title: 'Sprawdzanie KSeF',
    body:  'Trwa sprawdzanie nowych faktur w KSeF…',
    icon:  Loader2,
  },
};

export function KsefResultModal({ variant, open, onOpenChange, errorMessage }: KsefResultModalProps) {
  const cfg = CONTENT[variant];
  const Icon = cfg.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={
              variant === 'error'
                ? 'w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0'
                : variant === 'loading'
                  ? 'w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0'
                  : 'w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0'
            }>
              <Icon className={
                variant === 'error'
                  ? 'w-4 h-4 text-red-500'
                  : variant === 'loading'
                    ? 'w-4 h-4 text-blue-500 animate-spin'
                    : 'w-4 h-4 text-emerald-500'
              } />
            </div>
            <DialogTitle className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {cfg.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {errorMessage ?? cfg.body}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {variant === 'loading' ? (
            <Button disabled className="gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Trwa pobieranie…
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="gap-2">
              OK
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
