'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// ─── Container ────────────────────────────────────────────────────────────────
// Standard max-width page wrapper

interface ContainerProps {
  children:   React.ReactNode;
  size?:      'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const containerSizes = {
  sm:   'max-w-2xl',
  md:   'max-w-3xl',
  lg:   'max-w-5xl',
  xl:   'max-w-7xl',
  full: 'max-w-full',
};

export function Container({ children, size = 'xl', className }: ContainerProps) {
  return (
    <div className={cn('w-full', containerSizes[size], className)}>
      {children}
    </div>
  );
}

// ─── Stack ────────────────────────────────────────────────────────────────────
// Vertical flex column with consistent gap

type GapSize = '1' | '2' | '3' | '4' | '5' | '6' | '8' | '10' | '12';

interface StackProps {
  children:   React.ReactNode;
  gap?:       GapSize;
  className?: string;
  as?:        React.ElementType;
}

const gapMap: Record<GapSize, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
  '5': 'gap-5',
  '6': 'gap-6',
  '8': 'gap-8',
  '10': 'gap-10',
  '12': 'gap-12',
};

export function Stack({ children, gap = '4', className, as: As = 'div' }: StackProps) {
  return (
    <As className={cn('flex flex-col', gapMap[gap], className)}>
      {children}
    </As>
  );
}

// ─── HStack ───────────────────────────────────────────────────────────────────
// Horizontal flex row with consistent gap

interface HStackProps {
  children:   React.ReactNode;
  gap?:       GapSize;
  align?:     'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?:   'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?:      boolean;
  className?: string;
}

const alignMap: Record<string, string> = {
  start:    'items-start',
  center:   'items-center',
  end:      'items-end',
  stretch:  'items-stretch',
  baseline: 'items-baseline',
};

const justifyMap: Record<string, string> = {
  start:    'justify-start',
  center:   'justify-center',
  end:      'justify-end',
  between:  'justify-between',
  around:   'justify-around',
  evenly:   'justify-evenly',
};

export function HStack({
  children,
  gap = '3',
  align = 'center',
  justify = 'start',
  wrap = false,
  className,
}: HStackProps) {
  return (
    <div className={cn(
      'flex',
      gapMap[gap],
      alignMap[align],
      justifyMap[justify],
      wrap && 'flex-wrap',
      className
    )}>
      {children}
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
// Responsive CSS grid with preset column configurations

type GridCols = 1 | 2 | 3 | 4 | 5 | 6 | 12;

interface GridProps {
  children:   React.ReactNode;
  cols?:      GridCols | { base?: GridCols; sm?: GridCols; md?: GridCols; lg?: GridCols; xl?: GridCols };
  gap?:       GapSize;
  className?: string;
}

function resolveColClass(cols: GridCols): string {
  const map: Record<GridCols, string> = {
    1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3',
    4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6', 12: 'grid-cols-12',
  };
  return map[cols];
}

const smColMap: Record<GridCols, string>  = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6', 12: 'sm:grid-cols-12' };
const mdColMap: Record<GridCols, string>  = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5', 6: 'md:grid-cols-6', 12: 'md:grid-cols-12' };
const lgColMap: Record<GridCols, string>  = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6', 12: 'lg:grid-cols-12' };
const xlColMap: Record<GridCols, string>  = { 1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6', 12: 'xl:grid-cols-12' };

export function Grid({ children, cols = 1, gap = '4', className }: GridProps) {
  let colClasses: string;

  if (typeof cols === 'number') {
    colClasses = resolveColClass(cols);
  } else {
    const parts: string[] = [];
    if (cols.base) parts.push(resolveColClass(cols.base));
    if (cols.sm)   parts.push(smColMap[cols.sm]);
    if (cols.md)   parts.push(mdColMap[cols.md]);
    if (cols.lg)   parts.push(lgColMap[cols.lg]);
    if (cols.xl)   parts.push(xlColMap[cols.xl]);
    colClasses = parts.join(' ');
  }

  return (
    <div className={cn('grid', colClasses, gapMap[gap], className)}>
      {children}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
// Standard page title + description row with optional right-side actions

interface PageHeaderProps {
  title:        string;
  description?: string;
  children?:    React.ReactNode;   // right-side actions
  className?:   string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight truncate">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title:       string;
  description?: string;
  children?:   React.ReactNode;
  className?:  string;
}

export function SectionHeader({ title, description, children, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800', className)}>
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── StatusDot ────────────────────────────────────────────────────────────────

type StatusDotVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'pulse';

interface StatusDotProps {
  variant?:   StatusDotVariant;
  className?: string;
}

const dotColors: Record<StatusDotVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-400',
  danger:  'bg-red-500',
  neutral: 'bg-slate-400',
  info:    'bg-blue-500',
  pulse:   'bg-blue-500 animate-pulse',
};

export function StatusDot({ variant = 'neutral', className }: StatusDotProps) {
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', dotColors[variant], className)}
      aria-hidden="true"
    />
  );
}
