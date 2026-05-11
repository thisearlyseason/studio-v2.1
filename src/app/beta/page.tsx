"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  ChevronRight, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Trophy, 
  AlertCircle, 
  CheckCircle2,
  Send,
  MessageSquare,
  Smartphone,
  Bug,
  Percent
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import BrandLogo from '@/components/BrandLogo';
import { useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';

export default function BetaApplicationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const db = useFirestore();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const data: any = Object.fromEntries(formData.entries());
      data.devices = formData.getAll('devices');
      data.features = formData.getAll('features');
      
      await addDoc(collection(db, 'beta_applications'), {
        ...data,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      
      setIsSubmitted(true);
    } catch (err: any) {
      toast({ title: 'Application Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const featureInterests = [
    "Team Management",
    "League Management",
    "Scheduling",
    "Communication / Messaging",
    "Registrations",
    "Payments",
    "Tournament Tools",
    "Live Scores",
    "Stats & Analytics",
    "Coach Tools",
    "Media Sharing",
    "AI Features",
    "Social Features",
    "Other"
  ];

  const devices = ["iPhone", "Android", "Tablet", "Desktop"];

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight">Application Received</h2>
          <p className="text-white/60 font-medium">
            Thank you for applying to The Squad Pro Beta. We are reviewing applications and will contact you soon at the provided email.
          </p>
          <Link href="/">
            <Button className="w-full mt-4 h-12 rounded-full font-black uppercase tracking-widest text-xs">
              Return to Home
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-primary/20">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md py-4 border-b border-white/10">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo variant="dark-background" className="h-8 w-32" />
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/">
              <Button variant="ghost" className="text-white/60 hover:text-white font-bold text-xs uppercase tracking-widest">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-black to-black pointer-events-none" />
        
        <div className="container mx-auto max-w-4xl relative z-10 text-center space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="bg-primary/20 text-primary border-primary/30 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] mb-6">
              Founding Tester Program
            </Badge>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase">
              Early Access Beta <br />
              <span className="text-primary italic">The Squad Pro.</span>
            </h1>
          </motion.div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto font-medium leading-relaxed"
          >
            Help shape the future of sports team, league, and tournament management software. We are looking for serious coaches, admins, and organizers.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8 max-w-3xl mx-auto"
          >
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-center">Exclusive Access</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-center">Limited Spots</span>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/10 blur-xl" />
              <Percent className="h-6 w-6 text-primary relative z-10" />
              <span className="text-xs font-black uppercase tracking-widest text-center relative z-10 text-primary">30% Off 1st Year</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="pt-8"
          >
            <Button onClick={() => document.getElementById('application-form')?.scrollIntoView({ behavior: 'smooth' })} size="lg" className="h-14 px-10 rounded-full text-sm font-black shadow-2xl shadow-primary/40 uppercase tracking-widest">
              Apply for Beta Access <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Main Form Section */}
      <section id="application-form" className="py-20 px-6 bg-black relative">
        <div className="container mx-auto max-w-3xl">
          <form onSubmit={handleSubmit} className="space-y-12">
            
            {/* 1. Basic Information */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">1</div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-widest text-white/70">Full Name *</Label>
                  <Input id="fullName" name="fullName" required className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="Coach Carter" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-white/70">Email Address *</Label>
                  <Input id="email" name="email" type="email" required className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="coach@team.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-white/70">Phone Number (Optional)</Label>
                  <Input id="phone" name="phone" type="tel" className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org" className="text-xs font-bold uppercase tracking-widest text-white/70">Organization / Team Name *</Label>
                  <Input id="org" name="organization" required className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="Elite Athletics" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="role" className="text-xs font-bold uppercase tracking-widest text-white/70">Primary Role *</Label>
                  <select id="role" name="role" defaultValue="" required className="flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 appearance-none">
                    <option value="" disabled className="text-black">Select your role</option>
                    <option value="coach" className="text-black">Coach</option>
                    <option value="manager" className="text-black">Team Manager</option>
                    <option value="league_admin" className="text-black">League Administrator</option>
                    <option value="tournament_org" className="text-black">Tournament Organizer</option>
                    <option value="parent" className="text-black">Parent</option>
                    <option value="athlete" className="text-black">Athlete</option>
                    <option value="other" className="text-black">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Sports & Experience */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">2</div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Sports & Experience</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="sports" className="text-xs font-bold uppercase tracking-widest text-white/70">What sports do you manage or participate in? *</Label>
                  <Input id="sports" name="sports" required className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="Basketball, Soccer, Baseball..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scale" className="text-xs font-bold uppercase tracking-widest text-white/70">How many teams or athletes do you manage? *</Label>
                  <Input id="scale" name="scale" required className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="e.g., 5 teams, 60 athletes" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_tools" className="text-xs font-bold uppercase tracking-widest text-white/70">What platforms/tools are you currently using? *</Label>
                  <Input id="current_tools" name="currentTools" required className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="TeamSnap, Excel, GameChanger..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frustrations" className="text-xs font-bold uppercase tracking-widest text-white/70">What frustrates you most about current sports management apps? *</Label>
                  <Textarea id="frustrations" name="frustrations" required className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl focus-visible:ring-primary resize-y" placeholder="Tell us what's broken in your current workflow..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="must_have" className="text-xs font-bold uppercase tracking-widest text-white/70">What would make a sports management app a "must-have" for you? *</Label>
                  <Textarea id="must_have" name="mustHave" required className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl focus-visible:ring-primary resize-y" placeholder="If it could just do..." />
                </div>
              </div>
            </div>

            {/* 3. Beta Tester Quality Screening */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">3</div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Quality Screening</h3>
              </div>

              <div className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="why_beta" className="text-xs font-bold uppercase tracking-widest text-white/70">Why do you want to become a beta tester for The Squad Pro? *</Label>
                  <Textarea id="why_beta" name="whyBeta" required className="bg-white/5 border-white/10 text-white min-h-[100px] rounded-xl focus-visible:ring-primary resize-y" placeholder="Your motivation..." />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-white/70">Have you ever beta tested software before? *</Label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" name="tested_before" value="yes" required className="w-4 h-4 text-primary bg-white/5 border-white/20 focus:ring-primary accent-primary" />
                      <span className="text-sm font-medium group-hover:text-primary transition-colors">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" name="tested_before" value="no" required className="w-4 h-4 text-primary bg-white/5 border-white/20 focus:ring-primary accent-primary" />
                      <span className="text-sm font-medium group-hover:text-primary transition-colors">No</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="frequency" className="text-xs font-bold uppercase tracking-widest text-white/70">How frequently would you use the platform during beta testing? *</Label>
                  <select id="frequency" name="frequency" defaultValue="" required className="flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 appearance-none">
                    <option value="" disabled className="text-black">Select frequency</option>
                    <option value="daily" className="text-black">Daily</option>
                    <option value="weekly" className="text-black">A few times a week</option>
                    <option value="monthly" className="text-black">A few times a month</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-white/70">Which devices will you use? (Select all that apply) *</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {devices.map((device) => (
                      <label key={device} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all">
                        <input type="checkbox" name="devices" value={device} className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary border-white/20 bg-black" />
                        <span className="text-sm font-bold">{device}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Feature Interest */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">4</div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Feature Interest</h3>
              </div>

              <div className="space-y-4">
                <Label className="text-xs font-bold uppercase tracking-widest text-white/70 block mb-4">Select the modules you are most interested in testing:</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {featureInterests.map((feature) => (
                    <label key={feature} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group">
                      <input type="checkbox" name="features" value={feature} className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary border-white/20 bg-black" />
                      <span className="text-sm font-bold group-hover:text-primary transition-colors">{feature}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. Community & Referrals */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">5</div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Community</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="referral" className="text-xs font-bold uppercase tracking-widest text-white/70">How did you hear about us?</Label>
                  <Input id="referral" name="referral" className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="Search, Social Media, Friend..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="socials" className="text-xs font-bold uppercase tracking-widest text-white/70">Social Media Handles (Optional)</Label>
                  <Input id="socials" name="socials" className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus-visible:ring-primary" placeholder="@yourhandle" />
                </div>
              </div>
            </div>

            {/* Beta Tester Expectations */}
            <Card className="bg-primary/5 border-primary/20 mt-12 rounded-[2rem]">
              <CardContent className="p-8 space-y-6 text-white">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-primary" />
                  <h4 className="text-xl font-black uppercase tracking-tight">Beta Tester Expectations</h4>
                </div>
                
                <ul className="space-y-3 text-sm text-white/80 font-medium list-disc list-inside marker:text-primary">
                  <li>This is beta software and may contain bugs or incomplete features</li>
                  <li>Testers must provide honest, constructive feedback</li>
                  <li>Bugs should be reported with detail and clarity</li>
                  <li>Respectful communication is required at all times</li>
                  <li>Features may change or be removed during beta</li>
                  <li>Access may be revoked for misuse, inactivity, or abuse</li>
                  <li>Testers may receive early access to new features</li>
                  <li>Feedback will directly influence product development</li>
                  <li>Participation does not guarantee permanent access</li>
                  <li className="text-primary font-bold">Approved testers receive 30% OFF any annual plan for the first year</li>
                </ul>

                <div className="pt-4 mt-4 border-t border-primary/20">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" required className="w-5 h-5 mt-0.5 rounded text-primary focus:ring-primary accent-primary border-primary/40 bg-black" />
                    <span className="text-sm font-bold uppercase tracking-wide group-hover:text-primary transition-colors">
                      I understand and agree to the beta tester expectations. *
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Feedback Instructions */}
            <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <h4 className="text-lg font-black uppercase tracking-tight">Feedback Protocol</h4>
              </div>
              <p className="text-sm text-white/70 leading-relaxed font-medium">
                Detailed feedback is critical. When reporting issues, please include screenshots, device information, and step-by-step instructions to reproduce the bug. Active participation shapes the final product.
              </p>
              <div className="flex items-center gap-2 text-sm font-bold pt-2">
                <span className="text-white/50 uppercase tracking-widest text-xs">Direct Comms:</span>
                <a href="mailto:thisearlyseason@gmail.com" className="text-primary hover:underline">thisearlyseason@gmail.com</a>
              </div>
            </div>

            {/* Final CTA */}
            <div className="pt-12 pb-8 text-center space-y-8 border-t border-white/10">
              <div className="space-y-2">
                <h3 className="text-3xl md:text-5xl font-black uppercase tracking-tighter">Shape the Platform.</h3>
                <p className="text-primary font-bold uppercase tracking-widest text-sm">Join the founding beta community.</p>
              </div>
              
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full md:w-auto h-16 px-12 rounded-full text-base font-black shadow-2xl shadow-primary/40 uppercase tracking-widest hover:scale-105 transition-transform"
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>Submit Application <Send className="ml-3 h-5 w-5" /></>
                )}
              </Button>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mt-6">Limited beta spots available.</p>
            </div>

          </form>
        </div>
      </section>
    </div>
  );
}
