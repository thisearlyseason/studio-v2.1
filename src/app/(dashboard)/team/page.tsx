
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Camera, 
  Edit3, 
  Hash, 
  Globe,
  Loader2,
  Users,
  MessageSquare,
  ShieldAlert,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Zap,
  PenTool,
  MapPin,
  Package,
  Shield,
  ChevronRight,
  ArrowUpRight,
  Terminal,
  Mail,
  Phone,
  Copy,
  ExternalLink,
  Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useTeam, Team, RegistrationEntry } from '@/components/providers/team-provider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collectionGroup, query, where } from 'firebase/firestore';
import Link from 'next/link';

export default function TeamProfilePage() {
  const { user: authUser } = useUser();
  const { activeTeam, setActiveTeam, teams, user, members, updateTeamDetails, isSuperAdmin, plans, updateTeamPlan, isStaff, hasFeature, respondToAssignment } = useTeam();
  const db = useFirestore();
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isUpdatingLogo, setIsUpdatingLogo] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const assignmentsQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid || !activeTeam?.id || !isStaff || !hasFeature?.('league_registration')) return null;
    
    const constraints = [
      where('assigned_team_id', '==', activeTeam.id),
      where('status', '==', 'assigned')
    ];
    
    if (!activeTeam.id.startsWith('demo_')) {
      constraints.push(where('assigned_team_owner_id', '==', authUser.uid));
    }
    
    return query(collectionGroup(db, 'registrationEntries'), ...constraints);
  }, [activeTeam?.id, db, isStaff, authUser?.uid, hasFeature]);

  const { data: rawAssignments } = useCollection<RegistrationEntry>(assignmentsQuery);
  const assignments = useMemo(() => rawAssignments || [], [rawAssignments]);

  const [editForm, setEditForm] = useState({
    name: '',
    sport: '',
    description: '',
    contactEmail: '',
    contactPhone: ''
  });

  useEffect(() => {
    setMounted(true);
    if (activeTeam) {
      setEditForm({
        name: activeTeam.name || '',
        sport: activeTeam.sport || '',
        description: activeTeam.description || '',
        contactEmail: activeTeam.contactEmail || '',
        contactPhone: activeTeam.contactPhone || ''
      });
      setSelectedPlanId(activeTeam.planId || 'starter_squad');
    }
  }, [activeTeam]);

  const recruitmentUrl = useMemo(() => {
    if (!activeTeam) return '';
    if (activeTeam.registrationProtocolId) {
      return `${window.location.origin}/register/league/${activeTeam.id}?protocol=${activeTeam.registrationProtocolId}`;
    }
    return `${window.location.origin}/teams/join?code=${activeTeam.code}`;
  }, [activeTeam]);

  const handleCopyRecruitmentUrl = async () => {
    try {
      await navigator.clipboard.writeText(recruitmentUrl);
      toast({ title: "Link Copied", description: "Recruitment URL copied to clipboard." });
    } catch (e) {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  };

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Accessing squad data...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const activePlan = plans.find(p => p.id === activeTeam.planId);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUpdatingLogo(true);
      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          await updateTeamDetails({ teamLogoUrl: ev.target?.result as string });
          toast({ title: "Logo Updated" });
          setIsUpdatingLogo(false);
        };
        reader.readAsDataURL(e.target.files[0]);
      } catch (error) {
        setIsUpdatingLogo(false);
      }
    }
  };

  const handleSaveDetails = async () => {
    try {
      await updateTeamDetails(editForm);
      setIsEditOpen(false);
    } catch (error) {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleUpdatePlan = async () => {
    if (!selectedPlanId || !activeTeam) return;
    await updateTeamPlan(activeTeam.id, selectedPlanId);
    setIsPlanOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/20 p-6 rounded-[2.5rem] border border-black/5">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground mb-3 ml-1">Squad Management</h2>
          <Select value={activeTeam.id} onValueChange={(id) => {
            const team = teams.find(t => t.id === id);
            if (team) setActiveTeam(team);
          }}>
            <SelectTrigger className="h-14 w-full md:w-72 rounded-2xl bg-white border-none shadow-sm font-black text-sm">
              <SelectValue placeholder="Select a team to manage" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl p-2">
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id} className="rounded-xl p-3 font-bold">
                  {team.name} {team.isDemo ? '(DEMO)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Status</p>
            <p className="text-sm font-black text-primary">{activePlan?.name || (activeTeam.planId === 'squad_organization' ? 'Squad Organization' : 'Starter')}</p>
          </div>
          <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] h-6 px-3 uppercase">{activeTeam.role}</Badge>
        </div>
      </div>

      {isStaff && (
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <ShieldAlert className="h-48 w-48" />
          </div>
          <CardHeader className="p-8 lg:p-10 relative z-10 border-b border-white/5">
            <div className="flex items-center gap-4">
              <div className="bg-primary p-3 rounded-2xl text-white shadow-lg">
                <Terminal className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Admin Quick-Access Hub</CardTitle>
                <CardDescription className="text-primary font-bold text-[10px] uppercase tracking-widest">Team Command & Control</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 lg:p-10 relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button asChild variant="outline" className="h-20 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-widest justify-start gap-4 px-6 group/btn">
                <Link href="/coaches-corner" className="flex items-center w-full">
                  <PenTool className="h-6 w-6 text-primary group-hover/btn:scale-110 transition-transform" />
                  <div className="flex flex-col items-start min-w-0 ml-3">
                    <span>Coaches Corner</span>
                    <span className="text-[7px] text-white/40">Docs & Waivers</span>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-20 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-widest justify-start gap-4 px-6 group/btn">
                <Link href="/leagues" className="flex items-center w-full">
                  <Shield className="h-6 w-6 text-primary group-hover/btn:scale-110 transition-transform" />
                  <div className="flex flex-col items-start min-w-0 ml-3">
                    <span>Leagues Hub</span>
                    <span className="text-[7px] text-white/40">Standings & Invites</span>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-20 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-widest justify-start gap-4 px-6 group/btn">
                <Link href="/facilities" className="flex items-center w-full">
                  <MapPin className="h-6 w-6 text-primary group-hover/btn:scale-110 transition-transform" />
                  <div className="flex flex-col items-start min-w-0 ml-3">
                    <span>Facilities</span>
                    <span className="text-[7px] text-white/40">Venue Control</span>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-20 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-widest justify-start gap-4 px-6 group/btn">
                <Link href="/equipment" className="flex items-center w-full">
                  <Package className="h-6 w-6 text-primary group-hover/btn:scale-110 transition-transform" />
                  <div className="flex flex-col items-start min-w-0 ml-3">
                    <span>Equipment</span>
                    <span className="text-[7px] text-white/40">Inventory Vault</span>
                  </div>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isStaff && assignments.length > 0 && (
        <Card className="rounded-[2.5rem] border-none shadow-xl ring-4 ring-primary/5 bg-white overflow-hidden animate-in slide-in-from-top-4 duration-500">
          <CardHeader className="bg-primary/5 border-b p-8 flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Pending Recruitment</CardTitle>
                <CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Coach Approval Required</CardDescription>
              </div>
            </div>
            <Badge className="bg-primary text-white h-6 font-black text-[10px] px-3 rounded-full">{assignments.length} NEW</Badge>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map(entry => (
                <div key={entry.id} className="p-5 bg-muted/20 rounded-3xl border-2 border-dashed flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="bg-white p-2 rounded-xl shadow-sm border shrink-0">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm uppercase truncate tracking-tight">{entry.answers['name'] || entry.answers['fullName'] || 'New Applicant'}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{entry.answers['position'] || 'Player'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" className="rounded-xl h-10 w-10 text-destructive hover:bg-destructive/5" onClick={() => respondToAssignment(entry.league_id, entry.id, 'declined')}><XCircle className="h-5 w-5" /></Button>
                    <Button size="sm" className="rounded-xl h-10 px-4 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20" onClick={() => respondToAssignment(entry.league_id, entry.id, 'accepted')}><CheckCircle2 className="h-4 w-4 mr-2" /> Accept</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="relative">
        <div className="h-40 sm:h-56 w-full hero-gradient rounded-[2.5rem] shadow-2xl overflow-hidden relative">
          {activeTeam.heroImageUrl ? (
            <img src={activeTeam.heroImageUrl} alt="Team Cover" className="w-full h-full object-cover opacity-30" />
          ) : (
            <div className="absolute inset-0 bg-primary/20" />
          )}
          <div className="absolute inset-0 bg-black/20" />
        </div>
        
        <div className="container px-6 -mt-20 flex flex-col sm:flex-row items-center sm:items-end gap-6 pb-2">
          <div className="relative group">
            <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoChange} />
            <Avatar className="h-40 w-40 border-[6px] border-background shadow-2xl rounded-3xl">
              <AvatarImage src={activeTeam.teamLogoUrl} className="object-cover" />
              <AvatarFallback className="hero-gradient text-white text-4xl font-black rounded-3xl">{activeTeam.name ? activeTeam.name[0] : 'T'}</AvatarFallback>
            </Avatar>
            {isAdmin && (
              <Button size="icon" variant="secondary" className="absolute bottom-2 right-2 h-10 w-10 rounded-2xl shadow-xl bg-white text-primary" onClick={() => logoInputRef.current?.click()} disabled={isUpdatingLogo}>
                {isUpdatingLogo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </Button>
            )}
          </div>
          
          <div className="flex-1 text-center sm:text-left space-y-2 mb-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <h1 className="text-4xl font-black tracking-tight">{activeTeam.name}</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-6">
                {activeTeam.sport || 'General'}
              </Badge>
              {activeTeam.isPro && <Badge className="bg-amber-500 text-white border-none font-black uppercase text-[10px] h-6 shadow-lg shadow-amber-500/20">Elite Squad</Badge>}
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-6 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <div className="flex items-center gap-2"><Hash className="h-4 w-4 text-primary opacity-40" />{activeTeam.code}</div>
              <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary opacity-40" />Active ID: {activeTeam.id.slice(-6)}</div>
            </div>
          </div>

          {isAdmin && (
            <div className="mb-2 flex gap-2">
              {isSuperAdmin && (
                <Button variant="outline" onClick={() => setIsPlanOpen(true)} className="rounded-full h-12 px-6 border-black font-black uppercase text-[10px] tracking-widest gap-2">
                  <Zap className="h-4 w-4" /> Override Tier
                </Button>
              )}
              <Button onClick={() => setIsEditOpen(true)} className="rounded-full px-8 h-12 font-black shadow-lg shadow-primary/20">
                <Edit3 className="h-4 w-4 mr-2" /> Edit Squad
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {isStaff && (
            <Card className="rounded-[2.5rem] border-none shadow-xl ring-4 ring-primary/5 bg-white overflow-hidden">
              <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between p-8">
                <div className="flex items-center gap-4">
                  <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight">Squad Governance</CardTitle>
                    <CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Staff Authority & Permissions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center justify-between p-6 bg-muted/20 rounded-3xl border-2 border-dashed">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl shadow-sm border"><MessageSquare className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="text-sm font-black uppercase leading-tight">Parent Feed Comments</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Allow parents to participate in live feed discussions</p>
                    </div>
                  </div>
                  <Switch
                    checked={activeTeam.parentCommentsEnabled}
                    onCheckedChange={(v) => updateTeamDetails({ parentCommentsEnabled: v })}
                  />
                </div>

                <div className="flex items-center justify-between p-6 bg-muted/20 rounded-3xl border-2 border-dashed">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl shadow-sm border"><Users className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="text-sm font-black uppercase leading-tight">Parent-to-Parent Chat</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Allow parents to start private chats with other parents</p>
                    </div>
                  </div>
                  <Switch
                    checked={activeTeam.parentChatEnabled}
                    onCheckedChange={(v) => updateTeamDetails({ parentChatEnabled: v })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/5">
              <CardTitle className="text-xl font-black">Official Squad Identity</CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-primary/60">Tier: {activePlan?.name || (activeTeam.planId === 'squad_organization' ? 'Squad Organization' : 'Starter')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Official Name</Label>
                  <p className="text-xl font-extrabold px-1">{activeTeam.name}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Sanctioned Sport</Label>
                  <p className="text-xl font-extrabold px-1">{activeTeam.sport || 'General Squad'}</p>
                </div>
                <div className="space-y-2 col-span-full">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Squad Bio</Label>
                  <p className="text-base font-bold px-1 text-foreground/80 leading-relaxed italic">
                    {activeTeam.description || 'No squad biography has been established.'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contact Email</Label>
                  <p className="text-sm font-bold px-1 flex items-center gap-2 text-primary"><Mail className="h-4 w-4" />{activeTeam.contactEmail || 'No email registered'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contact Phone</Label>
                  <p className="text-sm font-bold px-1 flex items-center gap-2 text-primary"><Phone className="h-4 w-4" />{activeTeam.contactPhone || 'No phone registered'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-8">
          <Card className="rounded-[2rem] border-none shadow-xl bg-primary text-primary-foreground overflow-hidden group">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-1">
                <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest text-[8px] h-5 px-2">Recruitment Hub</Badge>
                <h3 className="text-2xl font-black tracking-tight uppercase">Recruit Teammates</h3>
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Growth & Enrollment</p>
              </div>
              
              <div className="p-6 bg-white/10 rounded-2xl border border-white/10 space-y-3 text-center transition-all group-hover:bg-white/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Squad Identity Code</p>
                <div className="flex items-center justify-center gap-4">
                  <p className="text-4xl font-black tracking-[0.2em]">{activeTeam.code}</p>
                  <button onClick={async () => { await navigator.clipboard.writeText(activeTeam.code); toast({ title: "Code Copied" }); }}>
                    <Copy className="h-5 w-5 text-white/40 hover:text-white" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 px-1">Recruitment Pipeline</p>
                <Button variant="secondary" className="w-full h-12 rounded-xl font-black bg-white text-primary flex items-center justify-between px-6" onClick={handleCopyRecruitmentUrl}>
                  <span className="text-[10px] uppercase tracking-widest">Copy Recruitment Link</span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 flex items-start gap-3">
                  <Target className="h-4 w-4 text-white/40 mt-0.5" />
                  <p className="text-[9px] font-medium text-white/60 leading-relaxed italic">
                    {activeTeam.registrationProtocolId 
                      ? "Recruits will be sent to your custom enrollment pipeline." 
                      : "Recruits will be sent to the public hub to enter your squad code."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-lg overflow-hidden p-0 border-none shadow-2xl">
          <div className="bg-primary/5 p-8 border-b space-y-2">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tight">Edit Squad Profile</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Official team directory information.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Name</Label>
              <Input className="rounded-xl h-12 text-lg font-bold border-2" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Sport</Label>
              <Input className="rounded-xl h-12 border-2 font-bold" value={editForm.sport} onChange={e => setEditForm(p => ({ ...p, sport: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Bio</Label>
              <Textarea className="rounded-xl min-h-[120px] border-2 font-bold resize-none" placeholder="Brief history or goals..." value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label>
                <Input className="rounded-xl h-12 border-2 font-bold" value={editForm.contactEmail} onChange={e => setEditForm(p => ({ ...p, contactEmail: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Phone</Label>
                <Input className="rounded-xl h-12 border-2 font-bold" value={editForm.contactPhone} onChange={e => setEditForm(p => ({ ...p, contactPhone: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="p-8 bg-muted/10 border-t"><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSaveDetails}>Commit Changes</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Admin Plan Override</DialogTitle></DialogHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Tier</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="h-14 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">{plans.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black bg-black" onClick={handleUpdatePlan}>Assign Tier</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
