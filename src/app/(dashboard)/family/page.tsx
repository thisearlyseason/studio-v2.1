"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useTeam, PlayerProfile, Team, TeamEvent } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Baby,
  Plus,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Users,
  Loader2,
  Signature,
  Key,
  ArrowRight,
  CalendarDays,
  Activity,
  FileSignature,
  DollarSign,
  MapPin,
  Pencil,
  X,
  Check,
  Info,
  Trophy,
  UserCheck,
  Edit2,
  Mail,
  Copy,
  Trash2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
  DialogClose
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { format, differenceInYears, isFuture, isToday, isValid, parseISO, isAfter, startOfDay, isSameDay } from 'date-fns';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { query, where, collectionGroup } from 'firebase/firestore';
import { AccessRestricted } from '@/components/layout/AccessRestricted';

const COMMON_SPORTS = ['Soccer', 'Basketball', 'Baseball', 'Softball', 'Football', 'Hockey', 'Lacrosse', 'Tennis', 'Golf', 'Swimming', 'Track & Field', 'Volleyball', 'Wrestling', 'Cross Country', 'Gymnastics'];

function safeAge(dob: string): number | null {
  if (!dob) return null;
  const d = parseISO(dob);
  if (!isValid(d)) return null;
  return differenceInYears(new Date(), d);
}

