'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader as Loader2, UserPlus } from 'lucide-react';
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
import { PasswordStrength } from '@/components/auth/password-strength';
import { signUpSchema, type SignUpFormData } from '@/lib/validations/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const passwordValue = watch('password', '');

  async function onSubmit(data: SignUpFormData) {
    setServerError('');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
        emailRedirectTo: `${window.location.origin}/verify-email`,
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        setServerError('An account with this email already exists.');
      } else {
        setServerError(error.message);
      }
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
        <CardHeader className="pb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <CardTitle className="text-xl text-center text-slate-900 dark:text-white">
            Check your email
          </CardTitle>
          <CardDescription className="text-center text-slate-500 dark:text-slate-400">
            We sent a verification link to your email address. Click it to activate your account.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login">
            <Button variant="outline" className="w-full">
              Back to sign in
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
          Create an account
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Start managing vendor risk today
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive" className="py-3">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name" className="text-slate-700 dark:text-slate-300">
              Full name
            </Label>
            <Input
              id="full_name"
              type="text"
              placeholder="Jane Smith"
              autoComplete="name"
              {...register('full_name')}
              className={errors.full_name ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
            {errors.full_name && (
              <p className="text-xs text-red-500">{errors.full_name.message}</p>
            )}
          </div>

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
            <Label htmlFor="password" className="text-slate-700 dark:text-slate-300">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
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
            <PasswordStrength password={passwordValue} />
            {errors.password && (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password" className="text-slate-700 dark:text-slate-300">
              Confirm password
            </Label>
            <div className="relative">
              <Input
                id="confirm_password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('confirm_password')}
                className={errors.confirm_password ? 'border-red-400 focus-visible:ring-red-400 pr-10' : 'pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirm_password && (
              <p className="text-xs text-red-500">{errors.confirm_password.message}</p>
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
                Creating account...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Create account
              </>
            )}
          </Button>

          <p className="text-xs text-center text-slate-400 dark:text-slate-500">
            By creating an account you agree to our{' '}
            <span className="underline cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">Terms</span>{' '}
            and{' '}
            <span className="underline cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">Privacy Policy</span>
          </p>
        </form>
      </CardContent>
      <CardFooter className="pt-0 flex justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
