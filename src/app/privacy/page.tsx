
"use client";

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={user ? "/feed" : "/"}>
            <BrandLogo variant="light-background" className="h-8 w-32" />
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            className="font-bold"
            onClick={() => user ? router.push('/settings') : router.push('/')}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            {user ? 'Back to Settings' : 'Back to Home'}
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <h1 className="text-4xl font-black tracking-tight mb-8">Privacy Policy</h1>
        
        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">1. Information We Collect</h2>
            <p>
              When you join The Squad, we collect information necessary to provide our team coordination services. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Data:</strong> Name, email address, and profile picture.</li>
              <li><strong>Team Data:</strong> Roster information, schedules, game results, and files uploaded to your team library.</li>
              <li><strong>Usage Data:</strong> How you interact with our platform to help us improve your experience.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">2. How We Use Your Information</h2>
            <p>
              We use your data to power the features of the app, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Facilitating team communication and scheduling.</li>
              <li>Processing Pro subscriptions and multi-team enrollments.</li>
              <li>Sending high-priority team alerts and notifications.</li>
              <li>Improving our service and providing technical support.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">3. Data Sharing</h2>
            <p>
              <strong>We do not sell your personal information.</strong> We only share data with service providers (like Firebase for database and authentication) necessary to operate the platform. Your team data is private to your specific squad and is only visible to verified members of that team.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">4. Data Security</h2>
            <p>
              We use industry-standard encryption and security protocols to protect your information. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">5. Your Rights</h2>
            <p>
              You can update your profile information in Settings. To request account deletion, sign in, open your account menu, and choose <strong>Delete Account</strong>. Transfer or delete any teams and leagues you own first, and cancel or resolve any active subscription. You may be asked to sign in again for security. Confirming the request signs you out and schedules your account for permanent removal after seven days. Removing an athlete from a team does not delete their account.
            </p>
            <p>
              If you cannot access your account or need help with account or team data deletion, contact <a href="mailto:team@thesquad.pro" className="font-bold underline underline-offset-4">team@thesquad.pro</a>. We may need to verify account ownership before processing your request.
            </p>
          </section>
        </div>
      </main>

      <footer className="py-12 bg-muted/50 border-t mt-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <Link href="/" className="flex items-center gap-3">
              <BrandLogo variant="light-background" className="h-8 w-32" />
            </Link>
            
            <div className="flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              <Link href="/how-to" className="hover:text-primary transition-colors">How to Guide</Link>
              <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
              <Link href="/safety" className="hover:text-primary transition-colors">Safety Center</Link>
            </div>

            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
