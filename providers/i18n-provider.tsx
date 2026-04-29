'use client';

import { createContext, useContext } from 'react';
import { pl } from '@/lib/i18n/pl';
import type { Translations } from '@/lib/i18n/pl';

const I18nContext = createContext<Translations>(pl);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={pl}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
