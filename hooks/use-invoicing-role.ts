'use client';

import { useUserRole } from '@/hooks/use-user-role';
import { canAccessInvoicing } from '@/lib/permissions';

/**
 * Thin wrapper that derives invoicing access from `useUserRole`.
 * Keeps the existing sidebar API intact.
 */
export function useInvoicingRole() {
  const { data, loading } = useUserRole();
  return {
    role:         data?.role ?? null,
    hasInvoicing: data ? canAccessInvoicing(data.role) : false,
    loading,
  };
}
