"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, MoreVertical, ShieldCheck, Mail, Phone, UserPlus, AtSign, Copy, Check, DollarSign, Lock, Sparkles, Users2, CreditCard, ChevronDown, Plus, Trash2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTeam, Member, FeeItem } from '@/components/providers/team-provider';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function RosterPage() {
  const { activeTeam, members, updateMember, inviteMember, user, isPro, isSuperAdmin, purchasePro } = useTeam();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [mounted, setMounted] = useState(false);
  
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState({ position: '', jersey: '', role: 'Member' as 'Admin' | 'Member' });
  const [newFee, setNewFee] = useState({ title: '', amount: '' });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedMember) {
      setEditForm({
        position: selectedMember.position,
        jersey: selectedMember.jersey,
        role: selectedMember.role
      });
    }
  }, [selectedMember]);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calling the squad...</p>
      </div>
    );
  }

  // Unified Admin Check
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl">
            <Users2 className="h-16 w-16 text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 bg-secondary text-white p-2 rounded-full shadow-lg border-2 border-background">
            <Lock className="h-4 w-4" />
          </div>
        </div>
        
        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Roster Management</h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Manage your full roster, assign positions, track jersey numbers, and monitor team fee payments with Pro logic.
          </p>
        </div>

        <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white ring-1 ring-black/5">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-primary tracking-widest">Pro Plan Features</span>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold">Admin Suite</Badge>
            </div>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Advanced Role Assignment</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Fee Tracking Dashboard</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Jersey & Position Control</li>
            </ul>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 hover:bg-primary/90" onClick={purchasePro}>
              Go Pro for $9.99 USD/mo
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const teamRoster = members.filter(member => member.teamId === activeTeam.id);
  
  const filteredRoster = teamRoster.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMemberClick = (member: Member) => {
    setSelectedMember(member);
  };

  const handleAddFee = () => {
    if (!selectedMember || !newFee.title || !newFee.amount) return;
    
    const feeItem: FeeItem = {
      id: 'fee_' + Date.now(),
      title: newFee.title,
      amount: parseFloat(newFee.amount) || 0,
      paid: false,
      createdAt: new Date().toISOString()
    };

    const currentFees = selectedMember.fees || [];
    const updatedFees = [...currentFees, feeItem];
    
    updateMember(selectedMember.id, {
      fees: updatedFees,
      amountOwed: updatedFees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0),
      feesPaid: updatedFees.length > 0 && updatedFees.every(f => f.paid)
    });

    setSelectedMember({ ...selectedMember, fees: updatedFees });
    setNewFee({ title: '', amount: '' });
    toast({ title: "Fee Added", description: `${feeItem.title} added to ledger.` });
  };

  const handleToggleFeePaid = (feeId: string) => {
    if (!selectedMember) return;
    
    const updatedFees = (selectedMember.fees || []).map(f => 
      f.id === feeId ? { ...f, paid: !f.paid } : f
    );

    updateMember(selectedMember.id, {
      fees: updatedFees,
      amountOwed: updatedFees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0),
      feesPaid: updatedFees.length > 0 && updatedFees.every(f => f.paid)
    });

    setSelectedMember({ ...selectedMember, fees: updatedFees });
  };

  const handleRemoveFee = (feeId: string) => {
    if (!selectedMember) return;
    
    const updatedFees = (selectedMember.fees || []).filter(f => f.id !== feeId);

    updateMember(selectedMember.id, {
      fees: updatedFees,
      amountOwed: updatedFees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0),
      feesPaid: updatedFees.length > 0 && updatedFees.every(f => f.paid)
    });

    setSelectedMember({ ...selectedMember, fees: updatedFees });
  };

  const handleSaveDetails = () => {
    if (selectedMember) {
      const adminPositions = ['Coach', 'Team Lead', 'Assistant Coach', 'Squad Leader'];
      const newRole = adminPositions.includes(editForm.position) ? 'Admin' : 'Member';

      updateMember(selectedMember.id, {
        position: editForm.position,
        jersey: editForm.jersey,
        role: newRole
      });
      setSelectedMember(null);
      toast({ title: "Updated", description: "Teammate profile updated." });
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
              <Button size="sm" className="rounded-full px-6 font-black uppercase text-xs h-11 tracking-widest shadow-lg shadow-primary/20">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2.5rem]">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight">Invite to {activeTeam.name}</DialogTitle>
                <DialogDescription className="font-medium">
                  Share your team code to have members join your squad.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="p-8 bg-primary/5 rounded-[2rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={copyTeamCode}>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Official Squad Code</p>
                  <div className="flex items-center justify-center gap-4">
                    <p className="text-5xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                    <Copy className="h-6 w-6 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest pt-2">Tap to copy and share with your team</p>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full rounded-2xl h-14 text-base font-black uppercase tracking-widest" onClick={() => setIsInviteOpen(false)}>Close Invite Menu</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search squad by name or role..." 
            className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredRoster.map((member) => (
          <Card 
            key={member.id} 
            className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-black/5 rounded-3xl cursor-pointer"
            onClick={() => handleMemberClick(member)}
          >
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
                  <h3 className="font-black truncate text-lg tracking-tight">{member.name}</h3>
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-primary/20 text-primary font-black uppercase tracking-tighter">
                    {member.jersey !== 'PAR' && member.jersey !== 'TBD' ? `#${member.jersey}` : member.jersey}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground font-black uppercase tracking-widest">{member.position}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Fees</span>
                  <div className={cn(
                    "h-8 px-3 rounded-lg font-black text-[10px] border flex items-center justify-center transition-all tracking-tighter",
                    member.feesPaid 
                      ? "bg-primary text-white border-primary shadow-sm" 
                      : "bg-secondary text-white border-secondary shadow-sm"
                  )}>
                    {member.feesPaid ? <Check className="h-3 w-3 mr-1" /> : <DollarSign className="h-3 w-3 mr-1" />}
                    {member.feesPaid ? "PAID" : `$${member.amountOwed || 0}`}
                  </div>
                </div>
                <MoreVertical className="h-4 w-4 text-muted-foreground opacity-30" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Member Details & Management Dialog - Desktop Optimized */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-4xl overflow-y-auto max-h-[95vh] border-none shadow-2xl p-0">
          {selectedMember && (
            <div className="flex flex-col">
              <div className="bg-muted/30 p-8 border-b text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                  <Users2 className="h-48 w-48 -rotate-12" />
                </div>
                <div className="relative z-10 flex flex-col items-center space-y-4">
                  <div className="relative">
                    <Avatar className="h-32 w-32 rounded-[2.5rem] border-[6px] border-background shadow-2xl">
                      <AvatarImage src={selectedMember.avatar} />
                      <AvatarFallback className="text-3xl font-black">{selectedMember.name[0]}</AvatarFallback>
                    </Avatar>
                    {selectedMember.role === 'Admin' && (
                      <div className="absolute -top-2 -right-2 bg-primary text-white p-2.5 rounded-full shadow-xl border-4 border-background">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <DialogTitle className="text-4xl font-black tracking-tighter">{selectedMember.name}</DialogTitle>
                    <DialogDescription className="font-black text-primary uppercase tracking-[0.2em] text-xs">
                      {selectedMember.position} • {selectedMember.role}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* Left Column: Financial Ledger */}
                <div className="p-8 border-r">
                  <div className="flex items-center gap-3 px-1 mb-6">
                    <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financial Ledger</p>
                      <p className="text-lg font-black tracking-tight">Total Owed: ${selectedMember.amountOwed || 0}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {isAdmin && (
                      <div className="bg-muted/50 p-5 rounded-3xl space-y-4 border-2 border-dashed">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Add New Charge</p>
                        <div className="flex gap-3">
                          <Input 
                            placeholder="Title" 
                            className="h-12 text-sm font-bold rounded-xl border-2"
                            value={newFee.title}
                            onChange={e => setNewFee(p => ({ ...p, title: e.target.value }))}
                          />
                          <div className="relative w-32">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                              type="number" 
                              placeholder="0.00" 
                              className="h-12 text-sm font-bold pl-9 rounded-xl border-2"
                              value={newFee.amount}
                              onChange={e => setNewFee(p => ({ ...p, amount: e.target.value }))}
                            />
                          </div>
                          <Button size="icon" className="h-12 w-12 shrink-0 rounded-xl shadow-lg shadow-primary/20" onClick={handleAddFee} disabled={!newFee.title || !newFee.amount}>
                            <Plus className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {selectedMember.fees && selectedMember.fees.length > 0 ? selectedMember.fees.map((fee) => (
                        <div key={fee.id} className="flex items-center justify-between p-5 bg-background border-2 rounded-2xl shadow-sm hover:border-primary transition-all group">
                          <div className="flex items-center gap-4">
                            {isAdmin ? (
                              <Checkbox 
                                checked={fee.paid} 
                                onCheckedChange={() => handleToggleFeePaid(fee.id)}
                                className="h-6 w-6 rounded-lg border-2"
                              />
                            ) : (
                              fee.paid ? <Check className="h-6 w-6 text-primary stroke-[3px]" /> : <Circle className="h-6 w-6 text-muted-foreground opacity-20" />
                            )}
                            <div>
                              <p className={cn("text-base font-black tracking-tight", fee.paid && "text-muted-foreground line-through")}>{fee.title}</p>
                              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">${fee.amount}</p>
                            </div>
                          </div>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveFee(fee.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )) : (
                        <div className="text-center py-16 bg-muted/20 rounded-[2rem] border-2 border-dashed">
                          <p className="text-muted-foreground font-black uppercase tracking-widest text-[10px]">No financial history</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Roster Details & Actions */}
                <div className="p-8 space-y-10">
                  {isAdmin && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 px-1">
                        <div className="bg-secondary/10 p-2.5 rounded-xl text-secondary">
                          <Users2 className="h-5 w-5" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Management Controls</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Position / Role</Label>
                          <Select 
                            value={editForm.position} 
                            onValueChange={(v) => setEditForm(prev => ({ ...prev, position: v }))}
                          >
                            <SelectTrigger className="rounded-xl h-12 bg-background border-2 font-bold">
                              <SelectValue placeholder="Select position..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Coach">Coach (Admin)</SelectItem>
                              <SelectItem value="Team Lead">Team Lead (Admin)</SelectItem>
                              <SelectItem value="Assistant Coach">Assistant Coach (Admin)</SelectItem>
                              <SelectItem value="Squad Leader">Squad Leader (Admin)</SelectItem>
                              <SelectItem value="Player">Player (Teammate)</SelectItem>
                              <SelectItem value="Parent">Parent / Guardian</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Jersey #</Label>
                          <Input 
                            value={editForm.jersey} 
                            onChange={(e) => setEditForm(prev => ({ ...prev, jersey: e.target.value }))}
                            className="rounded-xl h-12 bg-background font-black text-xl border-2 text-primary"
                            placeholder="e.g. 23"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                      <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                        <AtSign className="h-5 w-5" />
                      </div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Direct Communication</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Button variant="outline" className="h-16 rounded-2xl border-2 border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest gap-3 shadow-sm hover:bg-primary hover:text-white transition-all">
                        <Mail className="h-5 w-5" /> Message
                      </Button>
                      <Button variant="outline" className="h-16 rounded-2xl border-2 border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest gap-3 shadow-sm hover:bg-primary hover:text-white transition-all">
                        <Phone className="h-5 w-5" /> Direct Call
                      </Button>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="pt-4">
                      <Button onClick={handleSaveDetails} className="w-full px-12 rounded-2xl h-16 text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                        Commit Squad Changes
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {filteredRoster.length === 0 && (
        <div className="text-center py-20 bg-muted/10 rounded-3xl border-2 border-dashed">
          <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm ring-1 ring-black/5">
            <Search className="h-8 w-8 text-muted-foreground opacity-20" />
          </div>
          <h3 className="font-black text-lg uppercase tracking-tight">No teammates found</h3>
          <p className="text-sm text-muted-foreground font-medium">Try adjusting your search criteria.</p>
        </div>
      )}
    </div>
  );
}
