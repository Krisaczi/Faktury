'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader as Loader2, CircleCheck as CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordStrength } from '@/components/auth/password-strength';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
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
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const passwordValue = watch('password', '');

  async function onSubmit(data: ResetPasswordFormData) {
    setServerError('');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push('/dashboard'), 2000);
  }

  if (success) {
    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
        <CardHeader className="pb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-xl text-center text-slate-900 dark:text-white">
            Password updated
          </CardTitle>
          <CardDescription className="text-center text-slate-500 dark:text-slate-400">
            Your password has been reset. Redirecting to dashboard...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
          Set new password
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Choose a strong password for your account
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
            <Label htmlFor="password" className="text-slate-700 dark:text-slate-300">
              New password
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
              Confirm new password
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
                Updating password...
              </>
            ) : (
              'Update password'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
