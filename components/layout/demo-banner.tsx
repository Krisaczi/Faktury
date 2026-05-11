'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, X, LogIn, Clock, ChevronRight, TriangleAlert as AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDemoMode } from '@/components/providers/demo-provider';

// ─── Tooltip wrapper for disabled actions ────────────────────────────────────

interface DemoTooltipProps {
  children: React.ReactNode;
  message?: string;
  className?: string;
}

export function DemoTooltip({
  children,
  message = 'This action is disabled in Demo Mode.',
  className,
}: DemoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const { status } = useDemoMode();
  if (!status.isDemo) return <>{children}</>;

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <div className="pointer-events-none opacity-50 select-none" aria-disabled="true">
        {children}
      </div>
      {visible && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-56 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs px-3 py-2 shadow-lg pointer-events-none"
        >
          <div className="flex items-start gap-1.5">
            <FlaskConical className="w-3 h-3 mt-0.5 text-amber-400 shrink-0" />
            <span>{message}</span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
        </div>
      )}
    </div>
  );
}

// ─── Demo guard HOC helper ────────────────────────────────────────────────────
// Wraps any element and disables it when demo is active

interface DemoGuardProps {
  children:  React.ReactNode;
  message?:  string;
  className?: string;
}

export function DemoGuard({ children, message, className }: DemoGuardProps) {
  const { status } = useDemoMode();
  if (!status.isDemo) return <>{children}</>;
  return <DemoTooltip message={message} className={className}>{children}</DemoTooltip>;
}

// ─── DemoBanner ───────────────────────────────────────────────────────────────

export function DemoBanner() {
  const { status, isLoading, exitDemo } = useDemoMode();
  const router                          = useRouter();
  const [dismissed, setDismissed]       = useState(false);
  const [exiting,   setExiting]         = useState(false);

  if (isLoading || !status.isDemo || dismissed) return null;

  const isExpiringSoon =
    status.remainingMinutes !== null && status.remainingMinutes < 30;

  const handleExit = async () => {
    setExiting(true);
    await exitDemo();
  };

  return (
    <div
      role="banner"
      aria-label="Demo Mode active"
      className={cn(
        'relative flex items-center justify-between gap-3 px-4 py-2.5 text-sm',
        'border-b',
        isExpiringSoon
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      )}
    >
      {/* Left: label + description */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn(
          'flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0',
          isExpiringSoon
            ? 'bg-amber-100 dark:bg-amber-900/40'
            : 'bg-blue-100 dark:bg-blue-900/40'
        )}>
          {isExpiringSoon
            ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            : <FlaskConical  className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
        </div>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={cn(
            'font-semibold text-xs uppercase tracking-wider',
            isExpiringSoon
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-blue-700 dark:text-blue-400'
          )}>
            Demo Mode
          </span>
          <span className={cn(
            'text-xs hidden sm:inline',
            isExpiringSoon
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-blue-600 dark:text-blue-400'
          )}>
            {isExpiringSoon
              ? `Expires in ${status.remainingMinutes} min — sign up to keep your data`
              : 'You\'re exploring with sample data. Production actions are disabled.'}
          </span>
        </div>

        {/* Time remaining pill */}
        {status.remainingMinutes !== null && (
          <div className={cn(
            'hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
            isExpiringSoon
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
          )}>
            <Clock className="w-3 h-3" />
            {status.remainingMinutes < 60
              ? `${status.remainingMinutes}m left`
              : `${Math.round(status.remainingMinutes / 60)}h left`}
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => router.push('/signup')}
          className={cn(
            'h-7 text-xs gap-1',
            isExpiringSoon
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
        >
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">Sign up free</span>
          <ChevronRight className="w-3 h-3" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleExit}
          disabled={exiting}
          className={cn(
            'h-7 text-xs gap-1',
            isExpiringSoon
              ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              : 'text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
          )}
        >
          <LogIn className="w-3 h-3" />
          Exit demo
        </Button>

        <button
          onClick={() => setDismissed(true)}
          className={cn(
            'p-1 rounded-md transition-colors',
            isExpiringSoon
              ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              : 'text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
          )}
          aria-label="Dismiss demo banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── DemoExpiredOverlay ───────────────────────────────────────────────────────

export function DemoExpiredOverlay() {
  const { status, exitDemo } = useDemoMode();
  const router               = useRouter();

  if (!status.expired) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-expired-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-7 h-7 text-amber-500" />
        </div>
        <h2 id="demo-expired-title" className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Demo session expired
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          Your 24-hour demo has ended. Sign up for a free account to keep all your data and access the full platform.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
            onClick={() => { void exitDemo(); router.push('/signup'); }}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Create free account
          </Button>
          <Button
            variant="outline"
            className="w-full border-slate-200 dark:border-slate-700"
            onClick={() => void exitDemo()}
          >
            Sign in to existing account
          </Button>
        </div>
      </div>
    </div>
  );
}
