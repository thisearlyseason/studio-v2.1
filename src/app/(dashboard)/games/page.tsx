
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Plus, MapPin, Calendar, Info, TrendingUp, TrendingDown, MinusCircle, Edit2, Lock, Sparkles, LineChart as ChartIcon } from 'lucide-react';
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

const chartConfig = {
  myScore: {
    label: "Our Score",
    color: "hsl(var(--primary))",
  },
  opponentScore: {
    label: "Opponent",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

export default function GamesPage() {
  const { activeTeam, games, addGame, updateGame, user, isPro, isSuperAdmin } = useTeam();
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
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

    if (games.length >= 3) {
      const lastThree = games.slice(0, 3);
      if (lastThree.every(g => g.result === 'Win')) {
        return "Unstoppable! A 3-game winning streak is proof of your hard work. Stay hungry!";
      }
    }

    if (lastGame?.result === 'Win') {
      return "Victory! Great job on the latest win. Let's carry this energy into the next one.";
    }

    if (lastGame?.result === 'Loss') {
      return "Tough game, but champions are built in the comeback. Review the film and level up!";
    }

    if (winRate > 0.7) {
      return "You're dominating the league! Keep that focus high and the championship is yours.";
    }

    return "Every play is a step towards greatness. Keep training, keep pushing, and the wins will follow.";
  }, [games]);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading scoreboard...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-amber-100 p-6 rounded-[2.5rem] shadow-xl">
            <Trophy className="h-16 w-16 text-amber-600" />
          </div>
          <div className="absolute -top-2 -right-2 bg-primary text-white p-2 rounded-full shadow-lg border-2 border-background">
            <Lock className="h-4 w-4" />
          </div>
        </div>
        
        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Pro Season Tracker</h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Record game results, track season wins/losses, and maintain official match history with a Pro Squad subscription.
          </p>
        </div>

        <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-primary tracking-widest">Pro Plan Features</span>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-none font-bold">Recommended</Badge>
            </div>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-amber-500" /> Season Win/Loss Metrics</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-amber-500" /> Detailed Match Archives</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-amber-500" /> Individual Performance Logs</li>
            </ul>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>
              Upgrade Squad for $9.99 USD
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const wins = games.filter(g => g.result === 'Win').length;
  const losses = games.filter(g => g.result === 'Loss').length;
  const ties = games.filter(g => g.result === 'Tie').length;

  const handleRecordGame = () => {
    if (!opponent || !date || !myScore || !opponentScore) return;

    const myS = parseInt(myScore);
    const oppS = parseInt(opponentScore);
    let result: GameResult = 'Tie';
    if (myS > oppS) result = 'Win';
    if (myS < oppS) result = 'Loss';

    if (editingGame) {
      updateGame(editingGame.id, {
        opponent,
        date: new Date(date),
        myScore: myS,
        opponentScore: oppS,
        result,
        location,
        notes
      });
      setEditingGame(null);
    } else {
      addGame({
        opponent,
        date: new Date(date),
        myScore: myS,
        opponentScore: oppS,
        result,
        location,
        notes
      });
    }

    setIsRecordOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setOpponent(''); setDate(''); setMyScore(''); setOpponentScore(''); setLocation(''); setNotes('');
  };

  const handleEditClick = (game: Game) => {
    setEditingGame(game);
    setOpponent(game.opponent);
    setDate(game.date.toISOString().split('T')[0]);
    setMyScore(game.myScore.toString());
    setOpponentScore(game.opponentScore.toString());
    setLocation(game.location || '');
    setNotes(game.notes || '');
    setIsRecordOpen(true);
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Games & Results</h1>
          <p className="text-muted-foreground text-sm font-medium">Track your squad's season progress.</p>
        </div>
        {isAdmin && (
          <Dialog open={isRecordOpen} onOpenChange={(open) => {
            setIsRecordOpen(open);
            if (!open) {
              setEditingGame(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" />
                Record Game
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl rounded-[2.5rem] overflow-hidden p-0">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-8 bg-primary/5 border-r space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tight">{editingGame ? "Update Match Record" : "Post Match Result"}</DialogTitle>
                    <DialogDescription className="font-bold text-primary/60 uppercase tracking-widest text-[10px]">Official Season Scoreboard</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Opponent Name</Label>
                      <Input placeholder="e.g. Riverside Rovers" value={opponent} onChange={e => setOpponent(e.target.value)} className="h-12 rounded-xl bg-background" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 rounded-xl bg-background" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label><Input placeholder="Arena/Field" value={location} onChange={e => setLocation(e.target.value)} className="h-12 rounded-xl bg-background" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">{activeTeam.name} Score</Label><Input type="number" value={myScore} onChange={e => setMyScore(e.target.value)} className="h-12 rounded-xl bg-background font-black text-lg" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Opponent Score</Label><Input type="number" value={opponentScore} onChange={e => setOpponentScore(e.target.value)} className="h-12 rounded-xl bg-background font-black text-lg" /></div>
                    </div>
                  </div>
                </div>
                <div className="p-8 space-y-6 flex flex-col justify-between">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Match Summary & Highlights</Label>
                    <Textarea 
                      placeholder="Recap the game, call out MVPs, or note areas for improvement..." 
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      className="min-h-[250px] rounded-[2rem] p-6 text-base leading-relaxed bg-muted/10 border-2" 
                    />
                  </div>
                  <DialogFooter>
                    <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleRecordGame}>
                      {editingGame ? "Commit Updates" : "Post Official Result"}
                    </Button>
                  </DialogFooter>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-none shadow-sm bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-4 text-center">
            <div className="text-[10px] font-black uppercase text-green-600 tracking-widest mb-1">Wins</div>
            <div className="text-3xl font-black text-green-600">{wins}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4 text-center">
            <div className="text-[10px] font-black uppercase text-red-600 tracking-widest mb-1">Losses</div>
            <div className="text-3xl font-black text-red-600">{losses}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4 text-center">
            <div className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-1">Ties</div>
            <div className="text-3xl font-black text-blue-600">{ties}</div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      {games.length > 0 && (
        <Card className="rounded-[2rem] border-none shadow-xl shadow-primary/5 ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ChartIcon className="h-4 w-4 text-primary" />
              <CardTitle className="text-lg font-black">Performance Trend</CardTitle>
            </div>
            <CardDescription className="text-xs font-bold uppercase tracking-widest">Scoring trajectory for the season</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-[200px] w-full pt-4">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} opacity={0.1} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 'bold' }} 
                    dy={10}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg p-2 shadow-xl text-xs font-bold space-y-1">
                            <p className="text-muted-foreground uppercase text-[9px]">{data.date}</p>
                            <p className="text-primary">{activeTeam.name}: {data.myScore}</p>
                            <p className="text-muted-foreground">{data.opponentName}: {data.opponentScore}</p>
                          </div>
                        );
                      }
                      return null;
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="myScore" 
                    stroke="var(--color-myScore)" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: "var(--color-myScore)" }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="opponentScore" 
                    stroke="var(--color-opponentScore)" 
                    strokeWidth={2} 
                    strokeDasharray="5 5"
                    dot={{ r: 3, fill: "var(--color-opponentScore)" }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
            
            <div className="bg-primary/5 rounded-2xl p-4 flex items-start gap-3 border border-primary/10">
              <div className="bg-primary text-white p-1.5 rounded-lg shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-black uppercase text-primary tracking-widest leading-none">Squad Motivation</p>
                <p className="text-sm font-bold text-foreground/80 leading-relaxed italic">
                  "{encouragement}"
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Recent Match History</h2>
        {games.length > 0 ? games.map((game) => (
          <Card key={game.id} className="overflow-hidden border-none shadow-sm ring-1 ring-black/5 rounded-3xl hover:shadow-md transition-all group relative">
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-4 right-4 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleEditClick(game)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            <CardContent className="p-0 flex items-stretch">
              <div className={cn(
                "w-3 shrink-0",
                game.result === 'Win' ? "bg-green-500" : game.result === 'Loss' ? "bg-red-500" : "bg-blue-500"
              )} />
              <div className="flex-1 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Vs. Opponent</span>
                      {game.result === 'Win' && <Badge className="bg-green-500 h-4 text-[9px] uppercase">Victory</Badge>}
                    </div>
                    <h3 className="text-xl font-bold">{game.opponent}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{activeTeam.name[0]}</span>
                      <span className="text-2xl font-black">{game.myScore}</span>
                    </div>
                    <div className="text-muted-foreground font-black text-xl">:</div>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{game.opponent[0]}</span>
                      <span className="text-2xl font-black">{game.opponentScore}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-y-2 gap-x-5 pt-2 border-t border-muted/50 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {game.date.toLocaleDateString()}</div>
                  {game.location && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {game.location}</div>}
                  {game.result === 'Win' ? (
                    <div className="flex items-center gap-1.5 text-green-600"><TrendingUp className="h-3 w-3" /> Win</div>
                  ) : game.result === 'Loss' ? (
                    <div className="flex items-center gap-1.5 text-red-600"><TrendingDown className="h-3 w-3" /> Loss</div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-blue-600"><MinusCircle className="h-3 w-3" /> Draw</div>
                  )}
                </div>

                {game.notes && (
                  <div className="bg-muted/30 p-3 rounded-2xl">
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">"{game.notes}"</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )) : (
          <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-[2.5rem] space-y-4">
            <Trophy className="h-12 w-12 text-muted-foreground opacity-20 mx-auto" />
            <div>
              <p className="font-bold text-lg">No games recorded yet</p>
              <p className="text-sm text-muted-foreground">Start tracking your season performance.</p>
            </div>
            {isAdmin && <Button variant="outline" className="rounded-full" onClick={() => setIsRecordOpen(true)}>Record First Game</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
