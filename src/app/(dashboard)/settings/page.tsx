
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Bell, 
  Lock, 
  LogOut, 
  Camera, 
  ChevronRight,
  HelpCircle,
  Loader2,
  CreditCard,
  ExternalLink,
  Building,
  Zap,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  BookOpen,
  Trophy,
  Clock,
  Target,
  Activity,
  Users,
  Info
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTeam } from '@/components/providers/team-provider';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { user, updateUser, members, activeTeam, updateMember, manageSubscription, isPro, isClubManager, resetSquadData, isStaff } = useTeam();
  const auth = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isDoubleConfirmOpen, setIsDoubleConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resetOptions, setResetOptions] = useState<string[]>(['games', 'events']);
  const [mounted, setMounted] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', position: '' });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user) {
      const currentMember = activeTeam ? members.find(m => m.userId === user.id) : null;
      setEditForm({ 
        name: user.name || '', 
        email: user.email || '', 
        phone: user.phone || '',
        position: currentMember?.position || ''
      });
    }
  }, [user, activeTeam, members]);

  if (!mounted || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Adjusting settings...</p>
      </div>
    );
  }

  const currentMember = activeTeam ? members.find(m => m.userId === user.id) : null;
  const isAdmin = activeTeam?.role === 'Admin';

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 400;
          let width = img.width; let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
      };
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUpdatingAvatar(true);
      try {
        const compressed = await compressImage(e.target.files[0]);
        await updateUser({ avatar: compressed });
        toast({ title: "Avatar Updated" });
      } catch (error) {
        toast({ title: "Update Failed", variant: "destructive" });
      } finally {
        setIsUpdatingAvatar(false);
      }
    }
  };

  const handleSaveProfile = async () => {
    await updateUser({ name: editForm.name, email: editForm.email, phone: editForm.phone });
    if (currentMember) { 
      await updateMember(currentMember.id, { position: editForm.position }); 
    }
    setIsEditOpen(false);
    toast({ title: "Profile Updated" });
  };

  const handleResetClick = () => {
    const highImpact = resetOptions.includes('members') || resetOptions.includes('facilities');
    if (highImpact) {
      setIsDoubleConfirmOpen(true);
    } else {
      handleFinalReset();
    }
  };

  const handleFinalReset = async () => {
    setIsProcessing(true);
    await resetSquadData(resetOptions);
    setIsResetOpen(false);
    setIsDoubleConfirmOpen(false);
    setIsProcessing(false);
  };

  const handleLogout = async () => {
    try { 
      await signOut(auth); 
      router.push('/login'); 
    } catch (error) { 
      toast({ title: "Logout Failed", variant: "destructive" }); 
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
        <div className="bg-primary/5 h-20 w-full" />
        <CardContent className="-mt-10 space-y-4">
          <div className="flex flex-col items-center space-y-3">
            <div className="relative">
              <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="font-bold">{user.name?.[0] || '?'}</AvatarFallback>
              </Avatar>
              <Button size="icon" variant="secondary" disabled={isUpdatingAvatar} className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md bg-white hover:bg-muted" onClick={() => avatarInputRef.current?.click()}>
                {isUpdatingAvatar ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Camera className="h-4 w-4 text-primary" />}
              </Button>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">{user.name}</h2>
              <div className="flex flex-col items-center gap-1 mt-1">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                  Account Role: {user.role?.replace(/_/g, ' ')}
                </p>
                {activeTeam && (
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">
                    Squad Member: {currentMember?.position || 'Teammate'}
                  </p>
                )}
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{user.email}</p>
              </div>
            </div>
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full px-6 border-primary/20 text-primary hover:bg-primary/5">Edit Profile</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-3xl">
                <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>Full Name</Label><Input className="rounded-xl h-11" value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} /></div>
                  {activeTeam && (
                    <div className="space-y-2">
                      <Label>Team Position</Label>
                      <Select value={editForm.position} onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}>
                        <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select position..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Coach">Coach</SelectItem>
                          <SelectItem value="Team Lead">Team Lead</SelectItem>
                          <SelectItem value="Assistant Coach">Assistant Coach</SelectItem>
                          <SelectItem value="Squad Leader">Squad Leader</SelectItem>
                          <SelectItem value="Player">Player</SelectItem>
                          <SelectItem value="Parent">Parent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2"><Label>Email</Label><Input type="email" className="rounded-xl h-11" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Phone Number</Label><Input className="rounded-xl h-11" value={editForm.phone} onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))} /></div>
                </div>
                <DialogFooter><Button className="w-full rounded-xl h-12 text-base font-bold shadow-lg shadow-primary/20" onClick={handleSaveProfile}>Save Changes</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {isClubManager && (
        <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden bg-black text-white animate-in zoom-in-95 duration-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary/20 p-3 rounded-2xl text-primary ring-1 ring-primary/30"><Building className="h-6 w-6" /></div>
                <div>
                  <Badge className="bg-primary text-white mb-1 h-4 text-[8px] uppercase tracking-[0.2em] font-black">Elite Hub</Badge>
                  <h3 className="text-lg font-black tracking-tight leading-none">Club Management</h3>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">Scale your organization</p>
                </div>
              </div>
              <Button onClick={() => router.push('/club')} className="rounded-full bg-white text-black hover:bg-white/90 h-10 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg">Open Hub <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden ring-1 ring-black/5">
          <CardContent className="p-0">
            <div className="divide-y divide-muted/50">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-2xl text-primary"><Bell className="h-5 w-5" /></div>
                  <div><p className="text-sm font-bold">Push Notifications</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Alerts for posts, events & chats</p></div>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>
              
              {isStaff && (
                <Link href="/how-to" className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2.5 rounded-2xl text-primary"><BookOpen className="h-5 w-5" /></div>
                    <div className="text-left">
                      <p className="text-sm font-bold">How To Guide</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Tactical step-by-step manual</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </Link>
              )}

              {isPro && isStaff && (
                <button onClick={manageSubscription} className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600"><CreditCard className="h-5 w-5" /></div>
                    <div className="text-left">
                      <p className="text-sm font-bold">Manage Subscription</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Billing & plan management</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 transition-all" />
                </button>
              )}
              {isAdmin && (
                <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                  <DialogTrigger asChild>
                    <button className="w-full p-4 flex items-center justify-between hover:bg-red-50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="bg-red-100 p-2.5 rounded-2xl text-red-600"><RotateCcw className="h-5 w-5" /></div>
                        <div className="text-left">
                          <p className="text-sm font-bold">Reset Season</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Wipe matches, tournaments & schedules</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-0 overflow-hidden">
                    <div className="h-2 bg-primary w-full" />
                    <div className="p-8 space-y-6">
                      <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <AlertTriangle className="h-6 w-6 text-primary" />
                          <DialogTitle className="text-2xl font-black uppercase tracking-tight">Season Purge</DialogTitle>
                        </div>
                        <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Select data categories to wipe for the new season.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        {[
                          { id: 'games', label: 'Match Ledger (Win/Loss Records)', icon: Trophy },
                          { id: 'events', label: 'Itinerary (Matches & Practices)', icon: Clock },
                          { id: 'scouting', label: 'Scouting Intel (Opponent Reports)', icon: Target },
                          { id: 'feed', label: 'Squad Feed (Historical Broadcasts)', icon: Activity },
                          { id: 'members', label: 'Squad Roster (Players & Members)', icon: Users },
                          { id: 'facilities', label: 'Facility Data (Venues & Fields)', icon: Building }
                        ].map(opt => (
                          <div key={opt.id} className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer",
                            resetOptions.includes(opt.id) ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/30 border-transparent hover:border-muted"
                          )} onClick={() => setResetOptions(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}>
                            <div className="flex items-center gap-3">
                              <opt.icon className={cn("h-4 w-4", resetOptions.includes(opt.id) ? "text-primary" : "text-muted-foreground opacity-60")} />
                              <span className="text-xs font-black uppercase">{opt.label}</span>
                            </div>
                            <Checkbox checked={resetOptions.includes(opt.id)} onCheckedChange={() => {}} className="rounded-lg h-5 w-5" />
                          </div>
                        ))}
                      </div>
                      <div className="bg-amber-50 p-4 rounded-2xl border-2 border-dashed border-amber-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <Info className="h-3 w-3 text-amber-600" />
                          <p className="text-[9px] font-black uppercase text-amber-700 tracking-widest">Strategic Reminder</p>
                        </div>
                        <p className="text-[10px] font-bold text-amber-800 leading-relaxed italic">
                          Ensure you have exported all Match Ledgers and Scouting Intel as CSV files before proceeding.
                        </p>
                      </div>
                      <DialogFooter>
                        <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleResetClick} disabled={isProcessing || resetOptions.length === 0}>
                          {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit Tactical Reset"}
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <button onClick={() => router.push('/privacy')} className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group"><div className="flex items-center gap-3"><div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600"><Lock className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Privacy & Security</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Manage your account protection</p></div></div><ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" /></button>
              <button onClick={() => router.push('/safety')} className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group"><div className="flex items-center gap-3"><div className="bg-green-100 p-2.5 rounded-2xl text-green-600"><HelpCircle className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Help & Support</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Get assistance or report an issue</p></div></div><ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" /></button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden ring-1 ring-black/5"><CardContent className="p-0"><button onClick={handleLogout} className="w-full p-4 flex items-center justify-between hover:bg-destructive/5 text-destructive transition-colors group"><div className="flex items-center gap-3"><div className="bg-destructive/10 p-2.5 rounded-2xl"><LogOut className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Log Out</p><p className="text-[10px] opacity-70 font-bold uppercase tracking-widest">Sign out of your session</p></div></div></button></CardContent></Card>
      </div>
      <div className="text-center pt-4"><p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-40">The Squad v1.0.0 • Professional Team Hub</p></div>

      <AlertDialog open={isDoubleConfirmOpen} onOpenChange={setIsDoubleConfirmOpen}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogTitle className="text-center text-2xl font-black uppercase">Irreversible Purge</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base font-medium pt-2 text-foreground/80">
              You have selected high-impact data categories (Roster or Facilities). This will permanently delete squad members or organization venue records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel Operation</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalReset} className="rounded-xl font-black bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/20">Purge Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
