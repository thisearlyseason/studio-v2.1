
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, MoreVertical, ShieldCheck, Mail, Phone, UserPlus, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTeam } from '@/components/providers/team-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

export default function RosterPage() {
  const { activeTeam, members, updateMember, inviteMember } = useTeam();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invitePosition, setInvitePosition] = useState('Player');
  const [mounted, setMounted] = useState(false);
  
  const [editingMember, setEditingMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({ position: '', jersey: '' });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calling the squad...</p>
      </div>
    );
  }

  const teamRoster = members.filter(member => member.teamId === activeTeam.id);
  
  const filteredRoster = teamRoster.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditClick = (member: any) => {
    setEditingMember(member);
    setEditForm({ position: member.position, jersey: member.jersey });
  };

  const handleSaveLabels = () => {
    if (editingMember) {
      updateMember(editingMember.id, {
        position: editForm.position,
        jersey: editForm.jersey
      });
      setEditingMember(null);
    }
  };

  const handleSendInvite = () => {
    if (inviteName.trim()) {
      inviteMember(inviteName, invitePosition);
      setIsInviteOpen(false);
      setInviteName('');
      setInvitePosition('Player');
      toast({
        title: "Invitation Sent",
        description: `We've sent a sign-up link and team code to ${inviteName}.`,
      });
    }
  };

  const copyTeamCode = () => {
    navigator.clipboard.writeText(activeTeam.code);
    toast({ title: "Code Copied", description: "Team code copied to clipboard." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Team Roster</h1>
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full px-5">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite to {activeTeam.name}</DialogTitle>
                <DialogDescription>
                  We'll send an email with the team code and a direct link to join.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="p-4 bg-primary/5 rounded-2xl text-center space-y-2 border border-primary/10 group cursor-pointer" onClick={copyTeamCode}>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Shareable Team Code</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-3xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                    <LinkIcon className="h-4 w-4 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input 
                    placeholder="Teammate Name" 
                    value={inviteName} 
                    onChange={(e) => setInviteName(e.target.value)}
                    className="rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary Role</Label>
                  <Select value={invitePosition} onValueChange={setInvitePosition}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Player">Player</SelectItem>
                      <SelectItem value="Parent">Parent</SelectItem>
                      <SelectItem value="Coach">Coach</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full rounded-xl h-12 text-base font-bold" onClick={handleSendInvite} disabled={!inviteName.trim()}>Send Invitation Email</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search squad by name or role..." 
            className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-black/5 rounded-3xl">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-2xl font-black">{member.name[0]}</AvatarFallback>
                </Avatar>
                {member.role === 'Admin' && (
                  <div className="absolute -top-1 -right-1 bg-primary text-white p-1 rounded-full shadow-lg border-2 border-background">
                    <ShieldCheck className="h-3 w-3" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-extrabold truncate text-base">{member.name}</h3>
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-primary/20 text-primary font-black uppercase tracking-tighter">
                    {member.jersey !== 'PAR' && member.jersey !== 'TBD' ? `#${member.jersey}` : member.jersey}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">{member.position}</p>
                <div className="flex gap-2.5 mt-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary transition-all">
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary transition-all">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl shadow-xl">
                  <DropdownMenuItem onClick={() => handleEditClick(member)} className="font-medium p-2.5">Edit Labels</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive font-medium p-2.5">Remove from Squad</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Member Details</DialogTitle>
            <DialogDescription>Update labels for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Position / Role</Label>
              <Select 
                value={editForm.position} 
                onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}
              >
                <SelectTrigger className="rounded-xl h-11">
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
              <Label>Jersey # or Identifier</Label>
              <Input 
                value={editForm.jersey} 
                onChange={(e) => setEditForm(prev => ({ ...prev, jersey: e.target.value }))}
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveLabels} className="w-full rounded-xl h-11 text-base font-bold">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {filteredRoster.length === 0 && (
        <div className="text-center py-20 bg-muted/10 rounded-3xl border-2 border-dashed">
          <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Search className="h-8 w-8 text-muted-foreground opacity-20" />
          </div>
          <h3 className="font-bold text-lg">No teammates found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search criteria.</p>
        </div>
      )}
    </div>
  );
}
