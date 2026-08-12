'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { ContactModal } from './contact-modal';

export function HomepageFooter() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <footer className="border-t border-slate-200 dark:border-slate-800 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white">BezpieczneFaktury</span>
          </div>
          <div className="flex flex-col justify-center text-sm text-slate-400 dark:text-slate-500">
        <span>
          &copy; <time dateTime={new Date().getFullYear().toString()}>{new Date().getFullYear()}</time> BezpieczneFaktury. Wszelkie prawa zastrzeżone.
        </span>

        <span className="mt-1 flex justify-center">Created by  &nbsp;
          <a
            href="https://krisaczi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            KrisAczi
          </a>
        </span>
      </div>
          <div className="flex gap-6 text-sm text-slate-400 dark:text-slate-500">
            <Link href="/privacy-policy" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              Polityka prywatności
            </Link>
            <Link href="/terms-of-use" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              Warunki korzystania
            </Link>
            <button
              onClick={() => setContactOpen(true)}
              className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Kontakt
            </button>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
