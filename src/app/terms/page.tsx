
"use client";

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

export default function TermsOfServicePage() {
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
        <h1 className="text-4xl font-black tracking-tight mb-8">Terms of Service</h1>
        
        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">1. Acceptance of Terms</h2>
            <p>
              By accessing or using The Squad, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">2. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account. Team admins are responsible for the conduct of their members within their specific squad hubs.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">3. Prohibited Conduct</h2>
            <p>
              Users of The Squad agree not to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Harass, abuse, or threaten other members of the community.</li>
              <li>Upload illegal, offensive, or malicious content.</li>
              <li>Interfere with the operation of the platform or its security measures.</li>
              <li>Misrepresent their identity or role within a team.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">4. Subscriptions & Payments</h2>
            <p>
              Pro Squad subscriptions are billed at <strong>$12.99 USD per month per team</strong>. Multi-team discounts are available through Club Tiers starting at <strong>$23.99 USD/month</strong>. Payments are non-refundable for partial months of service. We reserve the right to change our pricing with 30 days' notice.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">5. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at our discretion if these terms are violated. You may delete your account at any time through the settings menu.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">6. Limitation of Liability</h2>
            <p>
              The Squad is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the platform, including missed games, scheduling errors, or loss of data.
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
