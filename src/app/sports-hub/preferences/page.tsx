'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings2, Check, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { SPORTS_HUB_SPORTS } from '@/lib/sports-hub-types';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { readSportsHubPreferences, sportsHubStorageKey } from '@/lib/sports-hub-storage';

type Difficulty = 'youth' | 'high-school' | 'college' | 'professional' | 'recreational';

const COACHING_LEVELS: Array<{ value: Difficulty; label: string }> = [
  { value: 'youth', label: 'Youth (U12 and under)' },
  { value: 'high-school', label: 'High School' },
  { value: 'college', label: 'College / University' },
  { value: 'professional', label: 'Professional / Semi-Pro' },
  { value: 'recreational', label: 'Recreational / Community' },
];

const AGE_GROUPS = ['U6', 'U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'Adult', 'Senior'];

const LEAGUE_TYPES = [
  { value: 'recreational', label: 'Recreational' },
  { value: 'competitive', label: 'Competitive' },
  { value: 'elite', label: 'Elite / Travel' },
  { value: 'school', label: 'School Program' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

function MultiSelect({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onToggle(opt)}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5',
            selected.includes(opt)
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          )}
        >
          {selected.includes(opt) && <Check className="h-3 w-3" />}
          {opt}
        </button>
      ))}
    </div>
  );
}

function SingleSelect({ options, selected, onSelect }: { options: { value: string; label: string }[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5',
            selected === opt.value
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          )}
        >
          {selected === opt.value && <Check className="h-3 w-3" />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function PreferencesPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [favoriteSports, setFavoriteSports] = useState<string[]>([]);
  const [coachingLevel, setCoachingLevel] = useState('');
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [leagueType, setLeagueType] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const p = readSportsHubPreferences(localStorage, user?.uid);
      setFavoriteSports(p.favoriteSports || []);
      setCoachingLevel(p.coachingLevel || '');
      setAgeGroups(p.ageGroups || []);
      setLeagueType(p.leagueType || '');
    } catch { /* ignore */ }
  }, [user?.uid]);

  const toggleSport = (sport: string) =>
    setFavoriteSports((prev) => prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]);

  const toggleAgeGroup = (ag: string) =>
    setAgeGroups((prev) => prev.includes(ag) ? prev.filter((a) => a !== ag) : [...prev, ag]);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    localStorage.setItem(sportsHubStorageKey('preferences', user?.uid), JSON.stringify({ favoriteSports, coachingLevel, ageGroups, leagueType }));
    setSaving(false);
    setSaved(true);
    toast({ title: 'Preferences Saved', description: 'Your Sports Hub is now personalized.' });
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl hero-gradient flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Sports Hub</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">My Preferences</h1>
          </div>
        </div>
        <p className="text-muted-foreground font-medium text-sm">
          Personalize your Sports Hub experience. We&apos;ll prioritize content that matches your coaching context.
        </p>
      </motion.div>

      <div className="space-y-6">
        <motion.section initial="hidden" animate="visible" variants={fadeUp} className="bg-card border rounded-2xl p-6">
          <h2 className="text-base font-black uppercase tracking-tighter mb-1">Favorite Sports</h2>
          <p className="text-xs text-muted-foreground font-medium mb-4">Select all sports you coach or manage.</p>
          <MultiSelect options={Array.from(SPORTS_HUB_SPORTS)} selected={favoriteSports} onToggle={toggleSport} />
        </motion.section>

        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="bg-card border rounded-2xl p-6">
          <h2 className="text-base font-black uppercase tracking-tighter mb-1">Coaching Level</h2>
          <p className="text-xs text-muted-foreground font-medium mb-4">What level do you primarily coach at?</p>
          <SingleSelect options={COACHING_LEVELS} selected={coachingLevel} onSelect={setCoachingLevel} />
        </motion.section>

        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="bg-card border rounded-2xl p-6">
          <h2 className="text-base font-black uppercase tracking-tighter mb-1">Age Groups</h2>
          <p className="text-xs text-muted-foreground font-medium mb-4">Which age groups do you work with?</p>
          <MultiSelect options={AGE_GROUPS} selected={ageGroups} onToggle={toggleAgeGroup} />
        </motion.section>

        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="bg-card border rounded-2xl p-6">
          <h2 className="text-base font-black uppercase tracking-tighter mb-1">Program Type</h2>
          <p className="text-xs text-muted-foreground font-medium mb-4">What type of program do you run?</p>
          <SingleSelect options={LEAGUE_TYPES} selected={leagueType} onSelect={setLeagueType} />
        </motion.section>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="w-full h-14 font-black uppercase tracking-widest text-sm gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Preferences'}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
