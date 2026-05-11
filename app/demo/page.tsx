'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader as Loader2, CircleAlert as AlertCircle } from 'lucide-react';

type Stage = 'seeding' | 'activating' | 'redirecting' | 'error';

export default function DemoPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('seeding');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function startDemo() {
      try {
        setStage('seeding');
        const seedRes = await fetch('/api/demo/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: 'full', ttlHours: 24 }),
        });

        if (!seedRes.ok) {
          const data = await seedRes.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? 'Failed to create demo environment');
        }

        const { demoSessionId } = await seedRes.json() as { demoSessionId: string };

        setStage('activating');
        const enableRes = await fetch('/api/demo/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demoSessionId }),
        });

        if (!enableRes.ok) {
          const data = await enableRes.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? 'Failed to activate demo session');
        }

        setStage('redirecting');
        router.push('/dashboard');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStage('error');
      }
    }

    void startDemo();
  }, [router]);

  const stageLabel: Record<Stage, string> = {
    seeding:     'Building your demo environment...',
    activating:  'Activating demo session...',
    redirecting: 'Redirecting to dashboard...',
    error:       'Something went wrong',
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
            <Shield className="w-7 h-7 text-white" />
          </div>
        </div>

        {stage !== 'error' ? (
          <>
            <div className="flex justify-center mb-5">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Preparing your demo
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {stageLabel[stage]}
            </p>
            <div className="mt-6 flex justify-center gap-1.5">
              {(['seeding', 'activating', 'redirecting'] as Stage[]).map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    stage === s
                      ? 'w-6 bg-blue-600'
                      : (['seeding', 'activating', 'redirecting'] as Stage[]).indexOf(s) <
                        (['seeding', 'activating', 'redirecting'] as Stage[]).indexOf(stage)
                      ? 'w-6 bg-blue-300'
                      : 'w-2 bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Demo unavailable
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {error}
            </p>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
            >
              Back to home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
