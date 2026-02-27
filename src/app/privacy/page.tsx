
"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicyPage() {
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
              You can update your profile information at any time in the settings menu. If you wish to delete your account or team data, please contact us at <strong>team@thesquad.io</strong>.
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
