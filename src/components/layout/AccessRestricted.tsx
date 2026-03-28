"use client";

import React from 'react';
import { ShieldAlert, Zap, Lock, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export function AccessRestricted({ 
  type = 'role', 
  title = "Institutional Hub Locked", 
  description = "Your current role does not have the necessary security clearance to access this tactical command center." 
}: { 
  type?: 'role' | 'tier' | 'feature', 
  title?: string, 
  description?: string 
}) {
  const router = useRouter();

  if (type === 'tier' || type === 'feature') {
    return (
      <div className="py-24 flex items-center justify-center p-6 animate-in fade-in zoom-in duration-500">
        <Card className="max-w-xl w-full rounded-[3.5rem] border-none shadow-2xl bg-black text-white relative overflow-hidden group">
          {/* Animated Background Element */}
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <Zap className="h-64 w-64" />
          </div>
          
          <CardContent className="p-12 space-y-10 relative z-10 text-center">
            {/* Pulsing Icon Container */}
            <div className="bg-primary p-6 rounded-[2.5rem] w-fit mx-auto shadow-2xl shadow-primary/40 -rotate-6 group-hover:rotate-0 transition-all duration-500 ring-2 ring-primary/20">
              <Lock className="h-10 w-10 text-white" />
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">Elite Upgrade Required</h1>
              <p className="text-white/60 font-medium leading-relaxed italic border-x-2 border-primary/20 px-8">
                Advanced features like Facilities, Equipment Vault, and Institutional Auditing are reserved for **Elite Pro** organizations.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <Button size="lg" className="h-16 rounded-[2rem] bg-white text-black hover:bg-primary hover:text-white font-black text-xl transition-all border-none shadow-xl active:scale-95 group/btn" onClick={() => router.push('/pricing')}>
                Upgrade Fleet Status <ArrowRight className="ml-2 h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
              </Button>
              <Button variant="ghost" className="text-white/40 hover:text-white font-black uppercase text-[10px] tracking-[0.3em] hover:bg-white/5 h-12 rounded-xl transition-all" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Return to Operations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-24 flex items-center justify-center p-6 animate-in fade-in zoom-in duration-500">
      <Card className="max-w-xl w-full rounded-[3.5rem] border-none shadow-2xl bg-[#0a0a0a] text-white relative overflow-hidden group border border-white/5">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <ShieldAlert className="h-64 w-64 text-primary" />
        </div>
        
        <CardContent className="p-12 space-y-10 relative z-10 text-center">
          <div className="bg-white/5 backdrop-blur-3xl p-6 rounded-[2.5rem] w-fit mx-auto shadow-2xl ring-1 ring-white/10 -rotate-6 group-hover:rotate-0 transition-all duration-700">
            <ShieldAlert className="h-10 w-10 text-primary" />
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">{title}</h1>
            <p className="text-white/50 font-medium leading-relaxed italic max-w-sm mx-auto">
              {description}
            </p>
          </div>

          <div className="pt-4">
            <Button size="lg" className="w-full h-16 rounded-[2.5rem] bg-white text-black hover:bg-primary hover:text-white font-black text-lg transition-all border-none shadow-2xl active:scale-95 flex items-center justify-center gap-3" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" /> Exit Command Center
            </Button>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mt-6 group-hover:text-primary transition-colors">Unauthorized access attempt logged to central telemetry</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
