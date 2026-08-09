'use client';

import { Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Upgrade banner shown to Starter-package users on invoicing pages.
 * Explains that their plan is read-only for KSeF invoices and links to upgrade.
 */
export function StarterUpgradeBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-blue-200 dark:border-blue-800',
        'bg-blue-50 dark:bg-blue-950/30',
        'px-4 py-3 flex items-center gap-3',
        className
      )}
      role="status"
    >
      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
        <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Plan Starter — podgląd tylko do odczytu
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
          Możesz przeglądać faktury pobrane z KSeF, ale nie możesz ich tworzyć, edytować ani wysyłać.
          Przejdź na plan Professional, aby uzyskać pełne fakturowanie.
        </p>
      </div>
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 whitespace-nowrap transition-colors"
      >
        Zaktualizuj
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
