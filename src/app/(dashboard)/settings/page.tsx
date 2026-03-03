
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
  BookOpen
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTeam } from '@/components/providers/team-provider';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, updateUser, members, activeTeam, updateMember, manageSubscription, isPro, isClubManager, resetSeasonData } = useTeam();
  const auth = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', password: '', position: '' });

  useEffect(() => {
    setMounted(true);
    if (user) {
      setEditForm(prev => ({ ...prev, name: user.name, email: user.email, phone: user.phone }));
    }
  }, [user]);

  if (!mounted || !activeTeam || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Adjusting settings...</p>
      </div>
    );
  }

  const currentMember = members.find(m => m.userId === user.id && m.teamId === activeTeam.id);
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

  const handleSaveProfile = () => {
    updateUser({ name: editForm.name, email: editForm.email, phone: editForm.phone });
    if (currentMember) { updateMember(currentMember.id, { position: editForm.position }); }
    setIsEditOpen(false);
    toast({ title: "Profile Updated" });
  };

  const handleLogout = async () => {
    try { await signOut(auth); router.push('/login'); } 
    catch (error) { toast({ title: "Logout Failed", variant: "destructive" }); }
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
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg"><AvatarImage src={user.avatar} /><AvatarFallback className="font-bold">{user.name?.[0] || '?'}</AvatarFallback></Avatar>
              <Button size="icon" variant="secondary" disabled={isUpdatingAvatar} className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md bg-white hover:bg-muted" onClick={() => avatarInputRef.current?.click()}>
                {isUpdatingAvatar ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Camera className="h-4 w-4 text-primary" />}
              </Button>
            </div>
            <div className="text-center"><h2 className="text-xl font-bold">{user.name}</h2><p className="text-sm text-muted-foreground font-medium">{currentMember?.position || 'Team Member'}</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">{user.email}</p></div>
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm" className="rounded-full px-6 border-primary/20 text-primary hover:bg-primary/5">Edit Profile</Button></DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-3xl">
                <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>Full Name</Label><Input className="rounded-xl h-11" value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Position / Role</Label><Select value={editForm.position} onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}><SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select position..." /></SelectTrigger><SelectContent><SelectItem value="Coach">Coach</SelectItem><SelectItem value="Team Lead">Team Lead</SelectItem><SelectItem value="Assistant Coach">Assistant Coach</SelectItem><SelectItem value="Squad Leader">Squad Leader</SelectItem><SelectItem value="Player">Player</SelectItem><SelectItem value="Parent">Parent</SelectItem></SelectContent></Select></div>
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
          <CardContent className="p-6"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="bg-primary/20 p-3 rounded-2xl text-primary ring-1 ring-primary/30"><Building className="h-6 w-6" /></div><div><Badge className="bg-primary text-white mb-1 h-4 text-[8px] uppercase tracking-[0.2em] font-black">Elite Hub</Badge><h3 className="text-lg font-black tracking-tight leading-none">Club Management</h3><p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">Scale your organization</p></div></div><Button onClick={() => router.push('/club')} className="rounded-full bg-white text-black hover:bg-white/90 h-10 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg">Open Hub <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></div></CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden ring-1 ring-black/5">
          <CardContent className="p-0">
            <div className="divide-y divide-muted/50">
              <div className="p-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="bg-primary/10 p-2.5 rounded-2xl text-primary"><Bell className="h-5 w-5" /></div><div><p className="text-sm font-bold">Push Notifications</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Alerts for posts, events & chats</p></div></div><Switch checked={notifications} onCheckedChange={setNotifications} /></div>
              
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

              {isPro && (<button onClick={manageSubscription} className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group"><div className="flex items-center gap-3"><div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600"><CreditCard className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Manage Subscription</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Billing & plan management</p></div></div><ExternalLink className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 transition-all" /></button>)}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
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
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
                    <AlertDialogHeader>
                      <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="h-8 w-8 text-red-600" /></div>
                      <AlertDialogTitle className="text-center text-2xl font-black">Purge Season Data?</AlertDialogTitle>
                      <AlertDialogDescription className="text-center text-base font-medium pt-2">This will permanently delete all logged games, tournament brackets, and schedule itineraries for the current year. This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6">
                      <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={resetSeasonData} className="rounded-xl font-black bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/20">Purge & Reset</AccordionAction>
                    </AccordionFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <button onClick={() => router.push('/privacy')} className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group"><div className="flex items-center gap-3"><div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600"><Lock className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Privacy & Security</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Manage your account protection</p></div></div><ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" /></button>
              <button onClick={() => router.push('/safety')} className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group"><div className="flex items-center gap-3"><div className="bg-green-100 p-2.5 rounded-2xl text-green-600"><HelpCircle className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Help & Support</p><p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Get assistance or report an issue</p></div></div><ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" /></button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden ring-1 ring-black/5"><CardContent className="p-0"><button onClick={handleLogout} className="w-full p-4 flex items-center justify-between hover:bg-destructive/5 text-destructive transition-colors group"><div className="flex items-center gap-3"><div className="bg-destructive/10 p-2.5 rounded-2xl"><LogOut className="h-5 w-5" /></div><div className="text-left"><p className="text-sm font-bold">Log Out</p><p className="text-[10px] opacity-70 font-bold uppercase tracking-widest">Sign out of your session</p></div></div></button></CardContent></Card>
      </div>
      <div className="text-center pt-4"><p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-40">The Squad v1.0.0 • Professional Team Hub</p></div>
    </div>
  );
}
