"use client";

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { 
  UserCheck, Calendar, MapPin, Clock, 
  Trophy, Shield, ChevronRight, Search,
  Loader2, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RefereeGame {
  id: string;
  team1: string;
  team2: string;
  date: string;
  time: string;
  location?: string;
  round?: string;
  stage?: string;
  isCompleted?: boolean;
  refereeId?: string;
  refereeName?: string;
}

interface TournamentReferee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  certLevel?: string;
}

interface EventData {
  title: string;
  date: string;
  endDate?: string;
  refereePool?: TournamentReferee[];
  tournamentGames?: RefereeGame[];
  logoUrl?: string;
  location?: string;
}

export default function RefereePortalPage({ params: rawParams }: { params: Promise<{ teamId: string; eventId: string }> }) {
  const params = React.use(rawParams);
  const db = useFirestore();
  const { user: firebaseUser } = useUser();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchEmail, setSearchEmail] = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState('');

  React.useEffect(() => {
    if (!db) return;
    (async () => {
      const snap = await getDoc(doc(db, 'teams', params.teamId, 'events', params.eventId));
      if (snap.exists()) setEvent(snap.data() as EventData);
      setLoading(false);
    })();
  }, [db, params.teamId, params.eventId]);

  // Determine which referee we're viewing as
  const activeEmail = firebaseUser?.email || confirmedEmail;
  const activeRef = useMemo(() => {
    if (!event?.refereePool || !activeEmail) return null;
    return event.refereePool.find(r => r.email.toLowerCase() === activeEmail.toLowerCase()) ?? null;
  }, [event, activeEmail]);

  // Games assigned to this referee
  const myGames = useMemo(() => {
    if (!activeRef || !event?.tournamentGames) return [];
    return event.tournamentGames.filter(g => g.refereeId === activeRef.id);
  }, [activeRef, event]);

  // Group by date
  const gamesByDate = useMemo(() => {
    const map: Record<string, RefereeGame[]> = {};
    myGames.forEach(g => {
      if (!map[g.date]) map[g.date] = [];
      map[g.date].push(g);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [myGames]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin opacity-30" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center">
        <div className="text-center space-y-3 opacity-40">
          <AlertCircle className="h-12 w-12 mx-auto" />
          <p className="font-black uppercase tracking-widest text-sm">Event not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white px-8 py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute top-4 right-8"><Shield className="h-64 w-64" /></div>
        </div>
        <div className="relative z-10 max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-sm">
              <UserCheck className="h-7 w-7" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200">Referee Portal</p>
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-tight">
                {event.title}
              </h1>
            </div>
          </div>
          {event.date && (
            <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-blue-200 pt-2">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {format(parseISO(event.date), 'MMM d')}
                {event.endDate && ` – ${format(parseISO(event.endDate), 'MMM d, yyyy')}`}
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {event.location}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3 w-3" />
                {(event.refereePool || []).length} Official{(event.refereePool || []).length !== 1 ? 's' : ''} · {(event.tournamentGames || []).length} Matches
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* ── Identity Gate ── */}
        {!activeRef ? (
          <Card className="rounded-[3rem] p-10 border-none shadow-2xl bg-white space-y-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-500/10 p-4 rounded-2xl text-blue-600">
                <UserCheck className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Identify Yourself</h2>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  Enter your registered referee email to view your assignments
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="referee@email.com"
                value={searchEmail}
                onChange={e => setSearchEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setConfirmedEmail(searchEmail)}
                className="h-14 rounded-2xl border-2 text-sm font-bold"
              />
              <Button
                onClick={() => setConfirmedEmail(searchEmail)}
                disabled={!searchEmail.trim()}
                className="w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Search className="h-4 w-4 mr-2" /> Find My Assignments
              </Button>
              {confirmedEmail && !activeRef && (
                <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-red-600">
                    No referee found for <span className="italic">{confirmedEmail}</span>. 
                    Contact your tournament director.
                  </p>
                </div>
              )}
            </div>

            {/* Show all officials as a hint */}
            {(event.refereePool || []).length > 0 && (
              <div className="border-t pt-6 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  Registered Officials ({(event.refereePool || []).length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {(event.refereePool || []).map((ref: TournamentReferee) => (
                    <Badge key={ref.id} className="bg-muted text-foreground border font-black text-[9px] uppercase tracking-widest">
                      {ref.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <>
            {/* ── Referee Confirmed Banner ── */}
            <Card className="rounded-[2.5rem] p-8 border-none shadow-xl bg-blue-600 text-white flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-white/15 p-3 rounded-xl shrink-0">
                  <UserCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-black text-xl uppercase tracking-tight">{activeRef.name}</p>
                  <p className="text-[9px] text-blue-200 font-bold uppercase tracking-widest">
                    {activeRef.certLevel && `${activeRef.certLevel} · `}{myGames.length} match{myGames.length !== 1 ? 'es' : ''} assigned
                  </p>
                </div>
              </div>
              <Badge className="bg-white/20 text-white border-none font-black text-[9px] uppercase tracking-widest shrink-0">
                Verified
              </Badge>
            </Card>

            {/* ── No Assignments ── */}
            {myGames.length === 0 && (
              <Card className="rounded-[2.5rem] p-12 border-none shadow-xl bg-white text-center space-y-4">
                <div className="opacity-20"><Calendar className="h-16 w-16 mx-auto" /></div>
                <p className="font-black text-xl uppercase tracking-tight opacity-40">No Assignments Yet</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  The tournament director hasn&apos;t assigned any matches to you. Check back later.
                </p>
              </Card>
            )}

            {/* ── Games by Day ── */}
            {gamesByDate.map(([date, games]) => (
              <div key={date} className="space-y-4">
                {/* Day header */}
                <div className="flex items-center gap-3">
                  <div className="bg-black p-2.5 rounded-xl text-white shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-tight">
                      {(() => {
                        try { return format(parseISO(date), 'EEEE, MMMM d'); } catch { return date; }
                      })()}
                    </h2>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      {games.length} match{games.length !== 1 ? 'es' : ''}
                    </p>
                  </div>
                </div>

                {/* Game cards */}
                <div className="space-y-3">
                  {games.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(game => (
                    <Card key={game.id} className={cn(
                      "rounded-[2rem] p-6 border-none shadow-lg bg-white space-y-4 hover:shadow-xl transition-all",
                      game.isCompleted && "opacity-60"
                    )}>
                      {/* Teams */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-base uppercase tracking-tight">{game.team1}</span>
                            <span className="text-muted-foreground/40 font-normal text-sm">vs</span>
                            <span className="font-black text-base uppercase tracking-tight">{game.team2}</span>
                          </div>
                          {game.round && (
                            <Badge variant="outline" className="mt-1 text-[8px] font-black uppercase border-2 tracking-widest">
                              {game.round}
                            </Badge>
                          )}
                        </div>
                        {game.isCompleted && (
                          <Badge className="bg-emerald-500 text-white border-none font-black text-[8px] uppercase tracking-widest shrink-0">
                            Final
                          </Badge>
                        )}
                      </div>

                      {/* Meta info */}
                      <div className="grid grid-cols-2 gap-3">
                        {game.time && (
                          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-4 py-3">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-black text-sm uppercase tracking-tight">{game.time}</span>
                          </div>
                        )}
                        {game.location && (
                          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-4 py-3">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-black text-sm uppercase tracking-tight truncate">{game.location}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            {/* Change identity link */}
            <button
              onClick={() => { setConfirmedEmail(''); setSearchEmail(''); }}
              className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1.5 mx-auto"
            >
              <ChevronRight className="h-3 w-3" /> Not you? Switch referee
            </button>
          </>
        )}
      </div>
    </div>
  );
}
