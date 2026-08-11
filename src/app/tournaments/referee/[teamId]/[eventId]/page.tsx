"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase';
import { usePublicPortal } from '@/hooks/use-public-portal';
import { format, parseISO } from 'date-fns';
import { 
  UserCheck, Calendar, MapPin, Clock, 
  Trophy, Shield, Loader2, LogIn, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PortalStatus } from '@/components/public/PortalStatus';

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
  referees?: TournamentReferee[];
  activeReferee?: TournamentReferee | null;
  tournamentGames?: RefereeGame[];
  logoUrl?: string;
  location?: string;
}

export default function RefereePortalPage({ params: rawParams }: { params: Promise<{ teamId: string; eventId: string }> }) {
  const params = React.use(rawParams);
  const { user: firebaseUser, isAuthResolved } = useUser();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isTokenResolved, setIsTokenResolved] = useState(false);
  const [tokenRetryKey, setTokenRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAuthToken(null);
    setIsTokenResolved(false);
    if (!firebaseUser || firebaseUser.isAnonymous) {
      setIsTokenResolved(true);
      return () => { cancelled = true; };
    }
    firebaseUser.getIdToken()
      .then(token => {
        if (!cancelled) {
          setAuthToken(token);
          setIsTokenResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthToken(null);
          setIsTokenResolved(true);
        }
      });
    return () => { cancelled = true; };
  }, [firebaseUser, tokenRetryKey]);

  const registeredUser = firebaseUser && !firebaseUser.isAnonymous ? firebaseUser : null;
  const tokenFailed = Boolean(registeredUser && isTokenResolved && !authToken);
  const portalReady = isAuthResolved && isTokenResolved;
  const activeEmail = authToken ? registeredUser?.email?.trim().toLowerCase() || '' : '';
  const portalUrl = portalReady
    ? `/api/public/portals?kind=tournament&teamId=${encodeURIComponent(params.teamId)}&eventId=${encodeURIComponent(params.eventId)}${activeEmail ? `&refereeEmail=${encodeURIComponent(activeEmail)}` : ''}`
    : null;
  const { data: event, isLoading: loading, error, status, retry } = usePublicPortal<EventData>(portalUrl, {
    authorizationToken: authToken,
  });
  const activeRef = event?.activeReferee || null;

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

  if (!portalReady || loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin opacity-30" />
      </div>
    );
  }

  if (!event) return <PortalStatus status={status} message={error} onRetry={retry} title={status === 404 ? 'Event Not Found' : undefined} />;

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
                {(event.referees || []).length} Official{(event.referees || []).length !== 1 ? 's' : ''} · {(event.tournamentGames || []).length} Matches
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
                <h2 className="text-2xl font-black uppercase tracking-tight">
                  {registeredUser ? 'Assignment Access' : 'Sign In Required'}
                </h2>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  {registeredUser
                    ? 'Assignments are matched to your verified account email'
                    : 'Use the account email registered by the tournament organizer'}
                </p>
              </div>
            </div>
            {registeredUser ? (
              <div className="space-y-4">
                <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-5">
                  <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">
                    {tokenFailed
                      ? 'Your signed-in session could not be verified. Refresh the session or sign in again.'
                      : 'No assignments are available for this signed-in account. Confirm that the organizer used the same email, then try again.'}
                  </p>
                </div>
                <Button
                  onClick={() => tokenFailed ? setTokenRetryKey(value => value + 1) : retry()}
                  className="w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> {tokenFailed ? 'Refresh Session' : 'Refresh Assignments'}
                </Button>
              </div>
            ) : (
              <Button asChild className="w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest bg-blue-600 hover:bg-blue-700 text-white">
                <Link href={`/login?returnTo=${encodeURIComponent(`/tournaments/referee/${params.teamId}/${params.eventId}`)}`}>
                  <LogIn className="h-4 w-4 mr-2" /> Sign In to Continue
                </Link>
              </Button>
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
          </>
        )}
      </div>
    </div>
  );
}
