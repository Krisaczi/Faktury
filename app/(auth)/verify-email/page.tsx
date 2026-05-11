'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MailCheck, Loader as Loader2, CircleAlert as AlertCircle } from 'lucide-react';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function verify() {
      const supabase = getSupabaseBrowserClient();

      // Supabase PKCE flow sends token_hash + type as query params
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') as 'email' | 'recovery' | 'magiclink' | null;

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          setErrorMsg(error.message);
          setStatus('error');
        } else {
          setStatus('success');
        }
        return;
      }

      // Older implicit flow: token arrives in the URL hash fragment (#access_token=...)
      // The Supabase client detects this automatically on getSession
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session) {
        setStatus('success');
      } else if (error) {
        setErrorMsg(error.message);
        setStatus('error');
      } else {
        // No token found at all — likely a direct navigation to this URL
        setErrorMsg('No verification token found. Please use the link from your email.');
        setStatus('error');
      }
    }

    void verify();
  }, [searchParams]);

  if (status === 'verifying') {
    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
        <CardHeader className="pb-4 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-5">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
            Verifying your email
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400 text-base">
            Please wait while we confirm your email address...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
        <CardHeader className="pb-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
            Verification failed
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400 text-base leading-relaxed">
            {errorMsg || 'The verification link may have expired or already been used.'}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3">
          <Link href="/signup" className="w-full">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
              Try signing up again
            </Button>
          </Link>
          <Link href="/" className="w-full">
            <Button variant="ghost" className="w-full text-slate-500">
              Back to home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
      <CardHeader className="pb-4 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-5">
          <MailCheck className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
          Email verified!
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400 text-base leading-relaxed">
          Your email address has been confirmed. You can now sign in to your account
          and start using RiskGuard.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col gap-3">
        <Link href="/login" className="w-full">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            Continue to sign in
          </Button>
        </Link>
        <Link href="/" className="w-full">
          <Button variant="ghost" className="w-full text-slate-500">
            Back to home
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
