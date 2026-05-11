'use client';

import * as React from 'react';
import { TriangleAlert as AlertTriangle, RefreshCw, Inbox, Loader as Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── StateCard ────────────────────────────────────────────────────────────────
// Unified empty / loading / error state component

type StateCardVariant = 'empty' | 'loading' | 'error';

interface StateCardAction {
  label:    string;
  onClick?: () => void;
  href?:    string;
  icon?:    React.ElementType;
  variant?: 'default' | 'outline' | 'ghost';
}

interface StateCardProps {
  variant:           StateCardVariant;
  title?:            string;
  description?:      string;
  icon?:             React.ElementType;
  primaryAction?:    StateCardAction;
  secondaryAction?:  StateCardAction;
  errorCode?:        string;
  className?:        string;
  compact?:          boolean;
}

function ActionButton({ action }: { action: StateCardAction }) {
  const Icon = action.icon;
  const base = (
    <Button
      variant={action.variant ?? 'outline'}
      size="sm"
      onClick={action.onClick}
      className={cn(
        action.variant === 'default'
          ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 mr-1.5" />}
      {action.label}
    </Button>
  );

  if (action.href) {
    return (
      <a href={action.href}>
        {base}
      </a>
    );
  }
  return base;
}

const defaultTitles: Record<StateCardVariant, string> = {
  empty:   'Nothing here yet',
  loading: 'Loading…',
  error:   'Something went wrong',
};

const defaultDescriptions: Record<StateCardVariant, string> = {
  empty:   'Get started by adding data.',
  loading: 'Fetching your data, please wait.',
  error:   'An unexpected error occurred. Please try again.',
};

export function StateCard({
  variant,
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  errorCode,
  className,
  compact = false,
}: StateCardProps) {
  const resolvedTitle       = title       ?? defaultTitles[variant];
  const resolvedDescription = description ?? defaultDescriptions[variant];

  const DefaultIcon =
    icon ??
    (variant === 'error'   ? AlertTriangle :
     variant === 'loading' ? Loader2 :
     Inbox);

  const iconColor =
    variant === 'error'   ? 'text-red-400 dark:text-red-500' :
    variant === 'loading' ? 'text-blue-500 dark:text-blue-400' :
    'text-slate-300 dark:text-slate-600';

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'loading' ? 'polite' : undefined}
      aria-busy={variant === 'loading'}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4 gap-2' : 'py-16 px-6 gap-3',
        className
      )}
    >
      <div className={cn(
        'flex items-center justify-center rounded-2xl',
        compact ? 'w-10 h-10 mb-1' : 'w-14 h-14 mb-2',
        variant === 'error'   ? 'bg-red-50   dark:bg-red-900/20' :
        variant === 'loading' ? 'bg-blue-50  dark:bg-blue-900/20' :
        'bg-slate-100 dark:bg-slate-800'
      )}>
        <DefaultIcon
          className={cn(
            compact ? 'w-5 h-5' : 'w-7 h-7',
            iconColor,
            variant === 'loading' && 'animate-spin'
          )}
        />
      </div>

      <div className={cn('space-y-1', compact ? 'max-w-xs' : 'max-w-sm')}>
        <p className={cn(
          'font-semibold',
          compact ? 'text-sm' : 'text-base',
          variant === 'error'
            ? 'text-slate-800 dark:text-slate-200'
            : 'text-slate-700 dark:text-slate-300'
        )}>
          {resolvedTitle}
        </p>
        <p className={cn(
          'text-slate-500 dark:text-slate-400 leading-relaxed',
          compact ? 'text-xs' : 'text-sm'
        )}>
          {resolvedDescription}
        </p>
        {errorCode && (
          <p className="text-xs font-mono text-slate-400 dark:text-slate-600 mt-1">
            Error code: {errorCode}
          </p>
        )}
      </div>

      {(primaryAction || secondaryAction) && variant !== 'loading' && (
        <div className="flex items-center gap-2 mt-1">
          {primaryAction   && <ActionButton action={primaryAction} />}
          {secondaryAction && <ActionButton action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}
