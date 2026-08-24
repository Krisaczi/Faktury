'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { PackageType } from '@/lib/permissions';

export interface UserPackageData {
  packageType: PackageType | null;
  companyId:   string | null;
  loading:     boolean;
  source:      string | null;
  isKnownPlan: boolean;
}

interface EffectivePlanResponse {
  planId:       string;
  planName:     string;
  planLabel:    string;
  monthlyPrice: number;
  source:       string;
  companyId:    string | null;
  limits:       unknown;
  assignedAt:   string | null;
  updatedAt:    string | null;
  isKnownPlan:  boolean;
}

/**
 * Fetches the current user's effective plan from the canonical API.
 * Uses SWR for caching with revalidation on focus.
 */
export function useUserPackage(): UserPackageData {
  const { data, error, isLoading } = useSWR<EffectivePlanResponse>(
    'plans-effective',
    () => fetch('/api/plans/effective').then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<EffectivePlanResponse>;
    }),
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  );

  const packageType = (data?.planId as PackageType) ?? null;
  const isKnownPlan = data?.isKnownPlan ?? true;

  return {
    packageType,
    companyId:   data?.companyId ?? null,
    loading:     isLoading && !error,
    source:      data?.source ?? null,
    isKnownPlan,
  };
}
