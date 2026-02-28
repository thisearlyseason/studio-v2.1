"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Plus, MapPin, Calendar, TrendingUp, TrendingDown, MinusCircle, Edit2, Lock, Sparkles, LineChart as ChartIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTeam, GameResult, Game } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

const chartConfig = {
  myScore: {
    label: "Our Score",
    color: "hsl(var(--primary))",
  },
  opponentScore: {
    label: "Opponent",
    color: "hsl(var(--secondary))",
  },
} satisfies ChartConfig;

export default function GamesPage() {
  const { activeTeam, addGame, updateGame, isPro, isSuperAdmin, purchasePro } = useTeam();
  const db = useFirestore();
  
  const gamesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), orderBy('date', 'desc'), limit(50));
  }, [activeTeam?.id, db]);

  const { data: rawGames } = useCollection(gamesQuery);
  const games = useMemo(() => (rawGames || []).map(g => ({ ...g, date: new Date(g.date) })), [rawGames]);

  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  // Form state
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [myScore, setMyScore] = useState('');
  const [opponentScore, setOpponentScore] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData = useMemo(() => {
    return [...games]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(g => ({
        date: g.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        myScore: g.myScore,
        opponentScore: g.opponentScore,
        opponentName: g.opponent,
      }));
  }, [games]);

  const encouragement = useMemo(() => {
    if (games.length === 0) return "Record your first game to start tracking progress!";
    const wins = games.filter(g => g.result === 'Win').length;
    const winRate = wins / games.length;
    const lastGame = games[0]; 
    if (lastGame?.result === 'Win') return "Victory! Carry this energy into the next one.";
    if (lastGame?.result === 'Loss') return "Tough game, champions are built in the comeback.";
    return winRate > 0.7 ? "You're dominating the league!" : "Every play is a step towards greatness.";
  }, [games]);

  if (!mounted || !activeTeam) return null;
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl relative">
          <Trophy className="h-16 w-16 text-primary" />
          <div className="absolute -top-2 -right-2 bg-black text-white p-2 rounded-full shadow-lg border-2 border-background"><Lock className="h-4 w-4" /></div>
        </div>
        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Pro Season Tracker</h1>
          <p className="text-muted-foreground font-medium">Record results and track season progress with a Pro Squad subscription.</p>
        </div>
        <Button className="w-full max-w-sm h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>Upgrade Squad</Button>
      </div>
    );
  }

  const handleRecordGame = () => {
    if (!opponent || !date || !myScore || !opponentScore) return;
    const myS = parseInt(myScore);
    const oppS = parseInt(opponentScore);
    let result: GameResult = 'Tie';
    if (myS > oppS) result = 'Win';
    if (myS < oppS) result = 'Loss';

    const payload = { opponent, date: new Date(date).toISOString(), myScore: myS, opponentScore: oppS, result, location, notes };
    if (editingGame) updateGame(editingGame.id, payload);
    else addGame(payload);

    setIsRecordOpen(false);
    resetForm();
  };

  const resetForm = () => { setOpponent(''); setDate(''); setMyScore(''); setOpponentScore(''); setLocation(''); setNotes(''); setEditingGame(null); };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">Games & Results</h1>
        {isAdmin && (
          <Dialog open={isRecordOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsRecordOpen(o); }}>
            <DialogTrigger asChild><Button className="rounded-full shadow-lg shadow-primary/20 px-6 font-black uppercase text-xs h-11"><Plus className="h-4 w-4 mr-2" />Record Game</Button></DialogTrigger>
            <DialogContent className="sm:max-w-3xl rounded-[2.5rem] overflow-hidden p-0">
              <DialogTitle className="sr-only">Record Match Result</DialogTitle>
              <DialogDescription className="sr-only">Enter match details and final scores.</DialogDescription>
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-8 bg-muted/30 border-r space-y-6">
                  <DialogHeader><h2 className="text-2xl font-black">{editingGame ? "Update Match" : "Post Match"}</h2></DialogHeader>
                  <div className="space-y-4">
                    <Input placeholder="Opponent" value={opponent} onChange={e => setOpponent(e.target.value)} className="rounded-xl h-12" />
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl h-12" />
                    <div className="grid grid-cols-2 gap-4">
                      <Input type="number" placeholder="Our Score" value={myScore} onChange={e => setMyScore(e.target.value)} className="rounded-xl h-12 font-black text-lg border-primary/20" />
                      <Input type="number" placeholder="Their Score" value={opponentScore} onChange={e => setOpponentScore(e.target.value)} className="rounded-xl h-12 font-black text-lg" />
                    </div>
                  </div>
                </div>
                <div className="p-8 flex flex-col justify-between">
                  <Textarea placeholder="Match Highlights..." value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[200px] rounded-[2rem] p-6 font-bold bg-muted/10" />
                  <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 mt-6" onClick={handleRecordGame}>Commit Result</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-primary text-white border-none shadow-sm"><CardContent className="p-4 text-center"><div className="text-[10px] font-black uppercase opacity-60">Wins</div><div className="text-3xl font-black">{games.filter(g => g.result === 'Win').length}</div></CardContent></Card>
        <Card className="bg-black text-white border-none shadow-sm"><CardContent className="p-4 text-center"><div className="text-[10px] font-black uppercase opacity-60">Losses</div><div className="text-3xl font-black">{games.filter(g => g.result === 'Loss').length}</div></CardContent></Card>
        <Card className="bg-muted text-foreground border-none shadow-sm"><CardContent className="p-4 text-center"><div className="text-[10px] font-black uppercase opacity-60">Ties</div><div className="text-3xl font-black">{games.filter(g => g.result === 'Tie').length}</div></CardContent></Card>
      </div>

      {games.length > 0 && (
        <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="bg-muted/30"><div className="flex items-center gap-2"><ChartIcon className="h-4 w-4 text-primary" /><CardTitle className="text-lg font-black uppercase">Performance Trend</CardTitle></div></CardHeader>
          <CardContent className="p-6">
            <div className="h-[200px] w-full pt-4">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} opacity={0.15} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: '900' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: '900' }} />
                  <ChartTooltip content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-black text-white rounded-xl p-4 shadow-2xl text-xs font-black space-y-1">
                          <p className="opacity-50 uppercase text-[9px] tracking-widest">{d.date}</p>
                          <p className="flex justify-between gap-6"><span>{activeTeam.name}:</span> <span className="text-primary">{d.myScore}</span></p>
                          <p className="flex justify-between gap-6 opacity-70"><span>Vs. {d.opponentName}:</span> <span>{d.opponentScore}</span></p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Line type="monotone" dataKey="myScore" stroke="var(--color-myScore)" strokeWidth={5} dot={{ r: 6, fill: "var(--color-myScore)", strokeWidth: 3, stroke: "#fff" }} />
                  <Line type="monotone" dataKey="opponentScore" stroke="var(--color-opponentScore)" strokeWidth={3} strokeDasharray="6 6" />
                </LineChart>
              </ChartContainer>
            </div>
            <div className="bg-primary/5 rounded-2xl p-5 flex items-start gap-4 border-2 border-primary/10 mt-6">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm font-bold italic">"{encouragement}"</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
