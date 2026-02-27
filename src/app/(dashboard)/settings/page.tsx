"use client";

import React, { useState, useEffect } from 'react';
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
  HelpCircle
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
import { useTeam } from '@/components/providers/team-provider';
import { toast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const { user, updateUser, members, activeTeam, updateMember } = useTeam();
  const [notifications, setNotifications] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Form state
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    position: ''
  });

  useEffect(() => {
    setMounted(true);
    if (user) {
      setEditForm(prev => ({
        ...prev,
        name: user.name,
        email: user.email,
        phone: user.phone
      }));
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

  const currentMember = members.find(m => m.id === user.id && m.teamId === activeTeam.id);

  const handleSaveProfile = () => {
    updateUser({
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone
    });
    
    if (currentMember) {
      updateMember(currentMember.id, {
        position: editForm.position
      });
    }

    setIsEditOpen(false);
    toast({
      title: "Profile Updated",
      description: "Your information has been saved successfully.",
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile Section */}
      <Card className="border-none shadow-sm overflow-hidden">
        <div className="bg-primary/5 h-20 w-full" />
        <CardContent className="-mt-10 space-y-4">
          <div className="flex flex-col items-center space-y-3">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src={user.avatar} />
                <AvatarFallback>{user.name[0]}</AvatarFallback>
              </Avatar>
              <Button size="icon" variant="secondary" className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md">
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{currentMember?.position || 'Team Member'}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full px-6">Edit Profile</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Profile</DialogTitle>
                  <DialogDescription>Update your personal information for your team profile.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input 
                      value={editForm.name} 
                      onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position / Role</Label>
                    <Select 
                      value={editForm.position} 
                      onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select position..." />
                      </SelectTrigger>
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
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={editForm.email} 
                      onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input 
                      value={editForm.phone} 
                      onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))} 
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button className="w-full" onClick={handleSaveProfile}>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Menu Options */}
      <div className="space-y-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Push Notifications</p>
                    <p className="text-[10px] text-muted-foreground">Alerts for posts, events & chats</p>
                  </div>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>
              
              <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Privacy & Security</p>
                    <p className="text-[10px] text-muted-foreground">Manage your account protection</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg text-green-600">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Help & Support</p>
                    <p className="text-[10px] text-muted-foreground">Get assistance or report an issue</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="p-0">
            <button className="w-full p-4 flex items-center justify-between hover:bg-destructive/5 text-destructive transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-destructive/10 p-2 rounded-lg">
                  <LogOut className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">Log Out</p>
                  <p className="text-[10px] opacity-70">Sign out of your session</p>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="text-center pt-4">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">SquadForge v1.0.0 (MVP)</p>
      </div>
    </div>
  );
}