'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader as Loader2, Mail } from 'lucide-react';
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
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordFormData) {
    setServerError('');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
        <CardHeader className="pb-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-xl text-center text-slate-900 dark:text-white">
            Reset link sent
          </CardTitle>
          <CardDescription className="text-center text-slate-500 dark:text-slate-400">
            Check your email for a password reset link. It expires in 1 hour.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="w-full">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
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
          Forgot your password?
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Enter your email and we&apos;ll send you a reset link
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

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 font-medium"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending reset link...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Send reset link
              </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="pt-0 flex justify-center">
        <Link
          href="/login"
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
