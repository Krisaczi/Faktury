'use client';

import { createContext, useContext } from 'react';
import type { AppRole } from '@/lib/permissions';

const RoleContext = createContext<AppRole>('accountant');

export function RoleProvider({
  role,
  children,
}: {
  role: AppRole;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): AppRole {
  return useContext(RoleContext);
}
