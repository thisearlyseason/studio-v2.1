"use client";

import { authFailureMessage } from '@/lib/auth-form-feedback';
import { PasswordInput } from '@/components/ui/password-input';



import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signInAnonymously, signOut, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, browserPopupRedirectResolver } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import BrandLogo from '@/components/BrandLogo';
import styles from './login-visual.module.css';
import { Trophy, Users, Zap, Loader2, User, Baby, ChevronRight, ChevronLeft, ShieldAlert, GraduationCap, } from 'lucide-react';
import { bootstrapDemoWorkspace, clearBrowserSession, establishBrowserSession } from '@/lib/client-auth';
import { APP_DISTRIBUTION, isStoreDistribution, safeReturnPath } from '@/lib/app-distribution';
import { NativeProviderLogin } from '@/components/native-auth/NativeProviderLogin';
import { nativeBrowserAuthGate } from '@/lib/native-auth/browser-gate';

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]);
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const emailLoginPending = React.useRef(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const resetPending = React.useRef(false);
  const nativeBusy = React.useSyncExternalStore(nativeBrowserAuthGate.subscribe, nativeBrowserAuthGate.busy, () => false);
  const nativeSessionVerified = React.useRef(false);

  // ── BETA FLAG: set to false to re-enable Google sign-in ──────────────────
  const BETA_MODE = false;
  // ─────────────────────────────────────────────────────────────────────────

  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();

  React.useEffect(() => {
    setIsHydrated(true);
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo) {
      sessionStorage.setItem('squad_return_path', safeReturnPath(returnTo, APP_DISTRIBUTION));
    }
  }, []);

  React.useEffect(() => {
    if (isDemoLoading || nativeBrowserAuthGate.busy()) return;
    // Firebase may notify React before the native handoff has verified the
    // cookie, or after cancellation has already cleared its current user.
    if (isStoreDistribution && user && auth.currentUser?.uid !== user.uid) return;
    if (!isUserLoading && user) {
      const fetchRole = async () => {
        if (!user.isAnonymous && !user.emailVerified) {
          await clearBrowserSession();
          router.replace('/verify-email');
          return;
        }
        try {
          if (!nativeSessionVerified.current) await establishBrowserSession(user);
        } catch {
          await clearBrowserSession();
          await signOut(auth).catch(() => undefined);
          emailLoginPending.current = false;
          setIsLoading(false);
          setIsGoogleLoading(false);
          setFormError('Your login could not be secured. Please try again.');
          toast({
            title: 'Session Setup Failed',
            description: 'Your login could not be secured. Please try again.',
            variant: 'destructive',
          });
          return;
        }
        const storedReturnPath = sessionStorage.getItem('squad_return_path');
        if (storedReturnPath) {
          const returnPath = safeReturnPath(storedReturnPath, APP_DISTRIBUTION);
          sessionStorage.removeItem('squad_return_path');
          router.push(returnPath);
          return;
        }
        try {
          const userDoc = await withTimeout(
            getDoc(doc(db, 'users', user.uid)),
            8000,
            'Profile lookup timed out',
          );
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (user.email && data.email !== user.email) {
              await updateDoc(userDoc.ref, { email: user.email });
            }
            const tokenResult = await user.getIdTokenResult();
            if (tokenResult.claims.role === 'superadmin') {
              router.push('/admin');

            } else {
              router.push('/dashboard');
            }
          } else {
            router.push('/onboarding');
          }
        } catch (e) {
          router.push('/onboarding');
        }
        // Keep feedback active until navigation unmounts this page.
      };
      fetchRole();
    }
  }, [user, isUserLoading, db, router, auth, isDemoLoading, nativeBusy]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isHydrated || emailLoginPending.current || isLoading || isDemoLoading || nativeBrowserAuthGate.busy()) return;
    if (!e.currentTarget.checkValidity()) {
      e.currentTarget.reportValidity();
      return;
    }
    // Read the submitted DOM values as browsers/password managers can autofill
    // without updating React state before submitting.
    const submittedEmail = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value;
    const submittedPassword = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value;
    // Lock synchronously: a second submit can arrive before React renders.
    setFormError('');
    emailLoginPending.current = true;
    flushSync(() => setIsLoading(true));
    try {
      // A synchronous commit updates the DOM, but the browser still needs a
      // rendering opportunity before SDK work or a native account sheet starts.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      // Firebase owns the request timeout. Racing its promise here would unlock
      // retries while the original sign-in could still authenticate later.
      await signInWithEmailAndPassword(auth, submittedEmail.trim().toLowerCase(), submittedPassword);
    } catch (error: any) {
      const message = authFailureMessage(error);
      setFormError(message);
      toast({
        title: "Login Failed",
        description: message,
        variant: "destructive",
      });
      emailLoginPending.current = false;
      setIsLoading(false);
    }
    // Firebase success starts session/profile setup in the user effect above.
    // Releasing here creates an enabled, idle-looking form during that work.
  };

  const handleGoogleLogin = async () => {
    if (emailLoginPending.current || nativeBrowserAuthGate.busy()) return;
    emailLoginPending.current = true;
    setFormError('');
    flushSync(() => setIsLoading(true));
    let signedIn = false;
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Auth is initialized through the shared provider. Supplying the browser
      // resolver from this same ESM module keeps the provider/resolver class
      // identities aligned so Firebase includes providerId in the handler URL.
      // This promise includes the user's time choosing an account. Firebase
      // reports cancellation/network failures; a request timer cannot safely
      // cancel the popup and would falsely fail a still-active sign-in.
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      signedIn = true;
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return;
      const message = error.code === 'auth/popup-blocked'
          ? 'Allow pop-ups for The Squad in your browser, then try again.'
          : error.code === 'auth/network-request-failed'
            ? 'Check your connection, then try signing in with Google again.'
            : 'Could not sign in with Google. Please try again or use your email and password.';
      setFormError(message);
      toast({ title: "Google Login Failed", description: message, variant: "destructive" });
    } finally {
      if (!signedIn) {
        emailLoginPending.current = false;
        setIsLoading(false);
        setIsGoogleLoading(false);
      }
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resetPending.current) return;
    setResetError('');
    const target = (e.currentTarget.elements.namedItem('resetEmail') as HTMLInputElement).value.trim();
    if (!target) {
      toast({ title: "Email Required", description: "Enter the email address tied to your account.", variant: "destructive" });
      return;
    }
    resetPending.current = true;
    flushSync(() => setForgotLoading(true));
    try {
      // Use our branded Resend email instead of Firebase's default template
      const res = await fetch('/api/email/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send reset email');
      }
      setForgotSent(true);
    } catch (error: any) {
      setResetError("Reset request could not be completed. Check your connection and try again.");
    } finally {
      resetPending.current = false;
      setForgotLoading(false);
    }
  };

  const handleLaunchDemo = async (planId: string) => {
    if (nativeBrowserAuthGate.busy()) return;
    setIsDemoLoading(true);
    try {
      // Clear current session first to prevent state pollution
      await clearBrowserSession();
      await signOut(auth);
      // Brief delay to ensure auth state clean
      await new Promise(resolve => setTimeout(resolve, 500));

      // Always wipe stale demo locks/state so the seeder runs fresh
      localStorage.removeItem('squad_seeding_lock');
      localStorage.removeItem('sf_session_team_id');
      sessionStorage.removeItem('squad_demo_start_time');
      
      const demoCredential = await signInAnonymously(auth);
      await bootstrapDemoWorkspace(demoCredential.user, planId);
      await establishBrowserSession(demoCredential.user);
      
      // Use window.location.replace to bypass internal router cache 
      // and ensure DashboardLayout initializes with fresh demo parameters
      window.location.replace(`/dashboard?seed_demo=${planId}`);
    } catch (error: any) {
      toast({
        title: "Demo Launch Failed",
        description: "Verification service unavailable. Try again shortly.",
        variant: "destructive"
      });
      setIsDemoLoading(false);
    }
  };

  const DEMO_LIST = [
    { id: 'starter_squad', name: 'Starter Plan Demo', icon: Users, desc: 'Grassroots essentials' },
    { id: 'squad_pro', name: 'Squad Pro Demo', icon: Zap, desc: 'Complete team management' },
    { id: 'elite_teams', name: 'Elite Org Demo', icon: Trophy, desc: 'Manage multiple teams' },
    { id: 'school_demo', name: 'School Demo', icon: GraduationCap, desc: 'Full K-12 Program Hub' },
    { id: 'player_demo', name: 'Player Demo', icon: User, desc: 'Schedule, chat, and profile' },
    { id: 'parent_demo', name: 'Parent Demo', icon: Baby, desc: 'Family schedule and waivers' },
    { id: 'league_demo', name: 'FREE League Creator Demo', icon: ShieldAlert, desc: 'Free plan · manage leagues without Pro' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.background} aria-hidden="true">
        <picture>
          <source media="(max-width: 520px)" srcSet="/images/auth/signin-court-mobile.webp" />
          {/* Precompressed local stock assets avoid third-party requests and large mobile downloads. */}
          <img src="/squad-pages/editorial/court.webp" alt="" width={1600} height={900} fetchPriority="high" decoding="async" />
        </picture>
      </div>
      <div className={styles.overlay} aria-hidden="true" />

      {!isStoreDistribution && (<div className={styles.homeNav}>
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest h-10 px-4 rounded-full border border-white/10 backdrop-blur-sm">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>)}

      <div className={styles.brand}>
        <BrandLogo variant="dark-background" className="h-16 w-48 drop-shadow-2xl" priority />
      </div>

      <div className={styles.layout}>
        <section className={styles.story} aria-label="Welcome to The Squad">
          <p className={styles.eyebrow}>Built for the whole team</p>
          <h2 className={styles.headline}>Your team.<br /><span>Your next level.</span></h2>
          <p className={styles.caption}>Bring your season together. Plan, connect, and compete with The Squad.</p>
        </section>
        <Card className={`border-none shadow-2xl rounded-[2rem] sm:rounded-[3rem] animate-in fade-in slide-in-from-left-8 duration-700 bg-white/95 backdrop-blur-sm ${styles.card}`}>
          <CardHeader className="space-y-2 pt-8 sm:pt-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase">
              {forgotMode ? 'Reset Password' : 'Sign In'}
            </h1>
            <CardDescription className="text-base font-bold uppercase tracking-widest text-muted-foreground text-[10px]">
              {forgotMode ? 'Enter your email to receive a reset link' : 'Use your account credentials'}
            </CardDescription>
          </CardHeader>

          {/* Keep announcements outside the busy form so they are not deferred. */}
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {!isHydrated ? "Preparing sign-in." : isLoading ? "Logging in. Please wait." : forgotLoading ? "Sending reset link. Please wait." : ""}
          </p>

          {forgotMode && resetError && <p role="alert" className="mx-6 text-sm text-destructive">{resetError}</p>}
          {/* ── Forgot Password flow ── */}
          {forgotMode ? (
            <form onSubmit={handleForgotPassword} aria-busy={forgotLoading}>
              <CardContent className="space-y-6 px-10">
                {forgotSent ? (
                  <div className="text-center space-y-4 py-6">
                    <div className="text-5xl">📬</div>
                    <p className="font-black text-lg uppercase tracking-tight">Check your inbox!</p>
                    <p role="status" className="text-sm text-muted-foreground font-medium">If an account uses this email, a reset link will be sent. Check your inbox and spam folder.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="font-black text-[10px] uppercase tracking-widest px-1 ml-1 text-muted-foreground">Account Email</Label>
                    <Input
                      id="forgot-email"
                      name="resetEmail"
                      disabled={forgotLoading}
                      type="email"
                      autoComplete="email"
                      placeholder="name@organization.com"
                      required
                      autoFocus
                      value={forgotEmail || email}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="h-14 rounded-2xl bg-muted/50 border-2 border-transparent focus:border-primary/20 focus:bg-white transition-all text-base font-bold"
                    />
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-4 pb-12 px-10 pt-4">
                {!forgotSent && (
                  <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" type="submit" disabled={forgotLoading}>
                    {forgotLoading ? <><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin mr-2" />Sending reset link…</> : 'Send Reset Link'}
                  </Button>
                )}
                <button
                  type="button"
                  disabled={forgotLoading}
                  onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(''); setResetError(''); }}
                  className="text-[10px] font-black text-primary uppercase hover:underline tracking-widest"
                >
                  ← Back to Login
                </button>
              </CardFooter>
            </form>
          ) : (
          <form onSubmit={handleLogin} aria-busy={!isHydrated || isLoading} onInvalid={() => setFormError('Enter a valid email address and your password.')}>
            {formError && <p id="login-error" role="alert" className="mx-6 mb-4 text-sm text-destructive">{formError}</p>}
            <CardContent className="space-y-6 px-6 sm:px-10">
              
              {isStoreDistribution && process.env.NEXT_PUBLIC_NATIVE_AUTH_ENABLED === 'true' ? (
                <NativeProviderLogin disabled={isLoading || isDemoLoading} onVerified={() => { nativeSessionVerified.current = true; }} />
              ) : BETA_MODE || isStoreDistribution ? (
                <div className="w-full h-14 rounded-2xl bg-muted/50 border border-dashed border-muted-foreground/20 flex items-center justify-center gap-3 text-muted-foreground cursor-not-allowed opacity-60" title={isStoreDistribution ? 'Google Sign-In requires the later native authentication package. Please use email and password.' : 'Google Sign-In temporarily unavailable during private beta. Please use email & password.'}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5 opacity-40" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {isStoreDistribution ? 'Google Sign-In — Not Available in App Yet' : 'Google Sign-In — Temporarily Disabled'}
                  </span>
                </div>
              ) : (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleGoogleLogin}
                  className="w-full h-14 rounded-2xl bg-white border border-gray-200 text-black font-bold hover:bg-gray-50 hover:text-black flex items-center justify-center gap-3"
                  disabled={isLoading || isDemoLoading}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {isGoogleLoading ? 'Waiting for Google...' : 'Continue with Google'}
                </Button>
              )}
              {isGoogleLoading && (
                <p role="status" className="text-sm text-center text-muted-foreground">
                  Complete sign-in in the Google window. Closing it cancels this attempt.
                </p>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-muted" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white/95 px-2 text-muted-foreground font-black tracking-widest">Or continue with email</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="font-black text-[10px] uppercase tracking-widest px-1 ml-1 text-muted-foreground">Email Address</Label>
                <Input 
                  id="email"
                  name="email"
                  maxLength={254}
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby={formError ? "login-error" : undefined} 
                  type="email" 
                  autoComplete="email"
                  placeholder="name@organization.com" 
                  required 
                  value={email}
                  disabled={!isHydrated || isLoading || nativeBusy}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 rounded-2xl bg-muted/50 border-2 border-transparent focus:border-primary/20 focus:bg-white transition-all text-base font-bold"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label htmlFor="password" className="font-black text-[10px] uppercase tracking-widest ml-1 text-muted-foreground">Password</Label>
                  <button type="button" disabled={!isHydrated || isLoading || isDemoLoading || nativeBusy} onClick={() => { setForgotMode(true); setForgotEmail(email); }} className="text-[10px] font-black text-primary uppercase hover:underline tracking-widest">Forgot?</button>
                </div>
                <div className="relative">
                  <PasswordInput 
                    id="password"
                    name="password"
                    aria-describedby={formError ? "login-error" : undefined} 
                     
                    autoComplete="current-password"
                    required 
                    value={password}
                    disabled={!isHydrated || isLoading || nativeBusy}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 rounded-2xl bg-muted/50 border-2 border-transparent focus:border-primary/20 focus:bg-white transition-all text-base font-bold pr-12"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-6 pb-10 sm:pb-12 px-6 sm:px-10 pt-4">
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" type="submit" disabled={!isHydrated || isLoading || isDemoLoading || nativeBusy}>
                {!isHydrated ? "Preparing sign-in…" : isLoading ? <><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin motion-reduce:animate-none mr-2" />Logging in…</> : "Sign In"}
              </Button>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {BETA_MODE ? 'Private beta — use email & password above' : <>Need an account? <Link href="/signup" className="text-primary hover:underline font-black">Create One</Link></>}
                </p>
              </div>
            </CardFooter>
          </form>
          )}
        </Card>

        <details id="demos" className={styles.demos}>
          <summary>Explore demo workspaces</summary>
          <div className={styles.demoContent}>
          <div className="bg-primary text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <ShieldAlert className="h-48 w-48" />
            </div>
            <div className="relative z-10 space-y-4">
              <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest text-[10px] px-3 h-6">Interactive Demos</Badge>
              <h3 className="text-4xl font-black tracking-tighter leading-none uppercase">Explore Demo <br />Workspaces</h3>
              <p className="text-white/80 font-medium text-sm leading-relaxed max-w-xs">
                Open a ready-to-use sample workspace for the role you want to explore.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {DEMO_LIST.map((demo) => (
              <Button 
                key={demo.id} 
                variant="outline" 
                className="h-24 rounded-[2rem] bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-between px-8 backdrop-blur-md group"
                onClick={() => handleLaunchDemo(demo.id)}
                disabled={isLoading || isDemoLoading || nativeBusy}
                aria-label={`Open ${demo.name}: ${demo.desc}`}
              >
                <div className="flex items-center gap-6">
                  <div className="bg-white/10 p-4 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors">
                    <demo.icon className="h-7 w-7" />
                  </div>
                  <div className="text-left">
                    <p className="font-black text-sm uppercase tracking-tight">{demo.name}</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{demo.desc}</p>
                  </div>
                </div>
                {isDemoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-6 w-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />}
              </Button>
            ))}
          </div>
          </div>
        </details>
      </div>

      <div className={styles.footer}>
        <p className="text-[10px] text-white font-black uppercase tracking-[0.3em]">The Squad • thesquad.pro</p>
        <p>Stock photo: <a href="https://unsplash.com/photos/basketball-court-near-body-of-water-itqkcMEix64" target="_blank" rel="noopener noreferrer">JC Dela Cuesta / Unsplash</a></p>
      </div>
    </div>
  );
}
