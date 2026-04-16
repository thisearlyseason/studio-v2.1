"use client";

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTeam, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Lock, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TournamentScorekeeperPortal() {
  const params = useParams();
  const teamId = params.teamId as string;
  const eventId = params.eventId as string;
  const { db } = useTeam();

  const eventsQuery = useMemoFirebase(() => {
    if (!db || !teamId) return null;
    return query(collection(db, 'teams', teamId, 'events'), where('isTournament', '==', true));
  }, [db, teamId]);

  const { data: events, loading } = useCollection<TeamEvent>(eventsQuery);
  const activeEvent = useMemo(() => events?.find(e => e.id === eventId), [events, eventId]);

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 lg:p-14">
      <div className="max-w-3xl mx-auto space-y-12">
         <div className="text-center space-y-4">
            <div className="bg-amber-500/20 text-amber-500 p-6 rounded-full inline-block"><Lock className="h-10 w-10" /></div>
            <h1 className="text-4xl font-black uppercase tracking-tighter">Scorekeeper Node</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Institutional Protocol: {activeEvent?.title || 'Unknown Series'}</p>
         </div>

         <div className="bg-slate-800 rounded-[3rem] p-10 border-2 border-slate-700 shadow-2xl space-y-8">
            <div className="space-y-4 text-center">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Awaiting Direct Match Assignment</p>
              <div className="flex justify-center"><Input placeholder="Enter Match ID Code" className="h-16 max-w-sm rounded-2xl bg-slate-900 border-slate-700 text-center font-black text-xl uppercase tracking-widest text-white shadow-inner" /></div>
              <Button className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700">Unlock Match Protocol</Button>
            </div>
         </div>
      </div>
    </div>
  );
}
