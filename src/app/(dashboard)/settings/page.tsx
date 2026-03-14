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
  Info,
  User,
  Phone,
  AtSign,
  PenTool,
  Save,
  ChevronDown
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
import { Textarea } from '@/components/ui/textarea';

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
  
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', position: '', bio: '' });

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
        position: currentMember?.position || '',
        bio: currentMember?.notes || ''
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
    setIsProcessing(true);
    try {
      await updateUser({ name: editForm.name, email: editForm.email, phone: editForm.phone });
      if (currentMember) { 
        await updateMember(currentMember.id, { position: editForm.position, notes: editForm.bio }); 
      }
      setIsEditOpen(false);
      toast({ title: "Profile Synchronized" });
    } catch (e) {
      toast({ title: "Sync Failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
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
    <div className="space-y-10 pb-20 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Identity Center</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Global Settings</h1>
        </div>
        <Button variant="ghost" onClick={handleLogout} className="text-destructive font-black uppercase text-[10px] tracking-widest gap-2 bg-destructive/5 hover:bg-destructive/10 rounded-xl h-11 px-6 transition-all">
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </div>

      <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
        <div className="bg-black h-32 w-full relative overflow-hidden">
          <div className="absolute inset-0 bg-primary opacity-20" />
          <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none">
            <Zap className="h-48 w-48 text-white" />
          </div>
        </div>
        <CardContent className="-mt-16 space-y-10 p-10 pt-0 relative z-10">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative group">
              <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
              <Avatar className="h-32 w-32 border-[6px] border-background shadow-2xl rounded-[2.5rem] transition-transform duration-500 group-hover:scale-105">
                <AvatarImage src={user.avatar} className="object-cover" />
                <AvatarFallback className="font-black text-2xl bg-muted">{user.name?.[0] || '?'}</AvatarFallback>
              </Avatar>
              <Button size="icon" variant="secondary" disabled={isUpdatingAvatar} className="absolute bottom-1 right-1 h-10 w-10 rounded-2xl shadow-xl bg-white text-primary border-2 border-primary/10 hover:scale-110 active:scale-95 transition-all" onClick={() => avatarInputRef.current?.click()}>
                {isUpdatingAvatar ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </Button>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-4xl font-black tracking-tight uppercase leading-none">{user.name}</h2>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">
                  {user.role?.replace(/_/g, ' ')}
                </Badge>
                {activeTeam && (
                  <Badge variant="outline" className="border-primary/20 text-primary font-black uppercase text-[9px] h-6 px-3">
                    {currentMember?.position || 'Teammate'} • #{currentMember?.jersey || 'HQ'}
                  </Badge>
                )}
              </div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{user.email}</p>
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full h-12 px-10 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all">
                  <Edit3 className="h-4 w-4 mr-2" /> Modify Profile Hub
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 lg:p-12 space-y-10">
                  <DialogHeader>
                    <DialogTitle className="text-3xl font-black uppercase tracking-tight">Identity Architect</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Update global and squad bio details</DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Legal Name</Label>
                        <Input className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white transition-all" value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Position</Label>
                        <Select value={editForm.position} onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="Coach" className="font-bold">Coach</SelectItem>
                            <SelectItem value="Assistant Coach" className="font-bold">Assistant Coach</SelectItem>
                            <SelectItem value="Squad Leader" className="font-bold">Squad Leader</SelectItem>
                            <SelectItem value="Forward" className="font-bold">Forward</SelectItem>
                            <SelectItem value="Midfield" className="font-bold">Midfield</SelectItem>
                            <SelectItem value="Defense" className="font-bold">Defense</SelectItem>
                            <SelectItem value="Keeper" className="font-bold">Goalkeeper</SelectItem>
                            <SelectItem value="Parent" className="font-bold">Guardian</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label>
                        <Input type="email" className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Personal Squad Bio</Label>
                        <Textarea 
                          placeholder="Brief tactical background or season goals..." 
                          className="min-h-[200px] rounded-2xl border-2 font-medium bg-muted/10 focus:bg-white transition-all p-4 resize-none" 
                          value={editForm.bio} 
                          onChange={e => setEditForm(prev => ({ ...prev, bio: e.target.value }))} 
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="pt-4">
                    <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleSaveProfile} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6 mr-3" />}
                      Synchronize Hub Identity
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b p-8 flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Bell className="h-5 w-5" /></div>
              <CardTitle className="text-sm font-black uppercase tracking-widest">Tactical Alerts</CardTitle>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </CardHeader>
          <CardContent className="p-8 space-y-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
              Global system for push notifications covering feed updates, match schedule changes, and real-time coordinator alerts.
            </p>
          </CardContent>
        </Card>

        {isStaff && (
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden group transition-all hover:ring-4 hover:ring-primary/20">
            <CardHeader className="p-8 border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="bg-primary/20 p-2.5 rounded-xl text-primary"><BookOpen className="h-5 w-5" /></div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Operational Manual</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-8 flex items-center justify-between">
              <p className="text-[10px] font-bold text-white/40 uppercase leading-relaxed max-w-[180px]">
                Exhaustive tactical guidance for squad coordinators.
              </p>
              <Button asChild variant="outline" className="rounded-xl border-white/20 bg-white/5 text-white font-black uppercase text-[9px] h-10 px-6 group-hover:bg-primary group-hover:border-none transition-all">
                <Link href="/how-to">Launch Manual <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4 pt-10 border-t">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground px-2">Account Logistics</h3>
        
        {isPro && isStaff && (
          <button onClick={manageSubscription} className="w-full p-6 bg-white rounded-3xl flex items-center justify-between border-2 border-transparent hover:border-primary/20 shadow-sm transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-2xl text-amber-600 group-hover:bg-primary group-hover:text-white transition-colors"><CreditCard className="h-6 w-6" /></div>
              <div className="text-left">
                <p className="font-black text-sm uppercase tracking-tight">Manage Elite Seat</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">Billing & Tier Configuration</p>
              </div>
            </div>
            <ExternalLink className="h-5 w-5 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
        )}

        {isAdmin && (
          <button onClick={() => setIsResetOpen(true)} className="w-full p-6 bg-white rounded-3xl flex items-center justify-between border-2 border-transparent hover:border-red-100 shadow-sm transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-red-100 p-3 rounded-2xl text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors"><RotateCcw className="h-6 w-6" /></div>
              <div className="text-left">
                <p className="font-black text-sm uppercase tracking-tight">Initialize Season Reset</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">Irreversible Data Purge Protocol</p>
              </div>
            </div>
            <AlertTriangle className="h-5 w-5 text-destructive opacity-30 group-hover:opacity-100 transition-all" />
          </button>
        )}
      </div>

      <p className="text-center text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-30 pt-10 pb-20">The Squad Coordination Hub v1.0.0 • Verified Global ID: {user.id.slice(-8)}</p>

      {/* Season Reset Dialog */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
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
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleResetClick} disabled={isProcessing || resetOptions.length === 0}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit Tactical Reset"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

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
