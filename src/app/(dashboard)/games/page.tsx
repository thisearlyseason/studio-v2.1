
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Plus, MapPin, Calendar, TrendingUp, TrendingDown, MinusCircle, Edit2, Lock, Sparkles, LineChart as ChartIcon, ChevronRight, Zap, Quote } from 'lucide-react';
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
import { useTeam } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const { activeTeam, addGame, updateGame, isSuperAdmin, purchasePro, hasFeature } = useTeam();
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
    if (!games || games.length === 0) return [];
    return [...games]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(g => ({
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

  const momentum = useMemo(() => {
    if (games.length === 0) {
      return { message: "The journey to dominance begins with the first match. Let's get on the board!", type: 'neutral' };
    }
    const lastGame = games[0];
    if (lastGame.result === 'Win') {
      return { message: `Victory against ${lastGame.opponent}! Keep that energy high.`, type: 'positive' };
    }
    if (lastGame.result === 'Loss') {
      return { message: `Tough battle against ${lastGame.opponent}, elite squads are forged in the grit. Adjust and win.`, type: 'motivational' };
    }
    return { message: `A hard-fought draw. Find that extra gear for the next outing.`, type: 'neutral' };
  }, [games]);

  if (!mounted || !activeTeam) return null;
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canTrackScores = hasFeature('score_tracking');

  if (!canTrackScores) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-primary/10 p-6 rounded-2xl lg:rounded-[2.5rem] shadow-xl relative">
          <Trophy className="h-12 w-12 lg:h-16 lg:w-16 text-primary" />
          <div className="absolute -top-2 -right-2 bg-black text-white p-1.5 lg:p-2 rounded-full shadow-lg border-2 border-background"><Lock className="h-3 w-3 lg:h-4 lg:w-4" /></div>
        </div>
        <div className="text-center max-sm:px-4 space-y-3">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight uppercase">Score Tracking</h1>
          <p className="text-muted-foreground font-black uppercase tracking-widest text-[8px] lg:text-[10px] opacity-60">Record results and track progress</p>
          <p className="text-xs lg:text-sm font-medium text-muted-foreground pt-2 max-w-xs mx-auto">
            Unlock professional game tracking, win/loss analytics, and performance trends.
          </p>
        </div>
        <Button className="w-full max-w-sm h-14 rounded-2xl text-base lg:text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>Upgrade Squad</Button>
      </div>
    );
  }

  const handleRecordGame = () => {
    if (!opponent || !date || !myScore || !opponentScore) return;
    const myS = parseInt(myScore); const oppS = parseInt(opponentScore);
    let result: 'Win' | 'Loss' | 'Tie' = 'Tie'; if (myS > oppS) result = 'Win'; if (myS < oppS) result = 'Loss';
    const payload = { opponent, date: new Date(date).toISOString(), myScore: myS, opponentScore: oppS, result, location, notes };
    if (editingGame) updateGame(editingGame.id, payload); else addGame(payload);
    setIsRecordOpen(false); resetForm();
  };

  const resetForm = () => { setOpponent(''); setDate(''); setMyScore(''); setOpponentScore(''); setLocation(''); setNotes(''); setEditingGame(null); };

  const handleEditGame = (game: any) => {
    setEditingGame(game); setOpponent(game.opponent); setDate(format(game.date, 'yyyy-MM-dd'));
    setMyScore(game.myScore.toString()); setOpponentScore(game.opponentScore.toString());
    setLocation(game.location || ''); setNotes(game.notes || ''); setIsRecordOpen(true);
  };

  return (
    <div className="space-y-6 lg:space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight uppercase">Games & Results</h1>
          <p className="text-[10px] lg:text-sm font-bold text-muted-foreground uppercase tracking-widest">Journey to Dominance</p>
        </div>
        {isAdmin && (
          <Dialog open={isRecordOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsRecordOpen(o); }}>
            <DialogTrigger asChild><Button className="w-full sm:w-auto rounded-full shadow-lg h-10 lg:h-11 px-6 font-black uppercase text-[10px] lg:text-xs tracking-widest"><Plus className="h-3.5 w-3.5 mr-2" />Record Match</Button></DialogTrigger>
            <DialogContent className="sm:max-w-3xl rounded-3xl lg:rounded-[2.5rem] overflow-hidden p-0 border-none shadow-2xl max-h-[95vh] flex flex-col">
              <DialogTitle className="sr-only">Record Match Result</DialogTitle>
              <ScrollArea className="flex-1">
                <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
                  <div className="p-6 lg:p-8 bg-muted/30 lg:border-r-2 space-y-6">
                    <DialogHeader><h2 className="text-xl lg:text-2xl font-black uppercase tracking-tight">{editingGame ? "Update Match" : "Post Match"}</h2></DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Opponent</Label>
                        <Input placeholder="e.g. Tigers" value={opponent} onChange={e => setOpponent(e.target.value)} className="rounded-xl h-11 lg:h-12 border-2 font-black text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Date</Label>
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl h-11 lg:h-12 border-2 font-black text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3 lg:gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Us</Label>
                          <Input type="number" placeholder="0" value={myScore} onChange={e => setMyScore(e.target.value)} className="rounded-xl h-11 lg:h-12 font-black text-lg text-center" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Them</Label>
                          <Input type="number" placeholder="0" value={opponentScore} onChange={e => setOpponentScore(e.target.value)} className="rounded-xl h-11 lg:h-12 font-black text-lg text-center" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 lg:p-8 flex flex-col justify-between space-y-6">
                    <div className="space-y-1.5">
                      <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Highlights</Label>
                      <Textarea placeholder="Key moments..." value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[150px] lg:min-h-[200px] rounded-2xl lg:rounded-[2rem] p-4 lg:p-6 font-bold bg-muted/10 border-2 resize-none text-sm" />
                    </div>
                    <Button className="w-full h-12 lg:h-14 rounded-2xl text-base lg:text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleRecordGame}>Commit Result</Button>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className={cn("rounded-3xl lg:rounded-[2.5rem] border-none shadow-xl overflow-hidden relative group", momentum.type === 'positive' ? "bg-primary text-white" : "bg-black text-white")}>
        <div className="absolute top-0 right-0 p-6 lg:p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-700">
          <Zap className="h-24 w-24 lg:h-32 lg:w-32 -rotate-12" />
        </div>
        <CardContent className="p-6 lg:p-8 relative z-10">
          <div className="flex items-center gap-3 mb-3 lg:mb-4">
            <Quote className="h-4 w-4 lg:h-5 lg:w-5 opacity-40" />
            <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Momentum Brief</span>
          </div>
          <p className="text-lg lg:text-2xl font-black tracking-tight leading-snug max-w-2xl">
            {momentum.message}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        <Card className="bg-white border-none shadow-sm lg:shadow-md rounded-2xl lg:rounded-[2rem] overflow-hidden group ring-1 ring-black/5">
          <CardContent className="p-4 lg:p-6 text-center space-y-1">
            <div className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">Wins</div>
            <div className="text-2xl lg:text-4xl font-black text-primary group-hover:scale-110 transition-transform">{stats.wins}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-sm lg:shadow-md rounded-2xl lg:rounded-[2rem] overflow-hidden group ring-1 ring-black/5">
          <CardContent className="p-4 lg:p-6 text-center space-y-1">
            <div className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">Losses</div>
            <div className="text-2xl lg:text-4xl font-black text-black group-hover:scale-110 transition-transform">{stats.losses}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-sm lg:shadow-md rounded-2xl lg:rounded-[2rem] overflow-hidden group ring-1 ring-black/5">
          <CardContent className="p-4 lg:p-6 text-center space-y-1">
            <div className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Ties</div>
            <div className="text-2xl lg:text-4xl font-black text-muted-foreground group-hover:scale-110 transition-transform">{stats.ties}</div>
          </CardContent>
        </Card>
      </div>

      {games.length > 0 ? (
        <div className="space-y-8 lg:space-y-10">
          <Card className="rounded-3xl lg:rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden bg-white">
            <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between px-6 lg:px-8 py-4 lg:py-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg text-primary"><ChartIcon className="h-4 w-4 lg:h-5 lg:w-5" /></div>
                <CardTitle className="text-[10px] lg:text-sm font-black uppercase tracking-[0.2em]">Trajectory</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 lg:p-8">
              <div className="h-[200px] lg:h-[250px] w-full pt-4">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} opacity={0.1} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: '900' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: '900' }} />
                    <ChartTooltip content={({ active, payload }) => {
                      if (active && payload?.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-black text-white rounded-xl p-3 shadow-2xl text-[10px] font-black space-y-1 border border-primary/20">
                            <p className="opacity-50 uppercase text-[8px] tracking-[0.1em]">{d.date}</p>
                            <div className="flex justify-between gap-4 items-center"><span className="opacity-70">US:</span><span className="text-primary">{d.myScore}</span></div>
                            <div className="flex justify-between gap-4 items-center border-t border-white/10 pt-1"><span className="opacity-70 truncate max-w-[60px]">{d.opponentName}:</span><span>{d.opponentScore}</span></div>
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

          <div className="space-y-4 lg:space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] text-muted-foreground">Match Ledger</h2>
              <Badge variant="outline" className="text-[8px] lg:text-[9px] font-black border-primary/20 text-primary">{games.length} RESULTS</Badge>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
              {games.map((game) => (
                <Card key={game.id} className="rounded-2xl lg:rounded-[2rem] border-none shadow-sm hover:shadow-md ring-1 ring-black/5 overflow-hidden group hover:shadow-lg transition-all cursor-pointer bg-white" onClick={() => handleEditGame(game)}>
                  <div className={cn("h-1 w-full", game.result === 'Win' ? "bg-green-500" : game.result === 'Loss' ? "bg-red-600" : "bg-muted-foreground/30")} />
                  <CardContent className="p-4 lg:p-6 space-y-3 lg:space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge className={cn("text-[8px] lg:text-[9px] font-black uppercase tracking-widest border-none px-2 lg:px-3 h-4 lg:h-5 shadow-sm", game.result === 'Win' ? "bg-green-500 text-white" : game.result === 'Loss' ? "bg-red-600 text-white" : "bg-muted text-muted-foreground")}>{game.result}</Badge>
                      <span className="text-[8px] lg:text-[10px] font-black text-muted-foreground uppercase tracking-widest">{format(game.date, 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 lg:gap-4">
                      <div className="space-y-0.5 lg:space-y-1 min-w-0">
                        <p className="text-[7px] lg:text-[9px] font-black uppercase text-muted-foreground tracking-[0.1em]">Opponent</p>
                        <h3 className="font-black text-sm lg:text-lg tracking-tight truncate leading-tight group-hover:text-primary transition-colors">{game.opponent}</h3>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-baseline gap-1 justify-end">
                          <span className={cn("text-xl lg:text-3xl font-black", game.result === 'Win' ? "text-green-600" : game.result === 'Loss' ? "text-red-600" : "text-foreground")}>{game.myScore}</span>
                          <span className="text-muted-foreground font-black px-0.5 lg:px-1 text-xs">-</span>
                          <span className="text-base lg:text-xl font-black opacity-40">{game.opponentScore}</span>
                        </div>
                      </div>
                    </div>
                    {game.notes && <p className="text-[9px] lg:text-[11px] font-medium text-muted-foreground line-clamp-1 italic border-t pt-2 lg:pt-3">"{game.notes}"</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 lg:py-24 bg-muted/10 rounded-2xl lg:rounded-[3rem] border-2 border-dashed space-y-4">
          <Trophy className="h-10 w-10 lg:h-12 lg:w-12 text-muted-foreground opacity-20 mx-auto" />
          <div>
            <p className="font-black text-lg lg:text-xl uppercase tracking-tight">No results logged</p>
            <p className="text-[10px] lg:text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Record your first match to start.</p>
          </div>
          {isAdmin && <Button variant="outline" className="rounded-full px-8 lg:px-10 font-black uppercase text-[10px] tracking-widest border-2 h-10 lg:h-12" onClick={() => setIsRecordOpen(true)}>Record Match</Button>}
        </div>
      )}
    </div>
  );
}
