'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader as Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { signInSchema, type SignInFormData } from '@/lib/validations/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSafeRedirect } from '@/lib/auth/determine-post-login-redirect';
import { getPostLoginRedirect } from './actions';
import { REMEMBER_ME_COOKIE } from '@/lib/auth/cookie-options';

function LoginForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('redirect') ?? null;
  const sessionExpired = searchParams.get('expired') === '1';
  const next = rawNext && isSafeRedirect(rawNext) ? rawNext : null;

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(data: SignInFormData) {
    setServerError('');

    // Set the remember-me cookie BEFORE calling signInWithPassword so that
    // the Supabase client's cookie setter can read it and decide maxAge.
    document.cookie = `${REMEMBER_ME_COOKIE}=${rememberMe ? '1' : '0'}; path=/; samesite=lax${rememberMe ? `; max-age=${60 * 60 * 24 * 7}` : ''}`;

    const supabase = getSupabaseBrowserClient();
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      if (
        error.message.includes('Invalid login credentials') ||
        error.message.includes('invalid_credentials') ||
        error.status === 400
      ) {
        setServerError('Invalid email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        setServerError('Please verify your email address before signing in.');
      } else {
        setServerError(error.message || 'Sign in failed. Please try again.');
      }
      return;
    }

    if (!authData.session) {
      setServerError('Sign in failed. Please try again.');
      return;
    }

    const destination = await getPostLoginRedirect(next);
    window.location.href = destination;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {sessionExpired && (
        <Alert className="py-3 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            Your session has expired. Please log in again.
          </AlertDescription>
        </Alert>
      )}

      {serverError && (
        <Alert variant="destructive" className="py-3">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-slate-700 dark:text-slate-300">
          Email address
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          {...register('email')}
          className={errors.email ? 'border-red-400 focus-visible:ring-red-400' : ''}
        />
        {errors.email && (
          <p className="text-xs text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-slate-700 dark:text-slate-300">
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
            className={errors.password ? 'border-red-400 focus-visible:ring-red-400 pr-10' : 'pr-10'}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-red-500">{errors.password.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="remember-me"
          checked={rememberMe}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
        />
        <Label
          htmlFor="remember-me"
          className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none"
        >
          Keep me signed in for 7 days
        </Label>
      </div>

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 font-medium"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            <LogIn className="w-4 h-4 mr-2" />
            Sign in
          </>
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
          Welcome back
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Sign in to your account to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
      <CardFooter className="pt-0 flex justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
          >
            Create one
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
