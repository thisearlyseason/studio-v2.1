"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
  LogOut, 
  Camera, 
  ChevronRight,
  Loader2,
  CreditCard,
  ExternalLink,
  Zap,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  User,
  Edit3,
  Save,
  BookOpen,
  LayoutDashboard,
  Users,
  Dumbbell,
  GraduationCap,
  HandHelping,
  PiggyBank,
  MessageCircle,
  FolderClosed,
  EyeOff,
  Download,
  X,
  Smartphone
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
import { useAuth, useStorage } from '@/firebase';
import { signOut, reauthenticateWithCredential, EmailAuthProvider, verifyBeforeUpdateEmail } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { PRICING_CONFIG } from '@/lib/pricing';
import { deleteFCMToken, initFCM } from '@/lib/fcm-client';
import { clearBrowserSession } from '@/lib/client-auth';
import { isStaffPosition } from '@/lib/staff-position';

export default function SettingsPage() {
  const { 
    user, updateUser, members, activeTeam, updateMember, 
    manageSubscription, isPro, resetSquadData, checkCodeUniqueness, 
    updateTeamCode, isStaff, isPlayer, isParent, isPrimaryClubAuthority, db
  } = useTeam();
  const auth = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState(false);
  const [isNotifLoading, setIsNotifLoading] = useState(false);
  const [upcomingEventNotifications, setUpcomingEventNotifications] = useState(false);
  const [isUpcomingEventNotifLoading, setIsUpcomingEventNotifLoading] = useState(false);
  const [isNotificationConsentOpen, setIsNotificationConsentOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isDoubleConfirmOpen, setIsDoubleConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resetOptions, setResetOptions] = useState<string[]>(['games', 'events']);
  const [mounted, setMounted] = useState(false);
  const hasLeagueMembership = Boolean(
    activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).length > 0
  );
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const storage = useStorage();

  // Reauth dialog state (for email changes)
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [isReauthing, setIsReauthing] = useState(false);

  // PWA install state (mirrors Shell.tsx logic)
  const [isStandalone, setIsStandalone] = useState(false);
  const [settingsInstallDismissed, setSettingsInstallDismissed] = useState(false);
  const [settingsDeferredPrompt, setSettingsDeferredPrompt] = useState<any>(null);
  const [settingsIsIOS, setSettingsIsIOS] = useState(false);
  const [showSettingsIOSInstructions, setShowSettingsIOSInstructions] = useState(false);
  const [showSettingsGeneralInstructions, setShowSettingsGeneralInstructions] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Read PWA state from environment
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standaloneMode);
    setSettingsInstallDismissed(localStorage.getItem('pwa_install_dismissed') === 'true');
    const ua = navigator.userAgent.toLowerCase();
    setSettingsIsIOS(/iphone|ipad|ipod/.test(ua));
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setSettingsDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleSettingsInstallClick = async () => {
    if (settingsIsIOS) { setShowSettingsIOSInstructions(true); return; }
    if (!settingsDeferredPrompt) { setShowSettingsGeneralInstructions(true); return; }
    settingsDeferredPrompt.prompt();
    const { outcome } = await settingsDeferredPrompt.userChoice;
    console.log(`[PWA Settings] Install prompt outcome: ${outcome}`);
    setSettingsDeferredPrompt(null);
  };

  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', position: '', bio: '', schoolName: '', institutionTitle: '' });

  useEffect(() => {
    if (user) {
      const currentMember = activeTeam ? members.find(m => m.userId === user.id) : null;
      setEditForm({ 
        name: user.name || '', 
        email: user.email || '', 
        phone: user.phone || '',
        position: currentMember?.position || '',
        bio: currentMember?.notes || '',
        schoolName: user.schoolName || user.clubName || '',
        institutionTitle: user.institutionTitle || (user.plan_type === 'school' ? 'Athletic Director' : ''),
      });
      // Initialize notifications from user preferences
      const permissionGranted =
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted';
      setNotificationPermission(
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'unsupported'
      );
      setNotifications(Boolean((user as any).notificationsEnabled) && permissionGranted);
      setUpcomingEventNotifications(Boolean(user.upcomingEventNotificationsEnabled));
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
  const isDemo = activeTeam?.isDemo || user?.isDemo;
  // Billing is an account-owner/staff workflow. Keep the link visible when a
  // coach role is present on the profile even if team membership is still
  // hydrating or stores the position under a different field.
  const canManageBilling = Boolean(
    isStaff ||
    isPrimaryClubAuthority ||
    isStaffPosition(user.role) ||
    String(user.role || '').trim().toLowerCase() === 'coach'
  );

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUpdatingAvatar(true);
    try {
      // Upload directly to Firebase Storage (avoids Firestore 1MB document limit)
      const avatarRef = ref(storage, `users/${user.id}/avatar.jpg`);
      await uploadBytes(avatarRef, file, { contentType: file.type || 'image/jpeg' });
      const downloadUrl = await getDownloadURL(avatarRef);
      await updateUser({ avatar: downloadUrl });
      toast({ title: 'Avatar Updated', description: 'Profile photo saved.' });
    } catch (error: any) {
      console.error('[Avatar] Upload failed:', error);
      toast({ title: 'Upload Failed', description: error.message || 'Could not upload avatar.', variant: 'destructive' });
    } finally {
      setIsUpdatingAvatar(false);
      // Reset input so the same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    setIsProcessing(true);
    try {
      const emailChanged = editForm.email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

      if (emailChanged && auth.currentUser) {
        // Need to reauthenticate before changing email — open dialog
        setIsReauthOpen(true);
        setIsProcessing(false);
        return;
      }

      // No email change — just save other fields
      await saveProfileFields(false);
    } catch (e) {
      toast({ title: 'Sync Failed', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveProfileFields = async (includeEmailUpdate: boolean) => {
    const updates: any = { name: editForm.name, phone: editForm.phone };
    if (includeEmailUpdate) {
      updates.email = editForm.email.trim().toLowerCase();
    }
    if (isPrimaryClubAuthority) {
      updates.schoolName = editForm.schoolName || undefined;
      updates.institutionTitle = editForm.institutionTitle || undefined;
    }
    await updateUser(updates);
    if (currentMember) {
      // Players cannot self-assign a position at all.
      // Even non-players cannot self-promote to coach/staff roles via this form —
      // those are assigned only by a coach through the roster management page.
      const PROTECTED_POSITIONS = ['Coach', 'Assistant Coach', 'Squad Leader', 'Athletic Director', 'Staff', 'Manager'];
      const positionUpdate: Record<string, any> = { notes: editForm.bio };
      if (!isPlayer) {
        const desiredPosition = editForm.position;
        const isPromotingToStaff = PROTECTED_POSITIONS.includes(desiredPosition);
        // Only allow writing staff positions if they are already staff (i.e. label update, not promotion)
        if (!isPromotingToStaff || isStaff) {
          positionUpdate.position = desiredPosition;
        }
      }
      await updateMember(currentMember.id, positionUpdate);
    }
    setIsEditOpen(false);
    toast({ title: 'Profile Synchronized' });
  };

  const handleReauthAndEmailUpdate = async () => {
    if (!auth.currentUser || !reauthPassword) return;
    setIsReauthing(true);
    try {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        reauthPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await verifyBeforeUpdateEmail(
        auth.currentUser,
        editForm.email.trim().toLowerCase(),
        { url: `${window.location.origin}/login?email_updated=1` },
      );
      await saveProfileFields(false);
      setIsReauthOpen(false);
      setReauthPassword('');
      toast({
        title: 'Verify New Email',
        description: 'Your current email remains active until you approve the link sent to the new address.',
      });
    } catch (err: any) {
      const msg = err.code === 'auth/wrong-password' ? 'Incorrect password.' :
                  err.code === 'auth/email-already-in-use' ? 'This email is already in use.' :
                  err.message || 'Reauthentication failed.';
      toast({ title: 'Email Update Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsReauthing(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Clean up FCM token before signing out (non-blocking — don't let it prevent logout)
      if (user?.id) {
        deleteFCMToken(user.id).catch(() => {});
      }
      await clearBrowserSession();
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      toast({ title: "Logout Failed", variant: "destructive" });
    }
  };

  const enableNotifications = async () => {
    setIsNotifLoading(true);
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        toast({
          title: 'Notifications Unavailable',
          description: 'This browser does not support web notifications. On iPhone or iPad, install The Squad to your Home Screen first.',
          variant: 'destructive',
        });
        return;
      }
      const token = await initFCM(user.id);
      setNotificationPermission(Notification.permission);
      if (!token) {
        const blocked = Notification.permission === 'denied';
        toast({
          title: blocked ? 'Notifications Blocked' : 'Notifications Could Not Be Enabled',
          description: blocked
            ? 'Open this site in your browser settings, allow notifications for The Squad, then try again.'
            : 'The Squad could not register this device. Refresh the page and try again.',
          variant: 'destructive',
        });
        return;
      }
      setNotifications(true);
      await updateUser({ notificationsEnabled: true });
      toast({
        title: 'Notifications Enabled',
        description: 'The Squad can now send alerts to this device.',
      });
    } catch {
      toast({ title: 'Failed to update notifications', variant: 'destructive' });
    } finally {
      setIsNotifLoading(false);
    }
  };

  const handleNotificationsToggle = async (enabled: boolean) => {
    if (enabled) {
      setIsNotificationConsentOpen(true);
      return;
    }

    setIsNotifLoading(true);
    try {
      await deleteFCMToken(user.id);
      setNotifications(false);
      setUpcomingEventNotifications(false);
      await updateUser({
        notificationsEnabled: false,
        upcomingEventNotificationsEnabled: false,
      });
      toast({ title: 'Notifications Disabled' });
    } catch {
      toast({ title: 'Failed to update notifications', variant: 'destructive' });
    } finally {
      setIsNotifLoading(false);
    }
  };

  const handleUpcomingEventNotificationsToggle = async (enabled: boolean) => {
    setIsUpcomingEventNotifLoading(true);
    try {
      setUpcomingEventNotifications(enabled);
      await updateUser({ upcomingEventNotificationsEnabled: enabled });
      toast({
        title: enabled ? 'Game-Day Reminders Enabled' : 'Game-Day Reminders Disabled',
        description: enabled
          ? 'You will receive one same-day reminder for upcoming team events.'
          : 'Upcoming event reminders are now off for your account.',
      });
    } catch {
      toast({ title: 'Failed to update game-day reminders', variant: 'destructive' });
    } finally {
      setIsUpcomingEventNotifLoading(false);
    }
  };



  const handleFinalReset = async () => {
    setIsProcessing(true);
    try {
      await resetSquadData(resetOptions);
      setIsResetOpen(false);
      setIsDoubleConfirmOpen(false);
      
      // RELIABILITY: Clear all local seeding locks before re-initializing
      localStorage.removeItem('squad_seeding_lock');
      localStorage.removeItem('sf_session_team_id');
      
      const demoKey = activeTeam?.isDemo || user?.isDemo ? (user?.role === 'parent' ? 'parent_demo' : (user?.role === 'adult_player' ? 'player_demo' : 'elite')) : 'elite';
      
      toast({ title: "Season Reset Complete", description: "Re-initializing institutional environment..." });
      
      setTimeout(() => {
        window.location.href = `/dashboard?seed_demo=${demoKey}`;
      }, 1500); // Increased delay for persistence settlement
    } catch (e) {
      console.error("Reset Interface Error:", e);
      toast({ title: "Reset Halted", description: "Encountered a tactical error during purge. Retrying initialization...", variant: "destructive" });
      localStorage.removeItem('squad_seeding_lock');
      setTimeout(() => {
        window.location.href = `/dashboard?seed_demo=elite`;
      }, 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  // const lastUpdate = activeTeam?.lastCodeEditedAt ? new Date(activeTeam.lastCodeEditedAt).getTime() : 0;
  // const isLocked = (Date.now() - lastUpdate) < (24 * 60 * 60 * 1000);
  // const hoursLeft = Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - lastUpdate)) / (60 * 60 * 1000)));

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
                  {user.institutionTitle || user.role?.replace(/_/g, ' ')}
                </Badge>
                {/* School/Club name badge — most prominent for institutional authorities */}
                {isPrimaryClubAuthority && (user.schoolName || user.clubName) && (
                  <Badge className="bg-black text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">
                    {user.schoolName || user.clubName}
                  </Badge>
                )}
                {activeTeam && !isPrimaryClubAuthority && (
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
                <DialogTitle className="sr-only">Edit Profile Architect</DialogTitle>
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
                      {/* Squad Position — only visible/editable by staff, not players */}
                      {!isPlayer && (
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Position</Label>
                          <Select value={editForm.position} onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}>
                            <SelectTrigger className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {/* Staff-level options: only available if already a coach/staff role */}
                              {isStaff && (
                                <>
                                  <SelectItem value="Coach" className="font-bold">Coach</SelectItem>
                                  <SelectItem value="Assistant Coach" className="font-bold">Assistant Coach</SelectItem>
                                  <SelectItem value="Squad Leader" className="font-bold">Squad Leader</SelectItem>
                                  <SelectItem value="Athletic Director" className="font-bold">Athletic Director</SelectItem>
                                </>
                              )}
                              {/* Player-facing field positions */}
                              <SelectItem value="Forward" className="font-bold">Forward</SelectItem>
                              <SelectItem value="Midfield" className="font-bold">Midfield</SelectItem>
                              <SelectItem value="Defense" className="font-bold">Defense</SelectItem>
                              <SelectItem value="Keeper" className="font-bold">Goalkeeper</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label>
                        <Input type="email" className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} />
                      </div>
                      {/* Institution fields — visible for school/club authorities */}
                      {isPrimaryClubAuthority && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Institution Name</Label>
                            <Input
                              className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white transition-all"
                              placeholder="e.g. Westfield High School"
                              value={editForm.schoolName}
                              onChange={e => setEditForm(prev => ({ ...prev, schoolName: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Your Title</Label>
                            <Select value={editForm.institutionTitle} onValueChange={v => setEditForm(prev => ({ ...prev, institutionTitle: v }))}>
                              <SelectTrigger className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white"><SelectValue placeholder="Select title..." /></SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="Athletic Director" className="font-bold">Athletic Director</SelectItem>
                                <SelectItem value="Principal" className="font-bold">Principal</SelectItem>
                                <SelectItem value="Vice Principal" className="font-bold">Vice Principal</SelectItem>
                                <SelectItem value="Program Director" className="font-bold">Program Director</SelectItem>
                                <SelectItem value="Head of Sport" className="font-bold">Head of Sport</SelectItem>
                                <SelectItem value="Club President" className="font-bold">Club President</SelectItem>
                                <SelectItem value="General Manager" className="font-bold">General Manager</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
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
            <Switch aria-label="Tactical alerts" checked={notifications} onCheckedChange={handleNotificationsToggle} disabled={isNotifLoading} />
          </CardHeader>
          <CardContent className="p-8 space-y-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
              Global system for push notifications covering feed updates, match schedule changes, and real-time coordinator alerts.
            </p>
            {notificationPermission === 'denied' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                  The Squad notifications are blocked in this browser
                </p>
                <p className="mt-2 text-xs font-medium leading-relaxed text-amber-900/80">
                  Open your browser&apos;s site settings for The Squad, change Notifications to Allow, then return here and turn Tactical Alerts on.
                </p>
              </div>
            )}
            {notificationPermission === 'unsupported' && (
              <div className="rounded-2xl border border-muted bg-muted/30 p-4 text-left">
                <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                  Notifications are unavailable in this browser. On iPhone or iPad, add The Squad to your Home Screen and open the installed app.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {(isParent || isPlayer) && (
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-8 flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-700"><Bell className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-widest">Game-Day Reminders</CardTitle>
                  <CardDescription className="mt-1 text-[10px] font-bold uppercase tracking-wider">
                    Players and parents
                  </CardDescription>
                </div>
              </div>
              <Switch
                aria-label="Game-day reminders"
                checked={notifications && upcomingEventNotifications}
                onCheckedChange={handleUpcomingEventNotificationsToggle}
                disabled={isUpcomingEventNotifLoading || !notifications}
              />
            </CardHeader>
            <CardContent className="p-8 space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
                Receive one same-day alert with the upcoming game, practice, tournament, meeting, or event time and location.
              </p>
              {!notifications && (
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Turn on Tactical Alerts first to enable game-day reminders.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {canManageBilling && (
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b p-8 flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600"><ShieldCheck className="h-5 w-5" /></div>
              <CardTitle className="text-sm font-black uppercase tracking-widest">Subscription Intelligence</CardTitle>
            </div>
            <Badge className={cn("font-black uppercase text-[8px] tracking-widest", user.subscription_status === 'active' ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary")}>
              {user.subscription_status || 'Free'}
            </Badge>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Active Tier</p>
                <p className="text-xl font-black text-primary uppercase italic">
                  {PRICING_CONFIG.find(p => p.id === user.plan_type)?.name || 'Starter Plan'}
                </p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Squad Quota</p>
                <p className="text-xl font-black tracking-tighter">{user.team_limit || 1} Seats</p>
              </div>
            </div>
            {user.extra_teams && user.extra_teams > 0 ? (
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 p-2 rounded-lg text-center">
                Includes {user.extra_teams} Extra Add-on Seats
              </p>
            ) : null}
            <Button asChild variant="outline" className="w-full rounded-2xl border-2 font-black uppercase text-[10px] h-12 hover:bg-black hover:text-white transition-all">
              <Link href="/dashboard/billing">Manage Infrastructure <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
        )}
      </div>

      {canManageBilling && activeTeam && (
        <div className="space-y-4 pt-10 border-t">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground px-2">Module Visibility</h3>
          <p className="text-[10px] text-muted-foreground px-2 mb-4 font-bold uppercase tracking-widest leading-relaxed">
            Toggle which squad modules are visible in the sidebar. Disabled modules are completely hidden and inaccessible to all users in this squad.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: 'feed', name: 'Feed', icon: LayoutDashboard },
              { id: 'roster', name: 'Roster', icon: Users },
              { id: 'practice', name: 'Practice', icon: Dumbbell },
              { id: 'playbook', name: 'Playbook', icon: GraduationCap },
              { id: 'volunteer', name: 'Volunteer', icon: HandHelping },
              { id: 'fundraising', name: 'Fundraising', icon: PiggyBank },
              { id: 'tacticalChat', name: 'Team Chat', icon: MessageCircle },
              { id: 'library', name: 'Library', icon: FolderClosed },
            ].map(module => {
              const Icon = module.icon;
              // features is undefined by default, so we treat undefined as true (enabled)
              const isEnabled = activeTeam.features?.[module.id as keyof typeof activeTeam.features] !== false;
              
              const handleToggle = async (checked: boolean) => {
                if (!db) return;
                try {
                  const teamRef = doc(db, 'teams', activeTeam.id);
                  await updateDoc(teamRef, {
                    [`features.${module.id}`]: checked
                  });
                  toast({ title: 'Module Updated', description: `${module.name} is now ${checked ? 'visible' : 'hidden'}.` });
                } catch (e) {
                  console.error('Failed to update feature', e);
                  toast({ title: 'Error', description: 'Failed to update module visibility.', variant: 'destructive' });
                }
              };

              return (
                <div key={module.id} className={cn(
                  "p-4 rounded-[2rem] border shadow-sm flex items-center justify-between transition-all",
                  isEnabled ? "bg-white" : "bg-muted/50 grayscale-[0.5]"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl", isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {isEnabled ? <Icon className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </div>
                    <span className={cn("text-xs font-black uppercase tracking-widest", !isEnabled && "text-muted-foreground")}>
                      {module.name}
                    </span>
                  </div>
                  <Switch aria-label={`${module.name} visibility`} checked={isEnabled} onCheckedChange={handleToggle} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4 pt-10 border-t">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground px-2">Account Logistics</h3>

        {hasLeagueMembership && (
          <Link href="/teams/join" className="w-full p-6 bg-black text-white rounded-3xl flex items-center justify-between border-2 border-transparent hover:border-primary/40 shadow-sm transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-3 rounded-2xl text-white group-hover:bg-primary transition-colors"><ShieldCheck className="h-6 w-6" /></div>
              <div className="text-left">
                <p className="font-black text-sm uppercase tracking-tight">League Membership</p>
                <p className="text-[10px] text-white/60 font-bold uppercase">Use an invite code to join another league</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </Link>
        )}

        <Link href="/how-to" className="w-full p-6 bg-white rounded-3xl flex items-center justify-between border-2 border-transparent hover:border-primary/20 shadow-sm transition-all group block">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-2xl text-blue-600 group-hover:bg-primary group-hover:text-white transition-colors"><BookOpen className="h-6 w-6" /></div>
            <div className="text-left">
              <p className="font-black text-sm uppercase tracking-tight">Help Guide</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Full How-To Guide — All Modules & Features</p>
            </div>
          </div>
          <ExternalLink className="h-5 w-5 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </Link>
        
        {isPro && !isDemo && (isStaff || isPrimaryClubAuthority) && (
          <button onClick={() => router.push('/dashboard/billing')} className="w-full p-6 bg-white rounded-3xl flex items-center justify-between border-2 border-transparent hover:border-primary/20 shadow-sm transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-amber-100 p-3 rounded-2xl text-amber-600 group-hover:bg-primary group-hover:text-white transition-colors"><CreditCard className="h-6 w-6" /></div>
              <div className="text-left">
                <p className="font-black text-sm uppercase tracking-tight">Manage Subscription</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">Upgrade · Downgrade · Cancel</p>
              </div>
            </div>
            <ExternalLink className="h-5 w-5 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
        )}

        {isDemo && isStaff && (
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

      {/* ── App Installation Card ── */}
      {!isStandalone && (
        <div className="space-y-4 pt-10 border-t">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground px-2">App Installation</h3>
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-8 flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Smartphone className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-widest">Install App</CardTitle>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                    {settingsInstallDismissed ? 'Button hidden from sidebar' : 'Available on your device'}
                  </p>
                </div>
              </div>
              <div className={`text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                settingsInstallDismissed ? 'bg-muted text-muted-foreground' : 'bg-green-100 text-green-700'
              }`}>
                {settingsInstallDismissed ? 'Dismissed' : 'Available'}
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
                Install The Squad Pro as a home screen app for faster access, offline support, and a native app experience.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {settingsInstallDismissed ? (
                  <Button
                    variant="outline"
                    className="flex-1 rounded-2xl border-2 font-black uppercase text-[10px] h-12"
                    onClick={() => {
                      setSettingsInstallDismissed(false);
                      if (typeof window !== 'undefined') localStorage.removeItem('pwa_install_dismissed');
                      toast({ title: 'Install Button Restored', description: 'The Install App button will now appear in the sidebar.' });
                    }}
                  >
                    Restore Sidebar Button
                  </Button>
                ) : null}
                <Button
                  className="flex-1 rounded-2xl font-black uppercase text-[10px] h-12 shadow-lg shadow-primary/20"
                  onClick={handleSettingsInstallClick}
                >
                  <Download className="h-4 w-4 mr-2" /> Install Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-center text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-30 pt-10 pb-20">The Squad Coordination Hub v1.0.0 • Verified Global ID: {user.id.slice(-8)}</p>

      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Season Reset Selection</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="h-6 w-6 text-primary" />
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Season Purge</DialogTitle>
              </div>
              <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Select data categories to wipe for the new season.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {[
                { id: 'games', label: 'Match Ledger' },
                { id: 'events', label: 'Schedule & Itinerary' },
                { id: 'roster', label: 'Roster Clearance' },
                { id: 'complete', label: 'Complete System Wipe' }
              ].map((opt) => (
                <div key={opt.id} className={cn("flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer", resetOptions.includes(opt.id) ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/30 border-transparent hover:border-muted")} onClick={() => setResetOptions(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}>
                  <span className="text-xs font-black uppercase">{opt.label}</span>
                  <Checkbox checked={resetOptions.includes(opt.id)} onCheckedChange={() => {}} />
                </div>
              ))}
              {resetOptions.includes('complete') && (
                <div className="bg-red-50 p-4 rounded-2xl flex items-start gap-3 border border-red-100 mt-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-1" />
                  <p className="text-[9px] font-black text-red-700 uppercase leading-relaxed">
                    CRITICAL: A Complete Wipe will delete ALL data including rosters, matches, incidents, and equipment logs. This is irreversible.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={() => setIsDoubleConfirmOpen(true)} disabled={isProcessing || resetOptions.length === 0}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit Tactical Reset"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDoubleConfirmOpen} onOpenChange={setIsDoubleConfirmOpen}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-2xl font-black uppercase">Irreversible Purge</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base font-medium pt-2 text-foreground/80">
              This will permanently delete squad data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalReset} className="rounded-xl font-black bg-red-600 hover:bg-red-700">Purge Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isNotificationConsentOpen} onOpenChange={setIsNotificationConsentOpen}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bell className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="text-center text-2xl font-black tracking-tight">
              The Squad wants to send you notifications
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-center text-sm font-medium leading-relaxed text-foreground/70">
              Get team updates, schedule changes, game-day reminders, and coordinator alerts on this device. You can turn them off anytime in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 sm:justify-center">
            <AlertDialogCancel className="rounded-full border-2 px-7 font-black">
              Not Now
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full px-7 font-black"
              onClick={() => void enableNotifications()}
            >
              Allow Notifications
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Reauthentication Dialog */}
      <AlertDialog open={isReauthOpen} onOpenChange={setIsReauthOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase text-sm tracking-widest">Confirm Identity</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-bold text-muted-foreground">
              Changing your email requires your current password for security.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-black uppercase tracking-widest">Current Password</Label>
            <Input
              type="password"
              placeholder="Enter your password"
              value={reauthPassword}
              onChange={e => setReauthPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReauthAndEmailUpdate()}
              className="h-11 rounded-xl"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsReauthOpen(false); setReauthPassword(''); }} className="rounded-full font-black uppercase text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReauthAndEmailUpdate}
              disabled={!reauthPassword || isReauthing}
              className="rounded-full font-black uppercase text-xs bg-primary hover:bg-primary/90"
            >
              {isReauthing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Verifying...</> : 'Confirm & Update Email'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
