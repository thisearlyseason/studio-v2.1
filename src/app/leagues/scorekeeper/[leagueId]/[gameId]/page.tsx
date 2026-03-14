
"use client";

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, League, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle2, ShieldAlert, Loader2, Info, ArrowRight, AlertCircle, Clock, MapPin, X, ChevronLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function PublicLeagueScorekeeperEntryPage() {
  const { leagueId, gameId } = useParams();
  const db = useFirestore();
  const router = useRouter();
  const { submitLeagueMatchScore } = useTeam();

  const leagueRef = useMemoFirebase(() => (db && leagueId) ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: league, isLoading } = useDoc<League>(leagueRef);

  const game = useMemo(() => {
    return league?.schedule?.find(g => g.id === gameId);
  }, [league, gameId]);

  const [score1, setScore1] = useState<string>(game?.score1?.toString() || '');
  const [score2, setScore2] = useState<string>(game?.score2?.toString() || '');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!league || !game) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase tracking-tight">Match Inactive</h2></Card></div>;

  const handleSubmit = async () => {
    if (!selectedTeam || !score1 || !score2 || isSubmitting) return;
    setIsSubmitting(true);
    const isTeam1 = selectedTeam === game.team1;
    try {
      await submitLeagueMatchScore(leagueId as string, gameId as string, isTeam1, parseInt(score1), parseInt(score2));
      setIsSubmitted(true);
    } catch (err) {
      toast({ title: "Submission Error", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-muted/10 flex flex-col items-center justify-center p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Result Posted</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Standings Updated Instantly</p>
          <Button variant="ghost" className="mt-8 font-black uppercase text-xs" onClick={() => router.push(`/leagues/scorekeeper/${leagueId}`)}>Back to Matches</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      <div className="max-w-xl w-full space-y-6">
        <Button variant="ghost" onClick={() => router.push(`/leagues/scorekeeper/${leagueId}`)} className="font-black uppercase text-[10px] tracking-widest"><ChevronLeft className="h-4 w-4 mr-2" /> Back to Schedule</Button>
        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <CardHeader className="p-8 lg:p-10 pb-4">
            <div className="flex items-center gap-4 mb-4"><div className="bg-primary/10 p-3 rounded-2xl text-primary"><ShieldAlert className="h-6 w-6" /></div><div><CardTitle className="text-2xl font-black uppercase tracking-tight">Post Result</CardTitle><CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Official Score Entry</CardDescription></div></div>
            <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed space-y-3"><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{game.date} • {game.time}</span></div><div className="flex items-center justify-center gap-6"><span className="font-black text-lg uppercase truncate">{game.team1}</span><span className="opacity-20 text-xs font-black">VS</span><span className="font-black text-lg uppercase truncate text-right">{game.team2}</span></div></div>
          </CardHeader>
          <CardContent className="p-8 lg:p-10 space-y-8">
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Submitting Squad Representative</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button variant={selectedTeam === game.team1 ? "default" : "outline"} className={cn("h-16 rounded-2xl font-black text-xs uppercase", selectedTeam === game.team1 ? "bg-primary" : "opacity-60")} onClick={() => setSelectedTeam(game.team1)}>{game.team1}</Button>
                <Button variant={selectedTeam === game.team2 ? "default" : "outline"} className={cn("h-16 rounded-2xl font-black text-xs uppercase", selectedTeam === game.team2 ? "bg-primary" : "opacity-60")} onClick={() => setSelectedTeam(game.team2)}>{game.team2}</Button>
              </div>
            </div>
            {selectedTeam && (
              <div className="grid grid-cols-2 gap-8 animate-in slide-in-from-top-4">
                <div className="space-y-3"><Label className="text-[10px] font-black uppercase">{game.team1}</Label><Input type="number" value={score1} onChange={e => setScore1(e.target.value)} className="h-16 text-center font-black text-3xl rounded-2xl border-2" /></div>
                <div className="space-y-3"><Label className="text-[10px] font-black uppercase">{game.team2}</Label><Input type="number" value={score2} onChange={e => setScore2(e.target.value)} className="h-16 text-center font-black text-3xl rounded-2xl border-2" /></div>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-8 lg:p-10 pt-0"><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" disabled={!selectedTeam || !score1 || !score2 || isSubmitting} onClick={handleSubmit}>{isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit Score Result"}</Button></CardFooter>
        </Card>
      </div>
    </div>
  );
}
