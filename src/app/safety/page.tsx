
"use client";

import React from 'react';
import Link from 'next/link';
import { ChevronLeft, ShieldCheck, Users, MessageSquare, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

export default function SafetyCenterPage() {
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

      <main className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-5xl font-black tracking-tight">Safety Center</h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto">
            Our mission is to provide a secure and respectful environment for squads to coordinate their success.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
            <CardContent className="p-8 space-y-4">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">Verified Membership</h3>
              <p className="text-muted-foreground leading-relaxed">
                Teams are private hubs. Access is only granted via a unique 6-character team code provided by your coach or admin. Never share your team code publicly.
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
            <CardContent className="p-8 space-y-4">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">Role-Based Controls</h3>
              <p className="text-muted-foreground leading-relaxed">
                Coaches and Admins have full control over the roster. They can manage member roles, remove users, and moderate content to ensure a safe team environment.
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
            <CardContent className="p-8 space-y-4">
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">Safe Communication</h3>
              <p className="text-muted-foreground leading-relaxed">
                Our group chats are designed for team coordination. We encourage respectful dialogue. Harassment or bullying is strictly prohibited and should be reported to team leadership.
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
            <CardContent className="p-8 space-y-4">
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold">Reporting Issues</h3>
              <p className="text-muted-foreground leading-relaxed">
                If you encounter inappropriate behavior or a security concern, please notify your team admin immediately or contact our safety team at <strong>safety@thesquad.pro</strong>.
              </p>
            </CardContent>
          </Card>
        </div>

        <section className="bg-primary/5 rounded-[3rem] p-10 text-center space-y-6">
          <h2 className="text-3xl font-black tracking-tight">Parental Oversight</h2>
          <p className="text-lg text-muted-foreground font-medium max-w-2xl mx-auto">
            We offer a dedicated "Parent" role for youth sports teams, allowing parents to stay informed on schedules and events while monitoring team interactions.
          </p>
          <div className="pt-4">
            <Link href="/signup">
              <Button className="rounded-full px-8 font-bold">Join Your Team</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="py-12 bg-muted/50 border-t">
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
