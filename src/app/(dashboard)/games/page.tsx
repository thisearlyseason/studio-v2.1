"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trophy, Plus, MapPin, TrendingUp, Lock, LineChart as ChartIcon, ChevronRight, Zap, Quote, Loader2, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTeam, League } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from "@/components/ui/date-picker";

const chartConfig = {
  myScore: { label: "Our Score", color: "hsl(var(--primary))" },
  opponentScore: { label: "Opponent", color: "hsl(var(--secondary))" },
} satisfies ChartConfig;

export default function GamesPage() {
  const { activeTeam, addGame, updateGame, isSuperAdmin, purchasePro, hasFeature, isStaff, activeTeamEvents } = useTeam();
  const db = useFirestore();
  
  const gamesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), orderBy('date', 'desc'), limit(20));
  }, [activeTeam?.id, db]);

  const { data: rawGames, isLoading } = useCollection(gamesQuery);
  const games = useMemo(() => (rawGames || []).map(g => ({ ...g, date: new Date(g.date) })), [rawGames]);

  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<any>(null);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [myScore, setMyScore] = useState('');
  const [opponentScore, setOpponentScore] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('manual');
  const searchParams = useSearchParams();

  const scheduledMatches = useMemo(() => {
    return (activeTeamEvents || []).filter(e => e.eventType === 'game');
  }, [activeTeamEvents]);

  // Check if a match has already been recorded for an event
  const recordedEventIds = useMemo(() => {
    return new Set(games.map(g => g.eventId).filter(Boolean));
  }, [games]);

  useEffect(() => {
    const recordEventId = searchParams.get('recordEventId');
    if (recordEventId && !recordedEventIds.has(recordEventId)) {
      setSelectedEventId(recordEventId);
      setIsRecordOpen(true);
    }
  }, [searchParams, recordedEventIds]);

  useEffect(() => {
    if (selectedEventId && selectedEventId !== 'manual') {
      const event = scheduledMatches.find(e => e.id === selectedEventId);
      if (event) {
        // Use the explicit opponent field if available, otherwise try to extract from title
        if (event.opponent) {
          setOpponent(event.opponent);
        } else {
          const opponentMatch = event.title.match(/vs\s+(.*)/i) || event.title.match(/@\s+(.*)/i);
          setOpponent(opponentMatch ? opponentMatch[1].trim() : event.title);
        }
        
        // Format date for the input
        try {
          const d = new Date(event.date);
          setDate(d.toISOString().split('T')[0]);
        } catch (e) {
          setDate('');
        }
        
        setLocation(event.location);
      }
    }
  }, [selectedEventId, scheduledMatches]);

  const chartData = useMemo(() => {
    if (!games.length) return [];
    return [...games].sort((a, b) => a.date.getTime() - b.date.getTime()).map(g => ({
      date: format(g.date, 'MMM d'),
      myScore: g.myScore,
      opponentScore: g.opponentScore,
      opponentName: g.opponent,
    }));
  }, [games]);

  const stats = useMemo(() => {
    const wins = games.filter(g => g.result === 'Win').length;
    const losses = games.filter(g => g.result === 'Loss').length;
    const ties = games.filter(g => g.result === 'Tie').length;
    return { wins, losses, ties };
  }, [games]);

  if (isLoading) return <div className="flex flex-col items-center justify-center py-20 animate-pulse"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-xs font-black uppercase mt-4">Syncing Ledger...</p></div>;

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const isPro = hasFeature?.('stats_basic');

  const handleRecordGame = () => {
    if (!opponent || !date || !myScore || !opponentScore) return;
    const myS = parseInt(myScore); const oppS = parseInt(opponentScore);
    let result: 'Win' | 'Loss' | 'Tie' = 'Tie'; if (myS > oppS) result = 'Win'; if (myS < oppS) result = 'Loss';
    const payload: any = { 
      opponent, 
      date: new Date(date).toISOString(), 
      myScore: myS, 
      opponentScore: oppS, 
      result, 
      location, 
      notes: isPro ? notes : '',
      eventId: selectedEventId !== 'manual' ? selectedEventId : null
    };
    if (editingGame) updateGame(editingGame.id, payload); else addGame(payload);
    setIsRecordOpen(false); resetForm();
  };

  const resetForm = () => { setOpponent(''); setDate(''); setMyScore(''); setOpponentScore(''); setLocation(''); setNotes(''); setEditingGame(null); setSelectedEventId('manual'); };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Scorekeeping</h1>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Journey to Dominance</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { resetForm(); setIsRecordOpen(true); }} className="rounded-full shadow-lg h-12 px-8 font-black uppercase text-xs">
            <Plus className="h-4 w-4 mr-2" /> Record Match
          </Button>
        )}
      </div>

      {isPro ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 rounded-3xl border-none shadow-xl ring-1 ring-black/5 overflow-hidden bg-white">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg text-primary"><ChartIcon className="h-5 w-5" /></div>
                <CardTitle className="text-xs font-black uppercase tracking-[0.2em]">Trajectory</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="h-[250px] w-full">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} opacity={0.1} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: '900' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: '900' }} />
                    <ChartTooltip content={({ active, payload }) => {
                      if (active && payload?.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-black text-white rounded-xl p-3 shadow-2xl text-[10px] font-black border border-primary/20">
                            <p className="opacity-50 uppercase text-[8px] mb-1">{d.date}</p>
                            <div className="flex justify-between gap-4 items-center"><span className="opacity-70">US:</span><span className="text-primary">{d.myScore}</span></div>
                            <div className="flex justify-between gap-4 items-center"><span className="opacity-70 truncate max-w-[60px]">{d.opponentName}:</span><span>{d.opponentScore}</span></div>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Line type="monotone" dataKey="myScore" stroke="var(--color-myScore)" strokeWidth={4} dot={{ r: 4, fill: "var(--color-myScore)", strokeWidth: 2, stroke: "#fff" }} />
                    <Line type="monotone" dataKey="opponentScore" stroke="var(--color-opponentScore)" strokeWidth={2} strokeDasharray="4 4" opacity={0.4} />
                  </LineChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="rounded-[2.5rem] bg-primary text-white p-8 space-y-2 relative overflow-hidden group">
              <Zap className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Season Wins</p>
              <p className="text-6xl font-black">{stats.wins}</p>
            </Card>
            <Card className="rounded-[2.5rem] bg-black text-white p-8 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Losses / Ties</p>
              <p className="text-4xl font-black">{stats.losses} <span className="opacity-20">/</span> {stats.ties}</p>
            </Card>
          </div>
        </div>
      ) : (
        <div className="bg-muted/30 p-12 rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center text-center space-y-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm relative"><ChartIcon className="h-12 w-12 text-primary/40" /><Lock className="absolute -top-2 -right-2 h-6 w-6 bg-black text-white p-1 rounded-full border-4 border-background" /></div>
          <div className="space-y-2">
            <h3 className="text-xl font-black uppercase tracking-tight">Performance Analytics Locked</h3>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto">Upgrade to Pro to visualize season trajectory and win/loss metrics.</p>
          </div>
          <Button onClick={purchasePro} className="rounded-full px-10 h-12 font-black uppercase text-xs tracking-widest">Unlock Pro Analytics</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {games.map((game) => (
          <Card key={game.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 overflow-hidden hover:shadow-lg transition-all cursor-pointer bg-white group" onClick={() => {
            if (isAdmin) {
              setEditingGame(game);
              setOpponent(game.opponent);
              setDate(new Date(game.date).toISOString().split('T')[0]);
              setMyScore(game.myScore.toString());
              setOpponentScore(game.opponentScore.toString());
              setLocation(game.location || '');
              setNotes(game.notes || '');
              setSelectedEventId(game.eventId || 'manual');
              setIsRecordOpen(true);
            }
          }}>
            <div className={cn("h-1.5 w-full", game.result === 'Win' ? "bg-green-500" : game.result === 'Loss' ? "bg-red-600" : "bg-muted-foreground/30")} />
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={cn("text-[8px] font-black uppercase px-2 h-5 shadow-sm", game.result === 'Win' ? "bg-green-500" : game.result === 'Loss' ? "bg-red-600" : "bg-muted")}>{game.result}</Badge>
                <span className="text-[10px] font-black text-muted-foreground uppercase">{format(game.date, 'MMM d, yyyy')}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Opponent</p>
                  <h3 className="font-black text-lg uppercase truncate group-hover:text-primary transition-colors">{game.opponent}</h3>
                </div>
                <div className="flex items-baseline gap-1 text-right">
                  <span className={cn("text-3xl font-black", game.result === 'Win' ? "text-green-600" : game.result === 'Loss' ? "text-red-600" : "text-foreground")}>{game.myScore}</span>
                  <span className="text-muted-foreground font-black px-1">-</span>
                  <span className="text-xl font-black opacity-40">{game.opponentScore}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isRecordOpen} onOpenChange={setIsRecordOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <DialogTitle className="sr-only">Record Match Result</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Record Result</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Broadcast the final match score</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Link to Scheduled Match</Label>
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger className="h-14 rounded-2xl font-bold border-2 bg-muted/20">
                    <SelectValue placeholder="Select a scheduled match" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="manual">-- Manual Entry --</SelectItem>
                    {scheduledMatches.map(event => {
                      const isRecorded = recordedEventIds.has(event.id) && event.id !== editingGame?.eventId;
                      return (
                        <SelectItem key={event.id} value={event.id} disabled={isRecorded}>
                          <div className="flex flex-col items-start py-1">
                            <span className="font-black text-xs uppercase">{event.title}</span>
                            <span className="text-[10px] opacity-50 uppercase">{format(new Date(event.date), 'MMM d')} @ {event.location} {isRecorded ? '(Already Recorded)' : ''}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Opponent</Label>
                <Input placeholder="e.g. Tigers" value={opponent} onChange={e => setOpponent(e.target.value)} className="h-14 rounded-2xl font-bold border-2" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Us</Label>
                  <Input type="number" placeholder="0" value={myScore} onChange={e => setMyScore(e.target.value)} className="h-16 rounded-2xl font-black text-3xl text-center border-2" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Them</Label>
                  <Input type="number" placeholder="0" value={opponentScore} onChange={e => setOpponentScore(e.target.value)} className="h-16 rounded-2xl font-black text-3xl text-center border-2" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Match Date</Label>
                <DatePicker 
                  date={date} 
                  setDate={setDate} 
                  placeholder="Select Match Date"
                  className="h-12 rounded-xl border-2 font-black bg-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20" onClick={handleRecordGame}>Broadcast Final Score</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}