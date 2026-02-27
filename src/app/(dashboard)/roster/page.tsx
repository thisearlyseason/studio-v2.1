
"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, MoreVertical, ShieldCheck, Mail, Phone, UserPlus } from 'lucide-react';
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

export default function RosterPage() {
  const { activeTeam, members, updateMember, inviteMember } = useTeam();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invitePosition, setInvitePosition] = useState('Player');
  
  const [editingMember, setEditingMember] = useState<any>(null);
  const [editForm, setEditForm] = useState({ position: '', jersey: '' });

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
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Team Roster</h1>
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite to {activeTeam.name}</DialogTitle>
                <DialogDescription>
                  Add a new member and select their primary role.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted rounded-xl text-center space-y-1">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Your Team Code</p>
                  <p className="text-3xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input 
                    placeholder="Teammate Name" 
                    value={inviteName} 
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role Selection</Label>
                  <Select value={invitePosition} onValueChange={setInvitePosition}>
                    <SelectTrigger>
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
                <Button className="w-full" onClick={handleSendInvite} disabled={!inviteName.trim()}>Send Invitation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or position..." 
            className="pl-9 bg-muted/50 border-none rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-sm">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-2xl">{member.name[0]}</AvatarFallback>
                </Avatar>
                {member.role === 'Admin' && (
                  <div className="absolute -top-1 -right-1 bg-primary text-white p-1 rounded-full shadow-lg border-2 border-background">
                    <ShieldCheck className="h-3 w-3" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-bold truncate">{member.name}</h3>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-primary/20 text-primary font-bold">
                    {member.jersey !== 'PAR' && member.jersey !== 'TBD' ? `#${member.jersey}` : member.jersey}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium">{member.position}</p>
                <div className="flex gap-3 mt-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-muted/50 hover:bg-primary/10 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditClick(member)}>Edit Labels</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Remove from Team</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Member Dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent>
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
              <Label>Jersey #</Label>
              <Input 
                value={editForm.jersey} 
                onChange={(e) => setEditForm(prev => ({ ...prev, jersey: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveLabels}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {filteredRoster.length === 0 && (
        <div className="text-center py-20">
          <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="h-8 w-8 text-muted-foreground opacity-20" />
          </div>
          <h3 className="font-bold text-lg">No members found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search criteria.</p>
        </div>
      )}
    </div>
  );
}