// --- Edit Child Modal ---
function EditChildModal({ child, onClose }: { child: PlayerProfile; onClose: () => void }) {
  const { updateChild, sendChildInvite, user } = useTeam();
  const [form, setForm] = useState({
    firstName: child.firstName || '',
    lastName: child.lastName || '',
    dateOfBirth: child.dateOfBirth || '',
    ageGroup: child.ageGroup || '',
    primaryPosition: child.primaryPosition || '',
    height: child.height || '',
    weight: child.weight || '',
    school: child.school || '',
    gradYear: child.gradYear || '',
    notes: child.notes || '',
    sportPositions: child.sportPositions || {},
    pendingInviteEmail: child.pendingInviteEmail || '',
  });
  const [sports, setSports] = useState<string[]>(child.sports || []);
  const [isSaving, setIsSaving] = useState(false);
  const [sportInput, setSportInput] = useState('');

  const toggleSport = (s: string) => {
    setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const addCustomSport = () => {
    const s = sportInput.trim();
    if (s && !sports.includes(s)) { setSports(prev => [...prev, s]); }
    setSportInput('');
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: "Name Required", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await updateChild(child.id, { ...form, sports });
      toast({ title: "Profile Updated", description: `${form.firstName}'s profile has been saved.` });
      onClose();
    } catch {
      toast({ title: "Save Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-2xl bg-white text-foreground flex flex-col max-h-[90vh]">
      <DialogTitle className="sr-only">Edit Athlete Profile</DialogTitle>
      <div className="h-2 bg-primary w-full shrink-0" />
      <div className="overflow-y-auto flex-1">
        <div className="p-8 lg:p-10 space-y-8">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">Edit Profile</DialogTitle>
            <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Athlete Data Management</DialogDescription>
          </DialogHeader>

          {/* Name + DOB */}
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b pb-2">Identity</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">First Name <span className="text-primary">*</span></Label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Last Name <span className="text-primary">*</span></Label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date of Birth</Label>
                <Input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} className="h-12 rounded-xl border-2 font-black" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Age Group / Division</Label>
                <Input placeholder="e.g. U14, 10U, Bantam" value={form.ageGroup} onChange={e => setForm(f => ({ ...f, ageGroup: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
            </div>
            <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-dashed border-primary/20">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Athlete Email (Teen Independent Login)</Label>
              <Input 
                type="email" 
                placeholder="athlete@email.com" 
                value={form.pendingInviteEmail} 
                onChange={e => setForm(f => ({ ...f, pendingInviteEmail: e.target.value }))} 
                className="h-12 rounded-xl border-2 font-bold focus-visible:ring-primary/20" 
              />
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-primary shrink-0" />
                <p className="text-[9px] font-bold text-muted-foreground uppercase leading-relaxed">
                  Required for teens to activate their own login and recruitment dashboard.
                </p>
              </div>
            </div>
          </div>

          {/* Sports */}
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b pb-2">Sports</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_SPORTS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSport(s)}
                  className={cn(
                    "px-3 h-8 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border-2 active:scale-95",
                    sports.includes(s)
                      ? "bg-primary text-white border-primary shadow-md"
                      : "bg-muted/20 text-muted-foreground border-transparent hover:border-primary/30 hover:bg-primary/5"
                  )}
                >
                  {sports.includes(s) && <Check className="h-3 w-3 mr-1 inline" />}{s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add custom sport..."
                value={sportInput}
                onChange={e => setSportInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSport())}
                className="h-10 rounded-xl border-2 font-bold"
              />
              <Button type="button" variant="outline" onClick={addCustomSport} className="h-10 rounded-xl border-2 font-black text-[10px] uppercase">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {sports.length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap gap-1">
                  {sports.map(s => (
                    <Badge key={s} className="bg-primary/10 text-primary border-none font-black text-[9px] uppercase px-2 gap-1">
                      {s}
                      <button type="button" onClick={() => toggleSport(s)}><X className="h-2.5 w-2.5" /></button>
                    </Badge>
                  ))}
                </div>
                
                {/* Position/Role assignments for ALL selected sports */}
                {sports.length > 0 && (
                  <div className="bg-muted/10 p-4 rounded-2xl border border-dashed space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-[9px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                       <Activity className="h-3 w-3" /> Sport-Specific Role Assignments
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {sports.map(s => (
                        <div key={s} className="space-y-1.5">
                          <Label className="text-[8px] font-black uppercase tracking-widest ml-1 opacity-60">Primary Role in {s}</Label>
                          <Input 
                            placeholder={`e.g. ${s === 'Soccer' ? 'Striker' : s === 'Basketball' ? 'Point Guard' : 'Key Role'}`}
                            value={form.sportPositions?.[s] || ''} 
                            onChange={e => setForm(f => ({ 
                              ...f, 
                              sportPositions: { ...(f.sportPositions || {}), [s]: e.target.value } 
                            }))} 
                            className="h-10 rounded-xl border-2 font-bold text-xs" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Athletic Stats */}
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b pb-2">Athletic Profile</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Primary Position</Label>
                <Input placeholder="e.g. Point Guard" value={form.primaryPosition} onChange={e => setForm(f => ({ ...f, primaryPosition: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Height</Label>
                <Input placeholder="e.g. 5ft 8in" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Weight</Label>
                <Input placeholder="e.g. 140 lbs" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
            </div>
          </div>

          {/* Academic */}
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b pb-2">Academic</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">School</Label>
                <Input placeholder="e.g. Lincoln High" value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Grad Year</Label>
                <Input placeholder="e.g. 2028" value={form.gradYear} onChange={e => setForm(f => ({ ...f, gradYear: e.target.value }))} className="h-12 rounded-xl border-2 font-bold" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Notes</Label>
            <Textarea placeholder="Medical notes, dietary needs, emergency contacts, coach instructions..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl border-2 min-h-[100px] font-medium" />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose} className="rounded-2xl font-black uppercase text-[10px]">Cancel</Button>
            <Button className="h-14 px-10 rounded-2xl font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Profile"}
            </Button>
          </DialogFooter>
        </div>
      </div>
    </DialogContent>
  );
}

// --- Login Enabled Info Modal ---
function LoginEnabledInfoModal() {
  return (
    <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-lg bg-white text-foreground">
      <DialogTitle className="sr-only">Login Enabled Explained</DialogTitle>
      <div className="h-2 bg-primary w-full" />
      <div className="p-8 lg:p-10 space-y-6">
        <DialogHeader>
          <DialogTitle className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
            <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Key className="h-6 w-6" /></div>
            Login Enabled
          </DialogTitle>
          <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Youth Account Access System</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/10 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-primary">What it does</p>
            <p className="text-sm font-medium leading-relaxed text-foreground/80">
              When you click <strong>Enable Login</strong> for a child, it flags their athlete profile as <em>eligible for an independent login account</em>. This allows the player to sign in directly with their own credentials rather than being exclusively managed through your guardian account.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: UserCheck, title: "Independent Access", desc: "Your child can log in and view their own schedule, team documents, and profile without signing in through you." },
              { icon: ShieldCheck, title: "Parent Stays In Control", desc: "You remain the guardian administrator. Your child's account is linked to your household and you retain full visibility." },
              { icon: Trophy, title: "Recruiting Eligibility", desc: "Players with login-enabled accounts can activate their recruiting profile, making them visible to coaches and programs." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-4 rounded-2xl bg-muted/20 border">
                <div className="bg-primary p-2.5 rounded-xl text-white shrink-0 h-fit"><Icon className="h-4 w-4" /></div>
                <div>
                  <p className="font-black text-xs uppercase tracking-tight">{title}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex gap-3">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] font-black uppercase text-amber-700 leading-relaxed tracking-tight">
              After enabling, the player will need to create an account using their registered email or a parent-provided invitation to link their credentials.
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

// --- Child Card ---
function ChildCard({ child, teams }: { child: PlayerProfile; teams: Team[] }) {
  const { sendChildInvite, revokeChildInvite } = useTeam();
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLoginInfoOpen, setIsLoginInfoOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [sharedUrl, setSharedUrl] = useState('');

  const age = safeAge(child.dateOfBirth);
  const childTeams = (teams || []).filter(t => child.joinedTeamIds?.includes(t.id));

  const handleInviteSubmit = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      const url = await sendChildInvite(child, inviteEmail);
      if (url) {
        setSharedUrl(url);
        setIsSuccessOpen(true);
        setIsInviteOpen(false);
      }
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async () => {
    setIsRevoking(true);
    try {
      await revokeChildInvite(child.id);
      toast({ title: 'Invite Revoked', description: 'The invitation has been successfully cancelled.' });
      setIsInviteOpen(false);
    } catch (error) {
      console.error('Error revoking invite:', error);
      toast({ title: 'Error', description: 'Failed to revoke invitation.', variant: 'destructive' });
    } finally {
      setIsRevoking(false);
    }
  };

  const isInviteExpired = child.inviteExpiresAt ? !isFuture(parseISO(child.inviteExpiresAt)) : false;

  return (
    <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group transition-all hover:ring-primary/20">
      <div className="h-2 hero-gradient w-full" />
      <CardContent className="p-8 lg:p-10 space-y-6 flex-1">

        {/* Header Row */}
        <div className="flex justify-between items-start">
          <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary shadow-inner">
            <Baby className="h-10 w-10" />
          </div>
          <div className="flex items-center gap-2">
            {age !== null
              ? <Badge variant="secondary" className="bg-black text-white border-none font-black uppercase tracking-widest text-[10px] h-7 px-4 shadow-lg">{age} Years Old</Badge>
              : <Badge variant="secondary" className="bg-muted text-muted-foreground border-none font-black uppercase tracking-widest text-[10px] h-7 px-4">Age N/A</Badge>
            }
            {/* Edit Button */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="h-7 w-7 rounded-xl border-2 hover:border-primary hover:text-primary transition-all">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <EditChildModal child={child} onClose={() => setIsEditOpen(false)} />
            </Dialog>
          </div>
        </div>

        {/* Name + ID */}
        <div className="space-y-1">
          <h3 className="text-3xl font-black uppercase tracking-tight group-hover:text-primary transition-colors text-foreground">
            {child.firstName} {child.lastName}
          </h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
            Minor Player Hub • {child.ageGroup ? `${child.ageGroup} Division` : 'No Division Set'}
          </p>
        </div>

        {/* Sports Tags */}
        {child.sports && child.sports.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {child.sports.map(s => (
              <Badge key={s} className="bg-primary/10 text-primary border-none font-black text-[9px] uppercase px-2 h-5">{s}</Badge>
            ))}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {child.sportPositions && Object.entries(child.sportPositions).length > 0 ? (
            Object.entries(child.sportPositions).map(([sport, pos]) => (
              <div key={sport} className="bg-primary/5 p-3 rounded-2xl border border-primary/10 group-hover:bg-primary/10 transition-colors">
                <p className="text-[8px] font-black uppercase text-primary opacity-60">{sport} Role</p>
                <p className="text-sm font-black uppercase truncate">{pos || 'TBD'}</p>
              </div>
            ))
          ) : child.primaryPosition ? (
            <div className="bg-muted/30 p-3 rounded-2xl border shadow-inner">
              <p className="text-[8px] font-black uppercase opacity-40">Primary Position</p>
              <p className="text-sm font-black uppercase truncate">{child.primaryPosition}</p>
            </div>
          ) : null}
          
          {child.height && (
            <div className="bg-muted/30 p-3 rounded-2xl border shadow-inner">
              <p className="text-[8px] font-black uppercase opacity-40">Height</p>
              <p className="text-sm font-black">{child.height}</p>
            </div>
          )}
          {child.weight && (
            <div className="bg-muted/30 p-3 rounded-2xl border shadow-inner">
              <p className="text-[8px] font-black uppercase opacity-40">Weight</p>
              <p className="text-sm font-black">{child.weight}</p>
            </div>
          )}
          {child.school && (
            <div className="bg-muted/30 p-3 rounded-2xl border shadow-inner col-span-2">
              <p className="text-[8px] font-black uppercase opacity-40">School {child.gradYear ? `• Class of ${child.gradYear}` : ''}</p>
              <p className="text-sm font-black truncate">{child.school}</p>
            </div>
          )}
        </div>

        {/* Enrolled Squads */}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
            Active Squads ({childTeams.length})
          </p>
          <div className="space-y-2">
            {childTeams.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-2xl border transition-all hover:bg-white hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-tight truncate text-foreground">{t.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-20 text-foreground" />
              </div>
            ))}
            {childTeams.length === 0 && (
              <Button variant="ghost" className="w-full h-12 rounded-2xl border-2 border-dashed text-[10px] font-black uppercase text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all" onClick={() => router.push('/teams/join')}>
                <Plus className="h-4 w-4 mr-2" /> Enroll in first squad
              </Button>
            )}
          </div>
        </div>

        {/* Notes */}
        {child.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-[8px] font-black uppercase text-amber-600 mb-1">Guardian Notes</p>
            <p className="text-xs font-medium text-amber-900 leading-relaxed line-clamp-3">{child.notes}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" className="rounded-2xl h-14 border-2 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-1 hover:border-primary transition-all" onClick={() => router.push('/files')}>
            <Signature className="h-4 w-4" />
            <span>Execute Waivers</span>
          </Button>

          {/* Login Enabled Button + Info */}
          <div className="relative">
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full rounded-2xl h-14 border-2 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-1 transition-all",
                    child.hasLogin ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" : child.pendingInviteEmail ? (isInviteExpired ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100") : "hover:border-primary active:scale-95"
                  )}
                  disabled={child.hasLogin}
                >
                  <Key className={cn("h-4 w-4", child.hasLogin ? "text-green-600" : child.pendingInviteEmail ? (isInviteExpired ? "text-red-500" : "text-amber-500") : "text-amber-600")} />
                  <span>
                    {child.hasLogin ? "Login Access Enabled" : child.pendingInviteEmail ? (isInviteExpired ? "Invite Expired" : "Invite Pending") : "Enable Login"}
                  </span>
                  {child.pendingInviteEmail && !child.hasLogin && (
                    <span className="text-[7px] font-bold lowercase text-muted-foreground opacity-60">to {child.pendingInviteEmail}</span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-md bg-white text-foreground">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">
                      {child.pendingInviteEmail ? "Manage Invitation" : "Enable Login Access"}
                    </DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Youth Account Provisioning</DialogDescription>
                  </DialogHeader>

                  {child.pendingInviteEmail ? (
                    <div className="space-y-6">
                      <div className={cn(
                        "p-4 rounded-2xl border-2 space-y-3",
                        isInviteExpired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-xl",
                            isInviteExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                          )}>
                            {isInviteExpired ? <AlertCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase opacity-60">Sent to</p>
                            <p className="text-sm font-black">{child.pendingInviteEmail}</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-black/5">
                          <p className="text-[10px] font-black uppercase opacity-60">Status</p>
                          <p className={cn("text-xs font-black uppercase", isInviteExpired ? "text-red-600" : "text-amber-600")}>
                            {isInviteExpired ? "Link Expired" : `Expires in ${child.inviteExpiresAt ? format(parseISO(child.inviteExpiresAt), 'MMM d, yyyy') : '7 days'}`}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Button 
                          className="w-full h-14 rounded-xl font-black uppercase shadow-xl" 
                          onClick={() => {
                            setInviteEmail(child.pendingInviteEmail || '');
                            handleInviteSubmit();
                          }}
                          disabled={isInviting || isRevoking}
                        >
                          {isInviting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Resend Invitation"}
                        </Button>
                        <Button 
                          variant="ghost"
                          className="w-full h-12 rounded-xl font-black uppercase text-red-500 hover:text-red-600 hover:bg-red-50" 
                          onClick={handleRevokeInvite}
                          disabled={isInviting || isRevoking}
                        >
                          {isRevoking ? <Loader2 className="h-5 w-5 animate-spin" /> : "Revoke & Cancel Invite"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                        Enter the email address where your child will receive their invitation link. This will allow them to create their own password and sign in directly.
                      </p>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Athlete Email</Label>
                        <Input 
                          type="email" 
                          placeholder="athlete@email.com" 
                          value={inviteEmail} 
                          onChange={e => setInviteEmail(e.target.value)}
                          className="h-12 rounded-xl border-2 font-bold"
                        />
                      </div>
                      <DialogFooter>
                        <Button 
                          className="w-full h-14 rounded-xl font-black uppercase shadow-xl" 
                          onClick={handleInviteSubmit}
                          disabled={isInviting || !inviteEmail}
                        >
                          {isInviting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send Invitation Link"}
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            {/* Success Modal */}
        <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
          <DialogContent className="max-w-md bg-white rounded-[2rem] p-10 space-y-8 border-none shadow-2xl overflow-hidden">
            <div className="space-y-4 text-center">
              <div className="w-20 h-20 hero-gradient rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl animate-in zoom-in-50 duration-500">
                <Check className="h-10 w-10 text-white" />
              </div>
              <DialogTitle className="text-3xl font-bold tracking-tight text-slate-900">Invite Ready!</DialogTitle>
              <DialogDescription className="text-slate-500 text-lg leading-relaxed">
                Copy the link below and share it with your athlete to enable their independent login.
              </DialogDescription>
            </div>

            <div className="space-y-6">
              <div className="relative group">
                <div className="absolute -inset-1 hero-gradient blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                <div className="relative bg-slate-50 p-6 rounded-2xl border border-slate-100 break-all text-sm font-mono text-slate-600 leading-relaxed">
                  {sharedUrl}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(sharedUrl);
                    toast({ title: 'Copied!', description: 'Link copied to clipboard.' });
                  }}
                  className="rounded-full h-14 text-lg font-semibold hero-gradient shadow-lg hover:shadow-xl transition-all"
                >
                  <Copy className="mr-2 h-5 w-5" /> Copy Link
                </Button>
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-full h-14 text-lg font-semibold border-slate-200 hover:bg-slate-50">
                    Done
                  </Button>
                </DialogClose>
              </div>
              
              <p className="text-center text-xs text-slate-400 font-medium italic">
                Note: This invitation link will expire in 7 days.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Modal (Placeholder - implement existing edit logic if not there) */}
            <Dialog open={isLoginInfoOpen} onOpenChange={setIsLoginInfoOpen}>
              <DialogTrigger asChild>
                <button className="absolute -top-1.5 -right-1.5 bg-muted rounded-full p-0.5 hover:bg-primary hover:text-white transition-colors text-muted-foreground z-10">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </DialogTrigger>
              <LoginEnabledInfoModal />
            </Dialog>
          </div>
        </div>
      </CardContent>

      <CardFooter className="px-8 lg:p-10 pb-8 pt-0">
        <Button className="w-full h-14 rounded-2xl bg-black text-white font-black uppercase text-xs tracking-widest shadow-xl group-hover:bg-primary transition-colors active:scale-95 border-none" onClick={() => router.push('/teams/join')}>
          Enroll in New League <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- Master Squad Wall ---
function MasterSquadWall({ consolidatedTeams }: { consolidatedTeams: { team: Team; members: PlayerProfile[] }[] }) {
  const router = useRouter();
  if (consolidatedTeams.length === 0) return null;

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Consolidated Squad Wall</h2>
        </div>
        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary bg-primary/5">
          {consolidatedTeams.length} Active Directives
        </Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {consolidatedTeams.map(({ team, members }) => (
          <Card 
            key={team.id}
            className="group relative rounded-[2rem] border-none shadow-lg bg-white/40 backdrop-blur-xl overflow-hidden ring-1 ring-black/5 hover:ring-primary/40 transition-all cursor-pointer h-32 flex flex-col justify-end p-6"
            onClick={() => router.push(`/feed?teamId=${team.id}`)}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-primary transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
            
            {/* Participant Avatars */}
            <div className="absolute top-4 right-4 flex -space-x-2">
              {members.length > 0 ? members.map((m, i) => (
                <div 
                  key={m.id} 
                  className="h-7 w-7 rounded-full border-2 border-white hero-gradient text-[9px] font-black text-white flex items-center justify-center shadow-md animate-in fade-in zoom-in duration-300" 
                  style={{ zIndex: 10 - i }}
                >
                  {m.firstName[0]}
                </div>
              )) : (
                <div className="h-7 w-7 rounded-full border-2 border-white bg-black/10 flex items-center justify-center">
                  <UserCheck className="h-3 w-3 text-black/30" />
                </div>
              )}
            </div>

            <div className="space-y-0.5">
              <h4 className="text-sm font-black uppercase tracking-tight leading-tight group-hover:text-primary transition-colors truncate pr-12">
                {team.name}
              </h4>
              <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-1.5 truncate">
                <Trophy className="h-2 w-2 opacity-50 shrink-0" />
                <span className="truncate">{team.sport || 'ATHLETICS'} • {team.code || team.teamCode || team.inviteCode || team.id.toUpperCase()}</span>
                {(team.isDemo || team.id.startsWith('demo_')) && (
                  <Badge variant="outline" className="text-[6px] h-3 px-1 border-primary/20 text-primary uppercase font-black bg-primary/5 ml-1 shrink-0">DEMO-ID</Badge>
                )}
              </div>
            </div>
          </Card>
        ))}
        <Button 
          variant="outline" 
          onClick={() => router.push('/teams/join')}
          className="rounded-[2.5rem] border-2 border-dashed border-primary/20 bg-primary/5 h-32 flex flex-col gap-2 hover:bg-primary/10 hover:border-primary/40 transition-all"
        >
          <Plus className="h-6 w-6 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Join New Squad</span>
        </Button>
      </div>
    </div>
  );
}

// --- Family Page ---
export default function FamilyPage() {
  const { 
    myChildren, 
    registerChild, 
    joinTeamWithCode, 
    teams, 
    householdEvents, 
    householdGames,
    householdBalance, 
    isParent,
    user,
    sendChildInvite
  } = useTeam();

  const db = useFirestore();
  const router = useRouter();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newChild, setNewChild] = useState({ firstName: '', lastName: '', dob: '', teamCode: '', email: '' });

  const sigsQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collectionGroup(db, 'signatures'), where('userId', '==', user.id));
  }, [db, user?.id]);
  const { data: signatures } = useCollection<any>(sigsQuery);

  const handleAddChild = async () => {
    if (!newChild.firstName || !newChild.lastName || !newChild.dob) {
      toast({ title: "Incomplete Data", description: "Identity parameters are required for enrollment.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const cid = await registerChild(newChild.firstName, newChild.lastName, newChild.dob, newChild.email);
      
      if (cid && newChild.email) {
        // If it's a teen (>= 13), automatically trigger an invite
        const age = safeAge(newChild.dob);
        if (age !== null && age >= 13) {
           await sendChildInvite({ 
             id: cid, 
             firstName: newChild.firstName, 
             lastName: newChild.lastName,
             dateOfBirth: newChild.dob,
             isMinor: true,
             parentId: user?.id,
             joinedTeamIds: [],
             userId: null,
             hasLogin: false,
             createdAt: new Date().toISOString()
           } as PlayerProfile, newChild.email);
        }
      }

      if (cid && newChild.teamCode.trim()) {
        const joinSuccess = await joinTeamWithCode(newChild.teamCode.trim().toUpperCase(), cid, 'Player');
        if (joinSuccess) {
          toast({ title: "Player Enrolled", description: `${newChild.firstName} joined the team successfully.` });
        } else {
          toast({ title: "Team Join Handled", description: "Athlete added, but team code was not recognized.", variant: "default" });
        }
      } else if (cid) {
        toast({ title: "Player Registered", description: "Athlete hub initialized. You can join squads later." });
      }

      setIsAddOpen(false);
      setNewChild({ firstName: '', lastName: '', dob: '', teamCode: '', email: '' });
    } finally {
      setIsProcessing(false);
    }
  };

  const consolidatedTeams = useMemo(() => {
    const map = new Map<string, { team: Team; members: PlayerProfile[] }>();
    
    // Use teams from context as base
    teams.forEach(t => {
      if (!map.has(t.id)) {
        map.set(t.id, { team: t, members: [] });
      }
    });

    // Populate members for each team
    myChildren.forEach(child => {
      child.joinedTeamIds?.forEach(tid => {
        const entry = map.get(tid);
        if (entry) {
          if (!entry.members.find(m => m.id === child.id)) {
            entry.members.push(child);
          }
        }
      });
    });

    return Array.from(map.values());
  }, [teams, myChildren]);

  const upcomingEvents = useMemo(() => {
    const rawEvents = householdEvents || [];
    const rawGames = householdGames || [];
    
    const toDateObj = (d: any) => {
       if (!d) return null;
       if (d instanceof Date) return d;
       // Handle Firebase Timestamps
       if (d && typeof d === 'object' && 'toDate' in d) return d.toDate();
       if (d && typeof d === 'object' && 'seconds' in d) return new Date(d.seconds * 1000);
       
       try {
         const parsed = typeof d === 'string' ? parseISO(d) : new Date(d);
         return isValid(parsed) ? parsed : null;
       } catch (e) {
         return null;
       }
    };

    const synthesizedGames = rawGames.map(g => ({
       ...g,
       eventType: 'game',
       title: g.title || `Match: ${g.team1} vs ${g.team2}`,
       startTime: g.startTime || g.time,
       id: g.id || `game_${g.date}_${g.time || g.startTime}`
    }));

    const householdTeamIds = Array.from(new Set([
      ...(myChildren || []).flatMap(c => c.joinedTeamIds || []),
      ...(teams || []).map(t => t.id)
    ]));

    const expandedTournamentMatches: any[] = [];
    rawEvents.forEach(e => {
       if (e.isTournament && e.tournamentGames && e.tournamentGames.length > 0) {
         e.tournamentGames.forEach((game: any, idx: number) => {
           if (!game.date) return;
           const isHouseholdGame = householdTeamIds.includes(game.team1Id) || householdTeamIds.includes(game.team2Id);
           if (!isHouseholdGame) return;

           const isTBD = (game.team1 || '').toLowerCase().includes('tbd') || (game.team2 || '').toLowerCase().includes('tbd');
           if (isTBD) return;

           expandedTournamentMatches.push({
             ...e,
             id: game.id || `${e.id}_match_${idx}`,
             title: `[Match] ${game.team1} vs ${game.team2}`,
             date: game.date,
             startTime: game.time,
             location: game.location || e.location,
             eventType: 'tournament',
             isTournamentMatch: true,
             round: game.round,
             matchTeamIds: [game.team1Id, game.team2Id]
           });
         });
       }
    });

    const allSourceEvents = [...rawEvents, ...synthesizedGames, ...expandedTournamentMatches];
    const now = new Date();
    const today = startOfDay(now);

    const filteredEvents = allSourceEvents.filter(e => {
       // Support 'date', 'startTime', or nested tournament date
       const targetDate = e.date || e.startTime;
       if (!targetDate) return false;
       
       const d = toDateObj(targetDate);
       if (!d || !isValid(d)) return false;
       
       // Show today's events and future events
       return isSameDay(d, today) || isAfter(d, today);
    });

    const uniqueEventsMap = new Map<string, any>();
    filteredEvents.forEach(e => {
       if (!uniqueEventsMap.has(e.id)) uniqueEventsMap.set(e.id, e);
    });

    return Array.from(uniqueEventsMap.values())
      .sort((a, b) => {
          const dA = toDateObj(a.date || a.startTime);
          const dB = toDateObj(b.date || b.startTime);
         return (dA?.getTime() || 0) - (dB?.getTime() || 0);
      });
  }, [householdEvents, householdGames, myChildren, teams]);

  const childItineraries = useMemo(() => {
    const rawEvents = householdEvents || [];
    const rawGames = householdGames || [];
    const today = startOfDay(new Date());

    const toDateObj = (d: any) => {
       if (!d) return null;
       if (d instanceof Date) return d;
       if (d && typeof d === 'object' && 'toDate' in d) return d.toDate();
       if (d && typeof d === 'object' && 'seconds' in d) return new Date(d.seconds * 1000);
       try {
         const parsed = typeof d === 'string' ? parseISO(d) : new Date(d);
         return isValid(parsed) ? parsed : null;
       } catch { return null; }
    };

    return (myChildren || []).map(child => {
      // Only look at this child's own teams — never the other sibling's teams
      const childTeamIds = new Set(child.joinedTeamIds || []);
      if (childTeamIds.size === 0) return { child, events: [] };

      const seen = new Set<string>();
      const childEvents: any[] = [];

      const addEvent = (e: any) => {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          childEvents.push(e);
        }
      };

      // 1. Regular events (practice, game, meeting, tournament header) belonging to child's teams
      rawEvents.forEach(e => {
        if (!childTeamIds.has(e.teamId)) return;
        const d = toDateObj(e.date);
        if (!d || !isValid(d)) return;
        if (!isSameDay(d, today) && !isAfter(d, today)) return;

        // For tournament parent events, also expand individual matches only for THIS child's team
        if (e.isTournament && e.tournamentGames && e.tournamentGames.length > 0) {
          // Add the tournament header itself
          addEvent(e);

          // Expand only matches where the child's team participates
          e.tournamentGames.forEach((game: any, idx: number) => {
            if (!game.date) return;
            const isChildGame = childTeamIds.has(game.team1Id) || childTeamIds.has(game.team2Id);
            if (!isChildGame) return;
            const isTBD = (game.team1 || '').toLowerCase().includes('tbd') || (game.team2 || '').toLowerCase().includes('tbd');
            if (isTBD) return;
            const gDate = toDateObj(game.date);
            if (!gDate || !isValid(gDate)) return;
            if (!isSameDay(gDate, today) && !isAfter(gDate, today)) return;
            addEvent({
              ...e,
              id: game.id || `${e.id}_match_${idx}`,
              title: `[Match] ${game.team1} vs ${game.team2}`,
              date: game.date,
              startTime: game.time,
              location: game.location || e.location,
              eventType: 'tournament',
              isTournamentMatch: true,
              round: game.round,
              matchTeamIds: [game.team1Id, game.team2Id]
            });
          });
        } else {
          addEvent(e);
        }
      });

      // 2. League games from householdGames
      rawGames.forEach(g => {
        const participants = g.matchTeamIds || [];
        if (!participants.some((tid: string) => childTeamIds.has(tid))) return;
        const d = toDateObj(g.date);
        if (!d || !isValid(d)) return;
        if (!isSameDay(d, today) && !isAfter(d, today)) return;
        addEvent({ ...g, eventType: 'game', title: g.title || `Match: ${g.team1} vs ${g.team2}`, startTime: g.startTime || g.time });
      });

      // Sort by date ascending
      childEvents.sort((a, b) => {
        const dA = toDateObj(a.date || a.startTime);
        const dB = toDateObj(b.date || b.startTime);
        return (dA?.getTime() || 0) - (dB?.getTime() || 0);
      });

      return { child, events: childEvents.slice(0, 4) };
    });
  }, [myChildren, householdEvents, householdGames]);

  if (!isParent) {
    return <AccessRestricted type="role" title="Household Domain Restricted" description="This sector is reserved for Guardians and Household Administrators." />;
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Household Command</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none text-foreground">Guardianship</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Managing {myChildren?.length || 0} Minor Players</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
              <Plus className="h-5 w-5 mr-2" /> Register Player
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-md bg-white text-foreground">
            <DialogTitle className="sr-only">Minor Player Registration</DialogTitle>
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 lg:p-10 space-y-8">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Athlete Data</DialogTitle>
                <DialogDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Under-18 Enrollment Hub</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">First Name</Label>
                    <Input value={newChild.firstName} onChange={e => setNewChild({ ...newChild, firstName: e.target.value })} className="h-12 rounded-xl border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Last Name</Label>
                    <Input value={newChild.lastName} onChange={e => setNewChild({ ...newChild, lastName: e.target.value })} className="h-12 rounded-xl border-2 font-bold" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Date of Birth</Label>
                  <Input type="date" value={newChild.dob} onChange={e => setNewChild({ ...newChild, dob: e.target.value })} className="h-12 rounded-xl border-2 font-black" />
                </div>
                <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-dashed border-primary/20">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Athlete Email (Recommended for Teens)</Label>
                  <Input 
                    type="email" 
                    placeholder="athlete@email.com" 
                    value={newChild.email} 
                    onChange={e => setNewChild({ ...newChild, email: e.target.value })} 
                    className="h-12 rounded-xl border-2 font-bold focus-visible:ring-primary/20" 
                  />
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-[9px] font-bold text-muted-foreground uppercase leading-relaxed">
                      Athletes aged 13+ can use this email to create their own secure login, manage their recruitment profile, and view their schedule independently.
                    </p>
                  </div>
                </div>
                {/* Immediate Join Integration */}
                <div className="space-y-2 pt-4 border-t border-dashed">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Quick Squad Enrollment
                  </p>
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Squad Join Code (Optional)</Label>
                  <Input 
                    placeholder="6-DIGIT CODE" 
                    value={newChild.teamCode} 
                    onChange={e => setNewChild({ ...newChild, teamCode: e.target.value.toUpperCase() })} 
                    className="h-14 rounded-xl border-2 font-black tracking-widest text-lg" 
                    maxLength={6}
                  />
                  <p className="text-[8px] font-bold text-muted-foreground uppercase leading-relaxed mt-1">
                    Enter a code provided by a coach to link this player immediately.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleAddChild} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Enroll Athlete"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Master Wall - Strategic Visibility Layer */}
      <MasterSquadWall consolidatedTeams={consolidatedTeams} />

      {/* Stats + Events Layer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pt-4">
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden group border-b-8 border-primary">
            <CardContent className="p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="bg-primary p-4 rounded-2xl shadow-lg ring-4 ring-primary/20"><DollarSign className="h-8 w-8 text-white" /></div>
                <Badge className="bg-white/20 text-white border-none font-black text-[10px] uppercase tracking-widest px-3 h-6">Consolidated</Badge>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-1">Household Balance</p>
                <p className="text-5xl font-black tracking-tighter">${householdBalance?.toLocaleString() || '0'}</p>
              </div>
              <Button className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-white transition-all shadow-xl" onClick={() => router.push('/pricing')}>
                Manage Payments Hub
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-md bg-white ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Operational Pulse</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border shadow-inner">
                <div>
                  <p className="text-[10px] font-black uppercase opacity-40">Active Squads</p>
                  <p className="text-xl font-black">{consolidatedTeams.length}</p>
                </div>
                <Users className="h-6 w-6 text-primary/40" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border shadow-inner">
                <div>
                  <p className="text-[10px] font-black uppercase opacity-40">Verified Docs</p>
                  <p className="text-xl font-black text-green-600 font-black">{signatures?.length || 0}</p>
                </div>
                <FileSignature className="h-6 w-6 text-primary/40" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border shadow-inner">
                <div>
                  <p className="text-[10px] font-black uppercase opacity-40">Total Athletes</p>
                  <p className="text-xl font-black">{myChildren?.length || 0}</p>
                </div>
                <Baby className="h-6 w-6 text-primary/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Household Itinerary</h2>
            </div>
            <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 hover:text-primary rounded-full px-6" onClick={() => router.push('/calendar')}>
              Master Schedule <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-12">
            {childItineraries.length > 0 ? childItineraries.map(({ child, events }) => (
              <div key={child.id} className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                   <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xs uppercase shadow-inner">
                     {child.firstName[0]}{child.lastName[0]}
                   </div>
                   <div>
                     <h3 className="text-sm font-black uppercase tracking-tight text-foreground">{child.firstName}'s Itinerary</h3>
                     <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">Next 4 Active Directives</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {events.length > 0 ? events.map((event) => {
                    const team = (teams || []).find(t => t.id === event.teamId);
                    return (
                      <Card key={event.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg transition-all group overflow-hidden bg-white hover:-translate-y-0.5 duration-300">
                        <CardContent className="p-0">
                          <div className="flex items-stretch h-20">
                            <div className="w-16 bg-muted/20 flex flex-col items-center justify-center border-r shrink-0 group-hover:bg-primary/5 transition-colors">
                              <span className="text-[8px] font-black uppercase opacity-40">{event.date ? format(new Date(event.date), 'MMM') : '—'}</span>
                              <span className="text-xl font-black">{event.date ? format(new Date(event.date), 'dd') : '—'}</span>
                            </div>
                            <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                              <div className="flex items-center justify-between gap-2 overflow-hidden">
                                <h4 className="font-black text-xs uppercase truncate group-hover:text-primary transition-colors">{event.title}</h4>
                                <Badge className="bg-primary/10 text-primary border-none text-[7px] uppercase font-black px-2 h-4 shrink-0">{event.eventType}</Badge>
                              </div>
                              <div className="flex items-center justify-between mt-1 pt-1 border-t border-black/5">
                                <p className="text-[9px] font-bold text-muted-foreground flex items-center gap-1.5 truncate">
                                  <Users className="h-2.5 w-2.5 opacity-40" /> {team?.name || 'Squad'}
                                </p>
                                <span className="text-[9px] font-black text-foreground/80 whitespace-nowrap ml-4">{event.startTime || 'TBD'}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }) : (
                    <div className="py-8 text-center rounded-[2rem] border-2 border-dashed border-muted/30 bg-muted/5 opacity-50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Strategic Silence for {child.firstName}</p>
                    </div>
                  )}
                </div>
              </div>
            )) : (
              <div className="p-12 text-center rounded-[3rem] border-4 border-dashed border-muted/30 bg-muted/5">
                <Calendar className="h-12 w-12 text-muted-foreground opacity-20 mx-auto mb-4" />
                <h4 className="text-xl font-black uppercase tracking-tight text-muted-foreground">Tactical Silence</h4>
                <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mt-1">No upcoming household directives found.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Roster Sector */}
      <div className="space-y-8 pt-6">
        <div className="flex items-center gap-3 px-2">
          <Baby className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">The Roster</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {myChildren?.map(child => (
            <ChildCard key={child.id} child={child} teams={teams || []} />
          ))}
          
          {(!myChildren || myChildren.length === 0) && (
            <Card className="col-span-full rounded-[3rem] border-4 border-dashed border-muted/30 bg-muted/5 flex flex-col items-center justify-center p-20 text-center animate-in fade-in duration-1000">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl mb-6 ring-1 ring-black/5">
                <Baby className="h-16 w-16 text-primary/40" />
              </div>
              <h3 className="text-3xl font-black uppercase tracking-tight mb-2">Initialize Your Household</h3>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-w-md mx-auto mb-10 leading-relaxed">
                Connect your athletes to our coordination grid to manage schedules, waivers, and recruitment potential.
              </p>
              <Button size="lg" className="h-16 px-12 rounded-2xl text-xl font-black shadow-2xl shadow-primary/20" onClick={() => setIsAddOpen(true)}>
                Initialize Athlete 01
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <ShieldCheck className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7 uppercase tracking-widest">Institutional Compliance</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Unified Household Control</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            As a guardian, you maintain absolute authority over your children's data and schedules. Click the <strong className="text-white">pencil icon</strong> on any athlete card to edit their profile — including sports, positions, academic info, and notes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}