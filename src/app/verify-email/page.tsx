"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { Loader2, MailCheck } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useUser } from '@/firebase';
import { toast } from '@/hooks/use-toast';
import { clearBrowserSession, establishBrowserSession } from '@/lib/client-auth';

const RESEND_COOLDOWN_MS = 60_000;

export default function VerifyEmailPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  useEffect(() => {
    if (!isUserLoading && !user) router.replace('/login');
    if (user?.emailVerified) {
      void establishBrowserSession(user)
        .then(() => {
          const next = sessionStorage.getItem('squad_post_verify_path') || '/dashboard';
          sessionStorage.removeItem('squad_post_verify_path');
          router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
        })
        .catch(() => {
          toast({
            title: 'Session Setup Failed',
            description: 'Your verified login could not be secured. Please try again.',
            variant: 'destructive',
          });
        });
    }
  }, [isUserLoading, router, user]);

  const checkVerification = async () => {
    if (!auth.currentUser) return;
    setChecking(true);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      if (!auth.currentUser.emailVerified) {
        toast({ title: 'Not Verified Yet', description: 'Open the link in your email, then try again.' });
        return;
      }
      await establishBrowserSession(auth.currentUser);
      const next = sessionStorage.getItem('squad_post_verify_path') || '/dashboard';
      sessionStorage.removeItem('squad_post_verify_path');
      window.location.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    if (!auth.currentUser || Date.now() < cooldownUntil) return;
    try {
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/login?verified=1`,
      });
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      toast({ title: 'Verification Sent', description: 'Check your inbox and spam folder.' });
    } catch {
      toast({ title: 'Please Wait', description: 'Verification requests are limited. Try again shortly.', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <Card className="w-full max-w-md rounded-[2.5rem] border-none shadow-2xl">
        <CardHeader className="items-center text-center pt-10">
          <BrandLogo variant="light-background" className="h-12 w-40 mb-6" />
          <MailCheck className="h-14 w-14 text-primary" />
          <CardTitle className="text-3xl font-black uppercase tracking-tight">Verify Your Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-10 pb-10 text-center">
          <p className="text-sm text-muted-foreground">
            Account access stays locked until the address {user?.email ? `“${user.email}”` : ''} is verified.
          </p>
          <Button onClick={checkVerification} disabled={checking} className="w-full h-14 rounded-2xl font-black uppercase">
            {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : "I've Verified My Email"}
          </Button>
          <Button onClick={resend} variant="outline" className="w-full h-12 rounded-2xl font-black uppercase text-xs">
            Resend Verification
          </Button>
          <button
            type="button"
            className="text-xs font-black uppercase text-muted-foreground hover:text-primary"
            onClick={async () => {
              await clearBrowserSession();
              await signOut(auth);
              router.replace('/login');
            }}
          >
            Use another account
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
