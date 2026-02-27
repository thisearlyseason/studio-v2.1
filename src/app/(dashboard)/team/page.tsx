
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Mail, 
  Phone, 
  Shield, 
  Camera, 
  Edit3, 
  ExternalLink, 
  Hash, 
  Globe,
  Loader2,
  X,
  Check,
  Star,
  Users,
  ShieldCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useTeam } from '@/components/providers/team-provider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function TeamProfilePage() {
  const { activeTeam, user, members, updateTeamDetails } = useTeam();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isUpdatingLogo, setIsUpdatingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [editForm, setEditForm] = useState({
    name: '',
    sport: '',
    contactEmail: '',
    contactPhone: ''
  });

  useEffect(() => {
    setMounted(true);
    if (activeTeam) {
      setEditForm({
        name: activeTeam.name || '',
        sport: activeTeam.sport || '',
        contactEmail: activeTeam.contactEmail || '',
        contactPhone: activeTeam.contactPhone || ''
      });
    }
  }, [activeTeam]);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Accessing squad data...</p>
      </div>
    );
  }

  // Simplified and robust Admin check
  const isAdmin = activeTeam.role === 'Admin' || (activeTeam.membersMap?.[user?.id || ''] === 'Admin');
  
  // Inclusive filter for leadership roles
  const admins = members.filter(m => 
    m.role === 'Admin' || 
    ['Coach', 'Assistant Coach', 'Squad Leader', 'Team Lead'].includes(m.position)
  ).sort((a, b) => {
    // Sort logic: Coaches first, then the rest
    const rank = (pos: string) => {
      if (pos === 'Coach') return 1;
      if (pos === 'Assistant Coach') return 2;
      if (pos === 'Team Lead' || pos === 'Squad Leader') return 3;
      return 4;
    };
    return rank(a.position) - rank(b.position);
  });

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onerror = (e) => reject(e);
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = (e) => reject(e);
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 600;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
      };
    });
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUpdatingLogo(true);
      try {
        const compressed = await compressImage(e.target.files[0]);
        await updateTeamDetails({ teamLogoUrl: compressed });
        toast({ title: "Logo Updated", description: "Official squad logo synchronized." });
      } catch (error) {
        console.error("Logo update failed", error);
        toast({ title: "Upload Failed", description: "Could not update logo image.", variant: "destructive" });
      } finally {
        setIsUpdatingLogo(false);
      }
    }
  };

  const handleSaveDetails = async () => {
    try {
      await updateTeamDetails(editForm);
      setIsEditOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "Could not save team details.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Profile Section */}
      <section className="relative">
        <div className="h-40 sm:h-56 w-full hero-gradient rounded-[2.5rem] shadow-2xl overflow-hidden relative">
          {activeTeam.heroImageUrl ? (
            <img 
              src={activeTeam.heroImageUrl} 
              alt="Team Cover" 
              className="w-full h-full object-cover opacity-30"
            />
          ) : (
            <div className="absolute inset-0 bg-primary/20" />
          )}
          <div className="absolute inset-0 bg-black/20" />
        </div>
        
        <div className="container px-6 -mt-20 flex flex-col sm:flex-row items-center sm:items-end gap-6 pb-2">
          <div className="relative group">
            <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoChange} />
            <Avatar className="h-40 w-40 border-[6px] border-background shadow-2xl rounded-3xl transition-transform hover:scale-105 duration-300">
              <AvatarImage src={activeTeam.teamLogoUrl} className="object-cover" />
              <AvatarFallback className="hero-gradient text-white text-4xl font-black rounded-3xl">
                {activeTeam.name ? activeTeam.name[0] : 'T'}
              </AvatarFallback>
            </Avatar>
            {isAdmin && (
              <Button 
                size="icon" 
                variant="secondary" 
                className="absolute bottom-2 right-2 h-10 w-10 rounded-2xl shadow-xl bg-white border-none text-primary hover:bg-muted active:scale-90 transition-all"
                onClick={() => logoInputRef.current?.click()}
                disabled={isUpdatingLogo}
              >
                {isUpdatingLogo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </Button>
            )}
          </div>
          
          <div className="flex-1 text-center sm:text-left space-y-2 mb-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <h1 className="text-4xl font-black tracking-tight drop-shadow-sm">{activeTeam.name}</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-6">
                {activeTeam.sport || 'General'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-6 text-sm font-bold text-muted-foreground uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary opacity-40" />
                {activeTeam.code}
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary opacity-40" />
                Public ID: {activeTeam.id.split('_')[1] || activeTeam.id.slice(-6)}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="mb-2">
              <Button 
                onClick={() => setIsEditOpen(true)}
                className="rounded-full px-8 h-12 font-black shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Squad
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Squad Info Card */}
          <Card className="rounded-[2rem] border-none shadow-xl shadow-primary/5 ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/5">
              <CardTitle className="text-xl font-black">Official Squad Identity</CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-primary/60">Core coordination details</CardDescription>
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
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contact Email</Label>
                  <p className="text-sm font-bold px-1 flex items-center gap-2 text-primary">
                    <Mail className="h-4 w-4" />
                    {activeTeam.contactEmail || 'No email registered'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contact Phone</Label>
                  <p className="text-sm font-bold px-1 flex items-center gap-2 text-primary">
                    <Phone className="h-4 w-4" />
                    {activeTeam.contactPhone || 'No phone registered'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Leadership Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Squad Leadership & Staff</h2>
              <Badge variant="outline" className="text-[9px] font-black border-primary/20 text-primary uppercase">{admins.length} STAFF</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {admins.length > 0 ? admins.map((admin) => (
                <Card key={admin.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-md transition-all group overflow-hidden">
                  <CardContent className="p-4 flex items-center gap-4 relative">
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Shield className="h-12 w-12 rotate-12" />
                    </div>
                    <div className="relative">
                      <Avatar className="h-14 w-14 rounded-2xl ring-2 ring-primary/10 border-2 border-background shadow-sm">
                        <AvatarImage src={admin.avatar} className="object-cover" />
                        <AvatarFallback className="rounded-2xl font-black bg-muted">{admin.name ? admin.name[0] : '?'}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 bg-primary text-white p-1 rounded-full shadow-lg border-2 border-background">
                        {admin.position === 'Coach' ? <Star className="h-2 w-2 fill-current" /> : <ShieldCheck className="h-2 w-2" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm truncate tracking-tight">{admin.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary leading-none">
                          {admin.position}
                        </span>
                        {admin.role === 'Admin' && (
                          <span className="h-1 w-1 bg-muted-foreground/30 rounded-full" />
                        )}
                        {admin.role === 'Admin' && (
                          <span className="text-[8px] font-bold text-muted-foreground uppercase">Authority</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-full py-8 text-center bg-muted/20 rounded-3xl border-2 border-dashed">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No leadership roles assigned yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-8">
          {/* Quick Access Card */}
          <Card className="rounded-[2rem] border-none shadow-xl bg-primary text-primary-foreground overflow-hidden">
            <CardContent className="p-8 space-y-6">
              <div className="space-y-1">
                <Trophy className="h-10 w-10 text-white/40 mb-2" />
                <h3 className="text-2xl font-black tracking-tight">Recruit Teammates</h3>
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Growth & Enrollment</p>
              </div>
              <div className="p-6 bg-white/10 rounded-2xl border border-white/10 space-y-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Joining Code</p>
                <p className="text-4xl font-black tracking-[0.2em]">{activeTeam.code}</p>
                <p className="text-[10px] italic text-white/40 pt-2">Share this code with players and parents to join the squad.</p>
              </div>
              <Button 
                variant="secondary" 
                className="w-full h-12 rounded-xl font-black bg-white text-primary hover:bg-white/90"
                onClick={() => {
                  navigator.clipboard.writeText(activeTeam.code);
                  toast({ title: "Copied!", description: "Join code copied to clipboard." });
                }}
              >
                Copy Join Link
              </Button>
            </CardContent>
          </Card>
          
          <div className="bg-muted/30 p-6 rounded-3xl space-y-3 border-2 border-dashed">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="font-black text-xs uppercase tracking-widest">Squad Directory</h4>
            </div>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Squadforge provides a centralized profile for your team to coordinate. Updates to the squad logo and info will be visible to all verified members and staff.
            </p>
          </div>
        </aside>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight">Edit Squad Profile</DialogTitle>
            <DialogDescription className="font-medium">Keep the team's official information up to date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Team Name</Label>
              <Input 
                className="rounded-xl h-12 text-lg font-bold"
                value={editForm.name}
                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Official Sport</Label>
              <Input 
                className="rounded-xl h-12"
                placeholder="e.g. Basketball, Soccer, Travel League"
                value={editForm.sport}
                onChange={e => setEditForm(p => ({ ...p, sport: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contact Email</Label>
                <Input 
                  className="rounded-xl h-12"
                  type="email"
                  value={editForm.contactEmail}
                  onChange={e => setEditForm(p => ({ ...p, contactEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contact Phone</Label>
                <Input 
                  className="rounded-xl h-12"
                  value={editForm.contactPhone}
                  onChange={e => setEditForm(p => ({ ...p, contactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20"
              onClick={handleSaveDetails}
            >
              <Check className="h-5 w-5 mr-2" />
              Save Squad Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
