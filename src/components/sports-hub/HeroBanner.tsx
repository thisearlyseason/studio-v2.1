'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Newspaper, BookOpen, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchBar } from './SearchBar';

export function HeroBanner() {
  const stats = [
    { icon: Newspaper, label: 'Articles', value: '100+' },
    { icon: BookOpen, label: 'Resources', value: '30+' },
    { icon: Trophy, label: 'Categories', value: '8' },
    { icon: Zap, label: 'Updated', value: 'Weekly' },
  ];

  return (
    <section className="relative overflow-hidden hero-gradient rounded-3xl" aria-label="Sports Hub hero">
      <div className="absolute inset-0 grid-beam opacity-20 pointer-events-none" aria-hidden />
      <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute bottom-0 left-0 w-56 h-56 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl pointer-events-none" aria-hidden />

      <div className="relative z-10 px-8 md:px-12 py-14 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Badge className="bg-white/20 text-white border-white/30 font-black text-[9px] uppercase tracking-widest mb-4 hover:bg-white/30">
            The Squad Sports Hub
          </Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white leading-none mb-4">
            The Command Center<br />
            <span className="text-white/60">for Serious Coaches</span>
          </h1>
          <p className="text-white/70 font-medium text-base md:text-lg max-w-2xl mb-8 leading-relaxed">
            Original articles, free resources, and coaching tools — everything your program needs to stay ahead. Built for coaches, organizers, and athletes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <SearchBar size="lg" className="flex-1 max-w-xl" />
            <Link href="/sports-hub/playbook">
              <Button className="h-14 bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs px-6 gap-2 shadow-2xl shadow-black/20 w-full sm:w-auto">
                Browse Playbook <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <Icon className="h-5 w-5 text-white/60 mb-2" />
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
