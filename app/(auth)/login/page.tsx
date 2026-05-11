'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader as Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') ?? '/dashboard';
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(data: SignInFormData) {
    setServerError('');
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

    // Give the browser a tick to flush the session cookies before navigating
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.location.replace(redirectPath);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
