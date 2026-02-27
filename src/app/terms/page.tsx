
"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsOfServicePage() {
  const brandLogoDark = PlaceHolderImages.find(img => img.id === 'brand-logo-dark')?.imageUrl || '';

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="relative h-8 w-32">
            <Image 
              src={brandLogoDark} 
              alt="The Squad Logo" 
              fill
              className="object-contain"
              data-ai-hint="black logo"
            />
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="font-bold">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
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
              Pro Squad subscriptions are billed at <strong>$9.99 USD per month per team</strong>. Multi-team discounts are available at <strong>$8.50 USD/month</strong> or <strong>$85 USD/year</strong>. Payments are non-refundable for partial months of service. We reserve the right to change our pricing with 30 days' notice.
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
        <div className="container mx-auto px-6 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
