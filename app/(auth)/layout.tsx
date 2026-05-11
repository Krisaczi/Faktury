import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication — RiskGuard',
  description: 'Sign in or create your account',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg group-hover:shadow-blue-500/25 transition-shadow">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2L3 6v4c0 4.418 3.134 8.566 7 9.5C13.866 18.566 17 14.418 17 10V6L10 2z"
                  fill="white"
                  fillOpacity="0.9"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              RiskGuard
            </span>
          </a>
        </div>
        {children}
      </div>
    </div>
  );
}
