"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useTeam } from '@/components/providers/team-provider';
import { useAuth } from '@/firebase';
import { authHeader, getAuthToken } from '@/lib/client-auth';
import { 
  Users, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  Hash, 
  Trophy,
  Baby,
  Plus,
  CheckCircle2,
  UserPlus,
  CalendarDays,
  Copy
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type InvitePreview = {
  teamId: string;
  teamName: string;
};

type TournamentPreview = {
  teamId: string;
  eventId: string;
  title: string;
};

export default function JoinTeamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { user, activeTeam, myChildren, joinTeamWithCode, isParent, isStaff } = useTeam();
  
  const [teamCode, setTeamCode] = useState('');
  const [leagueCode, setLeagueCode] = useState('');
  const [tournamentLink, setTournamentLink] = useState('');
  // Parent accounts must select a child; only adult athletes may join as self.
  const [selectedId, setSelectedId] = useState<string>('');
  const [isJoining, setIsJoining] = useState(false);
  const [isResolvingInvite, setIsResolvingInvite] = useState(false);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isResolvingTournament, setIsResolvingTournament] = useState(false);
  const [tournamentPreview, setTournamentPreview] = useState<TournamentPreview | null>(null);

  const hasChildren = myChildren.length > 0;

  // Build the effective player ID for the join call
  const effectivePlayerId = selectedId === 'self'
    ? `p_${user?.id}`
    : selectedId || null;

  const addChildHref = useCallback(() => {
    const code = teamCode.trim().toUpperCase();
    const returnTo = code ? `/teams/join?code=${encodeURIComponent(code)}` : '/teams/join';
    return `/family?addChild=1&returnTo=${encodeURIComponent(returnTo)}`;
  }, [teamCode]);

  const resolveInvite = useCallback(async (rawCode: string, openConfirmation = true) => {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode || !auth.currentUser) return;
    setIsResolvingInvite(true);
    try {
      const token = await getAuthToken(auth);
      const response = await fetch(
        `/api/teams/join?code=${encodeURIComponent(normalizedCode)}`,
        { headers: authHeader(token) }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to verify this squad.');
      setTeamCode(normalizedCode);
      setInvitePreview({ teamId: payload.teamId, teamName: payload.teamName });
      if (openConfirmation) setIsConfirmOpen(true);
    } catch (error: any) {
      setInvitePreview(null);
      toast({
        title: 'Recruitment Link Invalid',
        description: error.message || 'This squad invitation could not be verified.',
        variant: 'destructive',
      });
    } finally {
      setIsResolvingInvite(false);
    }
  }, [auth]);

  useEffect(() => {
    const linkedCode = searchParams.get('code')?.trim().toUpperCase() || '';
    if (!linkedCode || !user?.id) return;
    setTeamCode(linkedCode);
    void resolveInvite(linkedCode);
  }, [resolveInvite, searchParams, user?.id]);

  useEffect(() => {
    if (isParent) {
      const requestedPlayerId = searchParams.get('playerId');
      setSelectedId(requestedPlayerId && myChildren.some(child => child.id === requestedPlayerId) ? requestedPlayerId : '');
    } else {
      setSelectedId('self');
    }
  }, [isParent, myChildren, searchParams]);

  const handleReviewTeam = async () => {
    if (!teamCode.trim()) return;
    if (isParent && !hasChildren) {
      router.push(addChildHref());
      return;
    }
    await resolveInvite(teamCode);
  };

  const handleJoinTeam = async () => {
    if (!teamCode.trim() || !invitePreview) return;
    if (!effectivePlayerId) {
      toast({ title: "Identification Required", description: "Please select which player is joining.", variant: "destructive" });
      return;
    }
    setIsJoining(true);
    try {
      const success = await joinTeamWithCode(teamCode.trim().toUpperCase(), effectivePlayerId, 'Player');
      if (success) {
        setIsConfirmOpen(false);
        router.push('/feed');
      } else {
        toast({
          title: 'Enrollment Failed',
          description: 'This player could not be enrolled in the selected squad.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleGoToLeague = () => {
    if (!leagueCode.trim() || !activeTeam?.id) return;
    const params = new URLSearchParams({
      protocol: 'team_config',
      squadId: activeTeam.id,
      squadName: activeTeam.name,
    });
    if (activeTeam.teamLogoUrl) params.set('squadLogoUrl', activeTeam.teamLogoUrl);
    router.push(`/register/league/${encodeURIComponent(leagueCode.trim())}?${params.toString()}`);
  };

  const handleGoToTournament = () => {
    const match = tournamentLink.trim().match(/register\/tournament\/([^/?#]+)\/([^/?#]+)/i);
    if (!activeTeam?.id) return;
    const destination = match
      ? { teamId: match[1], eventId: match[2] }
      : tournamentPreview;
    if (!destination) {
      toast({ title: 'Tournament code or ID required', description: 'Enter the organizer’s tournament code, tournament ID, or registration link.', variant: 'destructive' });
      return;
    }
    const params = new URLSearchParams({
      protocol: 'team_config',
      squadId: activeTeam.id,
      squadName: activeTeam.name,
    });
    if (activeTeam.teamLogoUrl) params.set('squadLogoUrl', activeTeam.teamLogoUrl);
    router.push(`/register/tournament/${encodeURIComponent(destination.teamId)}/${encodeURIComponent(destination.eventId)}?${params.toString()}`);
  };

  const handleResolveTournament = async () => {
    const input = tournamentLink.trim();
    if (!input) return;
    const match = input.match(/register\/tournament\/([^/?#]+)\/([^/?#]+)/i);
    if (match) {
      setTournamentPreview({ teamId: match[1], eventId: match[2], title: 'Tournament registration link' });
      return;
    }
    setIsResolvingTournament(true);
    setTournamentPreview(null);
    try {
      const token = await getAuthToken(auth);
      const response = await fetch(
        `/api/tournaments/resolve?code=${encodeURIComponent(input)}`,
        { headers: authHeader(token) }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Tournament code or ID not found.');
      setTournamentPreview(payload.tournament);
    } catch (error) {
      toast({
        title: 'Tournament Not Found',
        description: error instanceof Error ? error.message : 'Check the tournament code or ID and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResolvingTournament(false);
    }
  };

  const handleCopyInviteLink = async () => {
    const code = activeTeam?.code || activeTeam?.teamCode || activeTeam?.inviteCode || '';
    if (!code) return;
    await navigator.clipboard.writeText(`${window.location.origin}/teams/join?code=${encodeURIComponent(code)}`);
    toast({ title: 'Player invite link copied', description: 'Send this link to athletes or parents.' });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black uppercase tracking-tight">Join & Invite</h1>
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Choose what you are joining</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5"><UserPlus className="h-5 w-5 text-primary mb-3" /><p className="font-black uppercase text-sm">Join a team as a player</p><p className="text-xs text-muted-foreground mt-1">Use your coach&apos;s squad code. Parents can select a child.</p></div>
        <div className="rounded-2xl border-2 border-black/10 bg-white p-5"><Trophy className="h-5 w-5 text-primary mb-3" /><p className="font-black uppercase text-sm">Join a league as a team</p><p className="text-xs text-muted-foreground mt-1">Team staff submit the team registration.</p></div>
        <div className="rounded-2xl border-2 border-black/10 bg-white p-5"><CalendarDays className="h-5 w-5 text-primary mb-3" /><p className="font-black uppercase text-sm">Join a tournament as a team</p><p className="text-xs text-muted-foreground mt-1">Use the tournament code, ID, or registration link.</p></div>
      </div>

      <div className={cn("grid gap-8", isStaff ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-xl mx-auto")}>

        {/* Every signed-in account may enroll itself as an ordinary player. */}
        <Card className={cn("rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col", isStaff && "lg:col-span-2")}>
            <div className="h-2 bg-primary w-full" />
            <CardHeader className="p-8 lg:p-10">
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Join Team As Player</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Your coach&apos;s squad code connects you instantly</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 lg:p-10 pt-0 flex-1 space-y-6">

              {/* Adult athletes may select self; parents must select a child. */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Enrolling As</Label>
                <div className="space-y-2">
                  {!isParent && <button
                    onClick={() => setSelectedId('self')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left",
                      selectedId === 'self'
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/20"
                    )}
                  >
                    <Avatar className="h-9 w-9 rounded-xl shrink-0">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="font-black text-xs bg-primary/10 text-primary">
                        {user?.name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm uppercase tracking-tight truncate">{user?.name || 'Me'}</p>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider truncate">{user?.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-primary/10 text-primary border-none font-black text-[8px] h-5 px-2">
                        Athlete
                      </Badge>
                      {selectedId === 'self' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                  </button>}

                  {/* Children rows (parents only) */}
                  {isParent && hasChildren && myChildren.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedId(child.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left",
                        selectedId === child.id
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/20"
                      )}
                    >
                      <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <Baby className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm uppercase tracking-tight truncate">
                          {child.firstName} {child.lastName}
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Child Athlete</p>
                      </div>
                      {selectedId === child.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  ))}

                  {/* No children CTA for parents */}
                  {isParent && !hasChildren && (
                    <div className="p-4 bg-muted/20 rounded-xl border-2 border-dashed flex flex-col items-center gap-3">
                      <Baby className="h-5 w-5 text-muted-foreground opacity-40" />
                      <p className="text-[10px] font-bold text-center text-muted-foreground uppercase leading-relaxed">
                        Add children to your Family Hub to enroll them.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => router.push(addChildHref())} className="h-8 rounded-lg text-[8px] font-black uppercase">
                        <Plus className="h-3 w-3 mr-1" /> Add Child
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Squad code input */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Code</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="8-20 CHARACTER CODE"
                    value={teamCode}
                    onChange={e => setTeamCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    className="h-14 pl-10 text-xl font-black tracking-widest rounded-2xl border-2 border-primary/20"
                  />
                </div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase italic ml-1">
                  Unique institutional code provided by your team lead.
                </p>
              </div>
            </CardContent>
            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button
                className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20"
                onClick={handleReviewTeam}
                disabled={isJoining || isResolvingInvite || !teamCode.trim()}
              >
                {isJoining || isResolvingInvite
                  ? <Loader2 className="h-6 w-6 animate-spin" />
                  : "Review Team"}
              </Button>
            </CardFooter>
          </Card>

        {/* League and tournament enrollment always act on the active squad. */}
        {isStaff ? (
          <>
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-black text-white flex flex-col">
              <div className="h-2 bg-primary w-full" />
              <CardHeader className="p-8 lg:p-10">
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20"><Trophy className="h-6 w-6" /></div>
                  <div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Join League As Team</CardTitle>
                    <CardDescription className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">Register {activeTeam?.name || 'the current squad'}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 lg:p-10 pt-0 flex-1 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-1">League ID / Slug</Label>
                  <Input placeholder="e.g. winter-varsity-2024" value={leagueCode} onChange={e => setLeagueCode(e.target.value)} className="h-14 text-base font-bold rounded-2xl border-none bg-white/10 text-white placeholder:text-white/20" />
                </div>
                <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Current Squad</p>
                  <p className="mt-2 text-sm font-bold">{activeTeam?.name || 'Select a squad before registering'}</p>
                </div>
              </CardContent>
              <CardFooter className="p-8 lg:p-10 pt-0"><Button variant="secondary" className="w-full h-14 rounded-2xl text-lg font-black bg-white text-black hover:bg-white/90 shadow-xl" onClick={handleGoToLeague} disabled={!leagueCode.trim() || !activeTeam}><span>Open League Registration</span><ArrowRight className="ml-2 h-5 w-5" /></Button></CardFooter>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col">
              <div className="h-2 bg-primary w-full" />
              <CardHeader className="p-8 lg:p-10">
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary"><CalendarDays className="h-6 w-6" /></div>
                  <div><CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Join Tournament As Team</CardTitle><CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Register {activeTeam?.name || 'the current squad'}</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="p-8 lg:p-10 pt-0 flex-1 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Tournament Code, ID, or Registration Link</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="e.g. CUP-2026 or teamId:eventId"
                      value={tournamentLink}
                      onChange={event => {
                        setTournamentLink(event.target.value);
                        setTournamentPreview(null);
                      }}
                      className="h-14 min-w-0 flex-1 text-sm font-bold rounded-2xl border-2"
                    />
                    <Button type="button" variant="outline" onClick={handleResolveTournament} disabled={!tournamentLink.trim() || isResolvingTournament} className="h-14 rounded-2xl font-black uppercase text-[10px]">
                      {isResolvingTournament ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find Tournament'}
                    </Button>
                  </div>
                  {tournamentPreview && <p className="text-xs font-bold text-green-700">Found: {tournamentPreview.title}</p>}
                </div>
                <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10"><p className="text-[10px] font-black uppercase tracking-widest text-primary">Current Squad</p><p className="mt-2 text-sm font-bold">{activeTeam?.name || 'Select a squad before registering'}</p></div>
              </CardContent>
              <CardFooter className="p-8 lg:p-10 pt-0"><Button className="w-full h-14 rounded-2xl text-lg font-black" onClick={handleGoToTournament} disabled={!tournamentPreview || !activeTeam}><span>Open Tournament Registration</span><ArrowRight className="ml-2 h-5 w-5" /></Button></CardFooter>
            </Card>
          </>
        ) : null}
      </div>

      {isStaff && activeTeam && (
        <Card className="rounded-[2rem] border-primary/20 bg-primary/5">
          <CardContent className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black uppercase tracking-tight">Invite players to {activeTeam.name}</p><p className="text-xs text-muted-foreground mt-1">Share the link. Players join themselves; you do not need to create their account.</p></div>
            <Button onClick={handleCopyInviteLink} className="h-11 rounded-xl font-black uppercase text-[10px] shrink-0"><Copy className="h-4 w-4 mr-2" /> Copy Player Invite Link</Button>
          </CardContent>
        </Card>
      )}

      <div className="bg-primary/5 p-8 rounded-[3rem] border-2 border-dashed border-primary/20 text-center space-y-4">
        <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h4 className="text-lg font-black uppercase tracking-tight">Need a Squad Code?</h4>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest max-w-sm mx-auto">
            Contact your organization lead to receive your unique coordination code.
          </p>
        </div>
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="rounded-[2.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">
              Join {invitePreview?.teamName || 'this squad'}?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-medium">
              {`Confirm joining “${invitePreview?.teamName || 'this squad'}” as a player.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isJoining}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleJoinTeam} disabled={isJoining || !effectivePlayerId}>
              {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join Squad As Player'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
