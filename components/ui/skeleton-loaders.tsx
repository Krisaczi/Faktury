'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ─── SkeletonText ─────────────────────────────────────────────────────────────
// One or more lines of placeholder text

interface SkeletonTextProps {
  lines?:    number;
  className?: string;
  widths?:   string[];
}

export function SkeletonText({ lines = 2, widths, className }: SkeletonTextProps) {
  const defaultWidths = ['w-full', 'w-3/4', 'w-1/2', 'w-2/3', 'w-5/6'];
  return (
    <div
      className={cn('space-y-2', className)}
      aria-hidden="true"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            widths?.[i] ?? defaultWidths[i % defaultWidths.length]
          )}
        />
      ))}
    </div>
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

interface SkeletonCardProps {
  hasHeader?: boolean;
  lines?:     number;
  className?: string;
}

export function SkeletonCard({ hasHeader = true, lines = 3, className }: SkeletonCardProps) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5', className)}
      aria-hidden="true"
    >
      {hasHeader && (
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1.5 flex-1 mr-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
        </div>
      )}
      <SkeletonText lines={lines} />
    </div>
  );
}

// ─── SkeletonKpiCard ──────────────────────────────────────────────────────────
// For metric/KPI cards with a large number and label

export function SkeletonKpiCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5', className)}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
    </div>
  );
}

// ─── SkeletonTableRow ─────────────────────────────────────────────────────────

interface SkeletonTableRowProps {
  cols?:     number;
  className?: string;
}

export function SkeletonTableRow({ cols = 5, className }: SkeletonTableRowProps) {
  const widths = ['w-24', 'w-full', 'w-16', 'w-20', 'w-12'];
  return (
    <tr className={cn('border-b border-slate-50 dark:border-slate-800/50', className)} aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={cn('h-4', widths[i % widths.length])} />
        </td>
      ))}
    </tr>
  );
}

// ─── SkeletonTable ────────────────────────────────────────────────────────────

interface SkeletonTableProps {
  rows?:     number;
  cols?:     number;
  className?: string;
}

export function SkeletonTable({ rows = 8, cols = 5, className }: SkeletonTableProps) {
  return (
    <tbody className={className} aria-busy="true" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </tbody>
  );
}

// ─── SkeletonList ─────────────────────────────────────────────────────────────

interface SkeletonListProps {
  rows?:     number;
  hasIcon?:  boolean;
  className?: string;
}

export function SkeletonList({ rows = 5, hasIcon = true, className }: SkeletonListProps) {
  return (
    <div
      className={cn('space-y-3', className)}
      aria-busy="true"
      aria-label="Loading list"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 dark:border-slate-800" aria-hidden="true">
          {hasIcon && <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── SkeletonActivityFeed ─────────────────────────────────────────────────────

export function SkeletonActivityFeed({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3" aria-hidden="true">
          <Skeleton className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SkeletonChartArea ────────────────────────────────────────────────────────

export function SkeletonChartArea({ height = 220 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-2 p-3"
      style={{ height }}
      aria-hidden="true"
    >
      <div className="flex items-end gap-1 flex-1">
        {Array.from({ length: 30 }).map((_, i) => {
          const h = 20 + Math.sin(i * 0.7) * 15 + Math.random() * 25;
          return (
            <div
              key={i}
              className="flex-1 rounded-t bg-slate-200 dark:bg-slate-700 animate-pulse"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

// ─── InlineLoader ─────────────────────────────────────────────────────────────
// Small spinner for buttons and inline actions

interface InlineLoaderProps {
  size?:     'xs' | 'sm' | 'md';
  className?: string;
  label?:    string;
}

export function InlineLoader({ size = 'sm', label, className }: InlineLoaderProps) {
  const sizes = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-5 h-5' };
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <svg
        className={cn('animate-spin text-current', sizes[size])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

// ─── FullPageLoader ───────────────────────────────────────────────────────────
// Centered skeleton layout for full-page loads

interface FullPageLoaderProps {
  label?:    string;
  className?: string;
}

export function FullPageLoader({ label = 'Loading…', className }: FullPageLoaderProps) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn('flex flex-col gap-6 max-w-7xl w-full', className)}
    >
      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonKpiCard key={i} />
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SkeletonCard lines={1} className="h-64" />
        </div>
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}

// ─── ValidatingOverlay ────────────────────────────────────────────────────────
// Subtle shimmer overlay shown when SWR is revalidating stale data

interface ValidatingOverlayProps {
  isValidating: boolean;
  children:     React.ReactNode;
  className?:   string;
}

export function ValidatingOverlay({ isValidating, children, className }: ValidatingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isValidating && (
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent animate-shimmer" />
        </div>
      )}
    </div>
  );
}
