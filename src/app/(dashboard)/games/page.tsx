
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Plus, MapPin, Calendar, TrendingUp, TrendingDown, MinusCircle, Edit2, Lock, Sparkles, LineChart as ChartIcon, ChevronRight, Zap, Quote, Shield, Info, Loader2, Download, X } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  
  // Section 1: Read Optimization - Tight limits for historical data
  const gamesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), orderBy('date', 'desc'), limit(30));
  }, [activeTeam?.id, db]);

  const { data: rawGames } = useCollection(gamesQuery);
  const games = useMemo(() => (rawGames || []).map(g => ({ ...g, date: new Date(g.date) })), [rawGames]);

  const leaguesQuery = useMemoFirebase(() => {
    if (!activeTeam?.leagueIds?.length || !db) return null;
    return query(collection(db, 'leagues'), where('__name__', 'in', activeTeam.leagueIds), limit(5));
  }, [activeTeam?.leagueIds, db]);
  
  const { data: teamLeagues } = useCollection<League>(leaguesQuery);

  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [myScore, setMyScore] = useState('');
  const [opponentScore, setOpponentScore] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | 'none'>('none');
  const [selectedOpponentTeamId, setSelectedOpponentTeamId] = useState<string | 'manual'>('manual');

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

  const downloadCSV = () => {
    if (games.length === 0) return;
    const headers = ["Date", "Opponent", "Our Score", "Their Score", "Result", "Location", "Notes"];
    const rows = games.map(g => [
      format(g.date, 'yyyy-MM-dd'),
      g.opponent,
      g.myScore,
      g.opponentScore,
      g.result,
      g.location || 'N/A',
      (g.notes || '').replace(/,/g, ';')
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeTeam?.name}_results_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const leagueOpponents = useMemo(() => {
    if (!teamLeagues) return [];
    const all: { teamId: string; teamName: string; leagueId: string; leagueName: string }[] = [];
    teamLeagues.forEach(l => {
      Object.entries(l.teams).forEach(([tid, tdata]) => {
        if (tid !== activeTeam?.id) {
          all.push({ teamId: tid, teamName: tdata.teamName, leagueId: l.id, leagueName: l.name });
        }
      });
    });
    return all;
  }, [teamLeagues, activeTeam?.id]);

  if (!mounted || !activeTeam) return null;
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const isPro = hasFeature('stats_basic');

  const handleRecordGame = () => {
    if (!opponent || !date || !myScore || !opponentScore) return;
    const myS = parseInt(myScore); const oppS = parseInt(opponentScore);
    let result: 'Win' | 'Loss' | 'Tie' = 'Tie'; if (myS > oppS) result = 'Win'; if (myS < oppS) result = 'Loss';
    const payload: any = { opponent, date: new Date(date).toISOString(), myScore: myS, opponentScore: oppS, result, location, notes: isPro ? notes : '' };
    if (selectedLeagueId !== 'none' && selectedOpponentTeamId !== 'manual') { payload.leagueId = selectedLeagueId; payload.opponentTeamId = selectedOpponentTeamId; }
    if (editingGame) updateGame(editingGame.id, payload); else addGame(payload);
    setIsRecordOpen(false); resetForm();
  };

  const resetForm = () => { setOpponent(''); setDate(''); setMyScore(''); setOpponentScore(''); setLocation(''); setNotes(''); setEditingGame(null); setSelectedLeagueId('none'); setSelectedOpponentTeamId('manual'); };

  const handleEditGame = (game: any) => {
    setEditingGame(game); setOpponent(game.opponent); setDate(format(game.date, 'yyyy-MM-dd'));
    setMyScore(game.myScore.toString()); setOpponentScore(game.opponentScore.toString());
    setLocation(game.location || ''); setNotes(game.notes || ''); 
    setSelectedLeagueId(game.leagueId || 'none'); setSelectedOpponentTeamId(game.opponentTeamId || 'manual');
    setIsRecordOpen(true);
  };

  return (
    <div className="space-y-6 lg:space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight uppercase">Scorekeeping</h1>
          <p className="text-[10px] lg:text-sm font-bold text-muted-foreground uppercase tracking-widest">Journey to Dominance</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {games.length > 0 && <Button variant="outline" size="sm" className="rounded-full h-10 lg:h-11 border-2 font-black uppercase text-[10px] tracking-widest flex-1 sm:flex-none" onClick={downloadCSV}><Download className="h-3.5 w-3.5 mr-2" /> Export</Button>}
          {isAdmin && (
            <Dialog open={isRecordOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsRecordOpen(o); }}>
              <DialogTrigger asChild><Button className="flex-1 sm:flex-none rounded-full shadow-lg h-10 lg:h-11 px-6 font-black uppercase text-[10px] lg:text-xs tracking-widest"><Plus className="h-3.5 w-3.5 mr-2" />Record Match</Button></DialogTrigger>
              <DialogContent className="sm:max-w-3xl overflow-hidden p-0 sm:rounded-[2.5rem] border-none shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[95vh] flex flex-col">
                <DialogTitle className="sr-only">Record Match Result</DialogTitle>
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <ScrollArea className="flex-1 h-full">
                    <div className="flex flex-col lg:flex-row min-h-full">
                      {/* Form Pane */}
                      <div className="lg:w-1/2 p-6 lg:p-10 bg-muted/30 lg:border-r-2 space-y-8">
                        <DialogHeader className="flex flex-row items-center justify-between">
                          <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tight leading-none">{editingGame ? "Update Match" : "Post Match"}</h2>
                          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setIsRecordOpen(false)}><X className="h-5 w-5" /></Button>
                        </DialogHeader>
                        <div className="space-y-5">
                          {leagueOpponents.length > 0 && (
                            <div className="space-y-1.5">
                              <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1 text-primary">League Match? (Optional)</Label>
                              <Select value={selectedOpponentTeamId === 'manual' ? 'manual' : `${selectedLeagueId}_${selectedOpponentTeamId}`} onValueChange={(val) => { if (val === 'manual') { setSelectedOpponentTeamId('manual'); setSelectedLeagueId('none'); setOpponent(''); } else { const opt = leagueOpponents.find(o => `${o.leagueId}_${o.teamId}` === val); if (opt) { setSelectedOpponentTeamId(opt.teamId); setSelectedLeagueId(opt.leagueId); setOpponent(opt.teamName); } } }}>
                                <SelectTrigger className="rounded-xl h-12 border-2 border-primary/20 bg-primary/5 font-black text-xs"><SelectValue placeholder="Select League Opponent" /></SelectTrigger>
                                <SelectContent className="rounded-xl"><SelectItem value="manual" className="font-bold">One-Off Match (Manual Name)</SelectItem>{leagueOpponents.map(o => (<SelectItem key={`${o.leagueId}_${o.teamId}`} value={`${o.leagueId}_${o.teamId}`} className="font-bold">{o.teamName} ({o.leagueName})</SelectItem>))}</SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Opponent Name</Label>
                            <Input placeholder="e.g. Tigers" value={opponent} onChange={e => setOpponent(e.target.value)} disabled={selectedOpponentTeamId !== 'manual'} className="rounded-xl h-12 border-2 font-black text-base" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Date</Label>
                            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl h-12 border-2 font-black text-base" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Us</Label>
                              <Input type="number" placeholder="0" value={myScore} onChange={e => setMyScore(e.target.value)} className="rounded-xl h-12 font-black text-xl text-center border-2" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Them</Label>
                              <Input type="number" placeholder="0" value={opponentScore} onChange={e => setOpponentScore(e.target.value)} className="rounded-xl h-12 font-black text-xl text-center border-2" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Highlights & Actions Pane */}
                      <div className="lg:w-1/2 p-6 lg:p-10 flex flex-col justify-between bg-background">
                        <div className="space-y-6">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Match Highlights</Label>
                            {isPro ? (
                              <Textarea placeholder="Describe key plays and tactical moments..." value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[200px] lg:min-h-[300px] rounded-2xl lg:rounded-[2rem] p-6 font-bold bg-muted/10 border-2 resize-none text-base" />
                            ) : (
                              <div className="min-h-[200px] lg:min-h-[300px] rounded-2xl lg:rounded-[2rem] p-8 bg-primary/5 border-2 border-dashed flex flex-col items-center justify-center text-center space-y-4">
                                <Lock className="h-8 w-8 text-primary/40" />
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Match Highlights Locked</p>
                                  <p className="text-[8px] font-bold text-muted-foreground uppercase max-w-[180px] mx-auto">Upgrade to Elite to archive season highlights and tactical notes.</p>
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 rounded-lg text-[8px] font-black uppercase text-primary border border-primary/20" onClick={purchasePro}>Upgrade to Elite</Button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="pt-8 mt-auto flex flex-col gap-3">
                          <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleRecordGame}>
                            {editingGame ? "Commit Updates" : "Broadcast Result"}
                          </Button>
                          <Button variant="ghost" className="sm:hidden text-[10px] font-black uppercase tracking-widest" onClick={() => setIsRecordOpen(false)}>Discard</Button>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isPro ? (
        <>
          <Card className={cn("rounded-3xl lg:rounded-[2.5rem] border-none shadow-xl overflow-hidden relative group", momentum.type === 'positive' ? "bg-primary text-white" : "bg-black text-white")}>
            <div className="absolute top-0 right-0 p-6 lg:p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-700"><Zap className="h-24 w-24 lg:h-32 lg:w-32 -rotate-12" /></div>
            <CardContent className="p-6 lg:p-8 relative z-10"><div className="flex items-center gap-3 mb-3 lg:mb-4"><Quote className="h-4 w-4 lg:h-5 lg:w-5 opacity-40" /><span className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Momentum Brief</span></div><p className="text-lg lg:text-2xl font-black tracking-tight leading-snug max-w-2xl">{momentum.message}</p></CardContent>
          </Card>
          <div className="grid grid-cols-3 gap-3 lg:gap-4"><Card className="bg-white border-none shadow-sm lg:shadow-md rounded-2xl lg:rounded-[2rem] overflow-hidden group ring-1 ring-black/5"><CardContent className="p-4 lg:p-6 text-center space-y-1"><div className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">Wins</div><div className="text-2xl lg:text-4xl font-black text-primary group-hover:scale-110 transition-transform">{stats.wins}</div></CardContent></Card><Card className="bg-white border-none shadow-sm lg:shadow-md rounded-2xl lg:rounded-[2rem] overflow-hidden group ring-1 ring-black/5"><CardContent className="p-4 lg:p-6 text-center space-y-1"><div className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">Losses</div><div className="text-2xl lg:text-4xl font-black text-black group-hover:scale-110 transition-transform">{stats.losses}</div></CardContent></Card><Card className="bg-white border-none shadow-sm lg:shadow-md rounded-2xl lg:rounded-[2rem] overflow-hidden group ring-1 ring-black/5"><CardContent className="p-4 lg:p-6 text-center space-y-1"><div className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">Ties</div><div className="text-2xl lg:text-4xl font-black text-muted-foreground group-hover:scale-110 transition-transform">{stats.ties}</div></CardContent></Card></div>
        </>
      ) : (
        <div className="bg-muted/30 p-8 rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center text-center space-y-4"><div className="bg-white p-4 rounded-2xl shadow-sm relative"><ChartIcon className="h-8 w-8 text-primary/40" /><Lock className="absolute -top-1 -right-1 h-4 w-4 bg-black text-white p-0.5 rounded-full border-2 border-background" /></div><div className="space-y-1"><h3 className="text-sm font-black uppercase tracking-tight">Performance Analytics Locked</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest max-w-xs">Upgrade to Pro to visualize season trajectory and win/loss metrics.</p></div><Button size="sm" className="rounded-full h-9 px-6 font-black uppercase text-[10px] tracking-widest" onClick={purchasePro}>Unlock Pro Analytics</Button></div>
      )}

      {games.length > 0 ? (
        <div className="space-y-8 lg:space-y-10">
          {isPro && (
            <Card className="rounded-3xl lg:rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden bg-white">
              <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between px-6 lg:px-8 py-4 lg:py-6"><div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-lg text-primary"><ChartIcon className="h-4 w-4 lg:h-5 lg:w-5" /></div><CardTitle className="text-[10px] lg:sm font-black uppercase tracking-[0.2em]">Trajectory</CardTitle></div></CardHeader>
              <CardContent className="p-4 lg:p-8"><div className="h-[200px] lg:h-[250px] w-full pt-4"><ChartContainer config={chartConfig} className="h-full w-full"><LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={true} opacity={0.1} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: '900' }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: '900' }} /><ChartTooltip content={({ active, payload }) => { if (active && payload?.length) { const d = payload[0].payload; return (<div className="bg-black text-white rounded-xl p-3 shadow-2xl text-[10px] font-black space-y-1 border border-primary/20"><p className="opacity-50 uppercase text-[8px] tracking-[0.1em]">{d.date}</p><div className="flex justify-between gap-4 items-center"><span className="opacity-70">US:</span><span className="text-primary">{d.myScore}</span></div><div className="flex justify-between gap-4 items-center border-t border-white/10 pt-1"><span className="opacity-70 truncate max-w-[60px]">{d.opponentName}:</span><span>{d.opponentScore}</span></div></div>); } return null; }} /><Line type="monotone" dataKey="myScore" stroke="var(--color-myScore)" strokeWidth={4} dot={{ r: 4, fill: "var(--color-myScore)", strokeWidth: 2, stroke: "#fff" }} /><Line type="monotone" dataKey="opponentScore" stroke="var(--color-opponentScore)" strokeWidth={2} strokeDasharray="4 4" opacity={0.4} /></LineChart></ChartContainer></div></CardContent>
            </Card>
          )}
          <div className="space-y-4 lg:space-y-6"><div className="flex items-center justify-between px-2"><h2 className="text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] text-muted-foreground">Match Ledger</h2><Badge variant="outline" className="text-[8px] lg:text-[9px] font-black border-primary/20 text-primary">{games.length} RESULTS</Badge></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">{games.map((game) => (<Card key={game.id} className="rounded-2xl lg:rounded-[2rem] border-none shadow-sm hover:shadow-md ring-1 ring-black/5 overflow-hidden group hover:shadow-lg transition-all cursor-pointer bg-white" onClick={() => handleEditGame(game)}><div className={cn("h-1 w-full", game.result === 'Win' ? "bg-green-500" : game.result === 'Loss' ? "bg-red-600" : "bg-muted-foreground/30")} /><CardContent className="p-4 lg:p-6 space-y-3 lg:space-y-4"><div className="flex items-center justify-between"><div className="flex gap-2"><Badge className={cn("text-[8px] lg:text-[9px] font-black uppercase tracking-widest border-none px-2 lg:px-3 h-4 lg:h-5 shadow-sm", game.result === 'Win' ? "bg-green-500 text-white" : game.result === 'Loss' ? "bg-red-600 text-white" : "bg-muted text-muted-foreground")}>{game.result}</Badge>{game.leagueId && <Badge className="bg-primary/10 text-primary border-none text-[8px] px-2 h-5 font-black uppercase flex items-center gap-1"><Shield className="h-2 w-2" /> League</Badge>}</div><span className="text-[8px] lg:text-[10px] font-black text-muted-foreground uppercase tracking-widest">{format(game.date, 'MMM d, yyyy')}</span></div><div className="flex items-center justify-between gap-2 lg:gap-4"><div className="space-y-0.5 lg:space-y-1 min-w-0"><p className="text-[7px] lg:text-[9px] font-black uppercase text-muted-foreground tracking-[0.1em]">Opponent</p><h3 className="font-black text-sm lg:text-lg tracking-tight truncate leading-tight group-hover:text-primary transition-colors">{game.opponent}</h3></div><div className="text-right shrink-0"><div className="flex items-baseline gap-1 justify-end"><span className={cn("text-xl lg:text-3xl font-black", game.result === 'Win' ? "text-green-600" : game.result === 'Loss' ? "text-red-600" : "text-foreground")}>{game.myScore}</span><span className="text-muted-foreground font-black px-0.5 lg:px-1 text-xs">-</span><span className="text-base lg:text-xl font-black opacity-40">{game.opponentScore}</span></div></div></div>{isPro && game.notes && <p className="text-[9px] lg:text-[11px] font-medium text-muted-foreground line-clamp-1 italic border-t pt-2 lg:pt-3">"{game.notes}"</p>}</CardContent></Card>))}</div></div>
        </div>
      ) : (
        <div className="text-center py-20 lg:py-24 bg-muted/10 rounded-2xl lg:rounded-[3rem] border-2 border-dashed space-y-4"><Trophy className="h-10 w-10 lg:h-12 lg:w-12 text-muted-foreground opacity-20 mx-auto" /><div><p className="font-black text-lg lg:text-xl uppercase tracking-tight">No results logged</p><p className="text-[10px] lg:sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Record your first match to start.</p></div>{isAdmin && <Button variant="outline" className="rounded-full px-8 lg:px-10 font-black uppercase text-[10px] tracking-widest border-2 h-10 lg:h-12" onClick={() => setIsRecordOpen(true)}>Record Match</Button>}</div>
      )}
    </div>
  );
}
