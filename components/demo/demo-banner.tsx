import Link from 'next/link';
import { TriangleAlert as AlertTriangle } from 'lucide-react';
import { pl as t } from '@/lib/i18n/pl';

export function DemoBanner() {
  return (
    <div className="flex items-center justify-between gap-4 bg-amber-400 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-900" />
        <p className="text-sm font-medium text-amber-900">
          {t.demo.bannerText}
        </p>
      </div>
      <Link
        href="/login"
        className="shrink-0 rounded-md bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-800"
      >
        {t.demo.exitDemo}
      </Link>
    </div>
  );
}
