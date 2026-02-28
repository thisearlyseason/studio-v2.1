
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  MoreVertical, 
  ShieldCheck, 
  Mail, 
  Phone, 
  UserPlus, 
  AtSign, 
  Copy, 
  Check, 
  DollarSign, 
  Lock, 
  Sparkles, 
  Users2, 
  CreditCard, 
  Plus, 
  Trash2, 
  Circle,
  Heart,
  Baby,
  Stethoscope,
  BookOpen,
  Edit3,
  Eye,
  XCircle,
  Clock,
  MessageSquare
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
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
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, differenceInYears } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';

export default function RosterPage() {
  const { activeTeam, members, updateMember, user, isPro, isSuperAdmin, purchasePro, hasFeature } = useTeam();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Member>>({});
  const [newFee, setNewFee] = useState({ title: '', amount: '' });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedMember) {
      setEditForm({
        name: selectedMember.name,
        position: selectedMember.position,
        jersey: selectedMember.jersey,
        role: selectedMember.role,
        phone: selectedMember.phone || '',
        birthdate: selectedMember.birthdate || '',
        parentName: selectedMember.parentName || '',
        parentEmail: selectedMember.parentEmail || '',
        parentPhone: selectedMember.parentPhone || '',
        emergencyContactName: selectedMember.emergencyContactName || '',
        emergencyContactPhone: selectedMember.emergencyContactPhone || '',
        notes: selectedMember.notes || ''
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

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canEditDetails = hasFeature('full_roster_details');

  const teamRoster = members.filter(member => member.teamId === activeTeam.id);
  
  const filteredRoster = teamRoster.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMemberClick = (member: Member) => {
    setSelectedMember(member);
    setIsEditing(false);
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
      const newRole = adminPositions.includes(editForm.position || '') ? 'Admin' : 'Member';

      const updates = {
        ...editForm,
        role: newRole
      };

      updateMember(selectedMember.id, updates);
      setSelectedMember({ ...selectedMember, ...updates, role: newRole });
      setIsEditing(false);
      toast({ title: "Updated", description: "Teammate profile updated." });
    }
  };

  const copyTeamCode = () => {
    navigator.clipboard.writeText(activeTeam.code);
    toast({ title: "Code Copied", description: "Team code copied to clipboard." });
  };

  const calculateAge = (dob?: string) => {
    if (!dob) return null;
    try {
      return differenceInYears(new Date(), new Date(dob));
    } catch { return null; }
  };

  // Club Manager Protection Logic
  const isProtectedManager = (memberUserId: string) => {
    return memberUserId === activeTeam?.createdBy;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tight">Team Roster</h1>
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full px-6 font-black uppercase text-xs h-11 tracking-widest shadow-lg shadow-primary/20">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
              <DialogTitle className="sr-only">Invite Team Members</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 space-y-6">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black tracking-tight">Invite to {activeTeam.name}</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Official Recruitment</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="p-8 bg-primary/5 rounded-[2.5rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={copyTeamCode}>
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Official Squad Code</p>
                    <div className="flex items-center justify-center gap-4">
                      <p className="text-5xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                      <Copy className="h-6 w-6 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest pt-2">Tap to copy and share with your team</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button className="w-full rounded-2xl h-14 text-base font-black uppercase tracking-widest" onClick={() => setIsInviteOpen(false)}>Dismiss Menu</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search squad by name or role..." 
            className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner font-black"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredRoster.map((member) => (
          <Card 
            key={member.id} 
            className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-black/5 rounded-3xl cursor-pointer group"
            onClick={() => handleMemberClick(member)}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-2xl font-black bg-muted text-xs">{member.name[0]}</AvatarFallback>
                </Avatar>
                {member.role === 'Admin' && (
                  <div className="absolute -top-1 -right-1 bg-primary text-white p-1 rounded-full shadow-lg border-2 border-background">
                    <ShieldCheck className="h-3 w-3" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-black truncate text-lg tracking-tight group-hover:text-primary transition-colors">{member.name}</h3>
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 border-primary/20 text-primary font-black uppercase tracking-tighter">
                    {member.jersey !== 'PAR' && member.jersey !== 'TBD' ? `#${member.jersey}` : member.jersey}
                  </Badge>
                  {isProtectedManager(member.userId) && (
                    <Badge className="bg-black text-white border-none text-[7px] h-3.5 font-black uppercase px-1 shadow-sm">Manager</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-black uppercase tracking-widest">{member.position}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Fees</span>
                  <div className={cn(
                    "h-8 px-3 rounded-lg font-black text-[10px] border flex items-center justify-center transition-all tracking-tighter shadow-sm",
                    member.feesPaid 
                      ? "bg-primary text-white border-primary" 
                      : "bg-black text-white border-black"
                  )}>
                    {member.feesPaid ? <Check className="h-3 w-3 mr-1" /> : <DollarSign className="h-3 w-3 mr-1" />}
                    {member.feesPaid ? "PAID" : `$${member.amountOwed || 0}`}
                  </div>
                </div>
                <MoreVertical className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Member Details Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="rounded-[3rem] sm:max-w-5xl overflow-hidden max-h-[90vh] border-none shadow-2xl p-0 flex flex-col">
          <DialogTitle className="sr-only">Member Profile: {selectedMember?.name}</DialogTitle>
          <DialogDescription className="sr-only">Detailed contact and management information for {selectedMember?.name}</DialogDescription>
          
          {selectedMember && (
            <>
              {/* Header */}
              <div className="bg-muted/30 p-6 sm:p-10 border-b flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                  <Users2 className="h-48 w-48 -rotate-12" />
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10 text-center sm:text-left w-full sm:w-auto">
                  <Avatar className="h-24 w-24 sm:h-28 sm:w-28 rounded-[2rem] border-4 border-background shadow-xl">
                    <AvatarImage src={selectedMember.avatar} />
                    <AvatarFallback className="text-2xl font-black bg-muted">{selectedMember.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tighter leading-none">{selectedMember.name}</h2>
                      {selectedMember.role === 'Admin' && <Badge className="bg-primary text-white border-none font-black text-[10px] h-5 uppercase tracking-widest px-3">Leadership</Badge>}
                      {isProtectedManager(selectedMember.userId) && <Badge className="bg-black text-white border-none font-black text-[10px] h-5 uppercase tracking-widest px-3">Primary Manager</Badge>}
                    </div>
                    <p className="font-black text-primary uppercase tracking-[0.2em] text-xs sm:text-sm">
                      {selectedMember.position} • {selectedMember.jersey !== 'PAR' ? `#${selectedMember.jersey}` : 'Staff'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3 relative z-10 w-full sm:w-auto justify-center">
                    <Button 
                      variant={isEditing ? "default" : "outline"} 
                      size="sm" 
                      className={cn("rounded-full h-12 sm:h-10 px-8 sm:px-6 font-black uppercase text-[10px] tracking-widest transition-all shadow-lg", isEditing && "bg-black hover:bg-black/90")}
                      onClick={() => {
                        if (canEditDetails) {
                          setIsEditing(!isEditing);
                        } else {
                          purchasePro();
                        }
                      }}
                    >
                      {isEditing ? <><Eye className="h-3.5 w-3.5 mr-2" /> View Mode</> : (
                        <>
                          <Edit3 className="h-3.5 w-3.5 mr-2" /> 
                          Edit Member
                          {!canEditDetails && <Lock className="ml-2 h-3 w-3 opacity-40" />}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
                  
                  {/* LEFT: Financials & Status */}
                  <div className="lg:col-span-4 p-8 border-r bg-muted/5 space-y-8">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 px-1">
                        <div className="bg-primary/10 p-2 rounded-xl text-primary"><CreditCard className="h-4 w-4" /></div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financial Ledger</p>
                      </div>
                      
                      <div className="bg-white p-6 rounded-[2rem] shadow-sm border ring-1 ring-black/5 space-y-4">
                        <div className="flex justify-between items-end">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount Owed</p>
                          <p className="text-3xl font-black text-primary leading-none">${selectedMember.amountOwed || 0}</p>
                        </div>
                        {isAdmin && (
                          <div className="pt-2 flex flex-col gap-2">
                            <div className="flex gap-2">
                              <Input placeholder="Title" value={newFee.title} onChange={e => setNewFee(p => ({ ...p, title: e.target.value }))} className="h-10 text-xs rounded-xl font-bold" />
                              <div className="relative w-24 shrink-0">
                                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input type="number" placeholder="0" value={newFee.amount} onChange={e => setNewFee(p => ({ ...p, amount: e.target.value }))} className="h-10 text-xs pl-8 rounded-xl font-bold" />
                              </div>
                            </div>
                            <Button className="w-full h-10 rounded-xl" onClick={handleAddFee} disabled={!newFee.title || !newFee.amount}><Plus className="h-4 w-4 mr-2" /> Record Fee</Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedMember.fees?.length ? selectedMember.fees.map((fee) => (
                          <div key={fee.id} className="flex items-center justify-between p-4 bg-white border rounded-2xl hover:border-primary transition-all group shadow-sm">
                            <div className="flex items-center gap-3">
                              {isAdmin ? <Checkbox checked={fee.paid} onCheckedChange={() => handleToggleFeePaid(fee.id)} className="h-5 w-5 rounded-lg" /> : (fee.paid ? <Check className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground/20" />)}
                              <div>
                                <p className={cn("text-xs font-black", fee.paid && "text-muted-foreground line-through")}>{fee.title}</p>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase">${fee.amount}</p>
                              </div>
                            </div>
                            {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveFee(fee.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                          </div>
                        )) : (
                          <div className="text-center py-10 bg-white/50 rounded-2xl border border-dashed"><p className="text-[9px] font-black uppercase text-muted-foreground opacity-40 tracking-widest">No transaction history</p></div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3 px-1">
                        <div className="bg-black/10 p-2 rounded-xl text-black"><Heart className="h-4 w-4" /></div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Member Status</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
                          <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Joined</p>
                          <p className="text-[10px] font-black">{selectedMember.joinedAt ? format(new Date(selectedMember.joinedAt), 'MMM yyyy') : 'TBD'}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
                          <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Access</p>
                          <p className="text-[10px] font-black">{selectedMember.role}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Detailed Info */}
                  <div className="lg:col-span-8 p-8 space-y-10">
                    {isEditing ? (
                      <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Official Name</Label>
                            <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="h-12 rounded-xl font-bold bg-muted/20 border-2" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Position / Role</Label>
                            <Select value={editForm.position} onValueChange={v => setEditForm(p => ({ ...p, position: v }))}>
                              <SelectTrigger className="h-12 rounded-xl font-bold bg-muted/20 border-2"><SelectValue /></SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="Coach">Coach</SelectItem>
                                <SelectItem value="Team Lead">Team Lead</SelectItem>
                                <SelectItem value="Assistant Coach">Assistant Coach</SelectItem>
                                <SelectItem value="Squad Leader">Squad Leader</SelectItem>
                                <SelectItem value="Player">Player</SelectItem>
                                <SelectItem value="Parent">Parent / Guardian</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Jersey Number</Label>
                            <Input value={editForm.jersey} onChange={e => setEditForm(p => ({ ...p, jersey: e.target.value }))} className="h-12 rounded-xl font-black text-xl text-primary bg-muted/20 border-2" placeholder="e.g. 23" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Cell Phone</Label>
                            <Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className="h-12 rounded-xl font-bold bg-muted/20 border-2" placeholder="(555) 000-0000" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date of Birth</Label>
                            <Input type="date" value={editForm.birthdate} onChange={e => setEditForm(p => ({ ...p, birthdate: e.target.value }))} className="h-12 rounded-xl font-bold bg-muted/20 border-2" />
                          </div>
                        </div>

                        <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 p-2 rounded-xl text-primary"><Baby className="h-4 w-4" /></div>
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Emergency & Parent Contact</h4>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Primary Guardian Name</Label>
                              <Input value={editForm.parentName} onChange={e => setEditForm(p => ({ ...p, parentName: e.target.value }))} className="h-11 rounded-xl bg-white" placeholder="Name" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Guardian Phone</Label>
                              <Input value={editForm.parentPhone} onChange={e => setEditForm(p => ({ ...p, parentPhone: e.target.value }))} className="h-11 rounded-xl bg-white" placeholder="(555) 000-0000" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Emergency Contact Name</Label>
                              <Input value={editForm.emergencyContactName} onChange={e => setEditForm(p => ({ ...p, emergencyContactName: e.target.value }))} className="h-11 rounded-xl bg-white" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Emergency Contact Phone</Label>
                              <Input value={editForm.emergencyContactPhone} onChange={e => setEditForm(p => ({ ...p, emergencyContactPhone: e.target.value }))} className="h-11 rounded-xl bg-white" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Coaching Notes & Medical Info</Label>
                          <Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} className="min-h-[120px] rounded-3xl bg-muted/10 border-2 font-medium" placeholder="Allergies, tactical notes, special requirements..." />
                        </div>

                        <Button onClick={handleSaveDetails} className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                          Save Member Changes
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-10 animate-in fade-in slide-in-from-left-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                          <div className="space-y-6">
                            <div className="flex items-center gap-3 px-1">
                              <div className="bg-black/10 p-2 rounded-xl text-black"><AtSign className="h-4 w-4" /></div>
                              <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Personal Details</h4>
                            </div>
                            <div className="space-y-4">
                              <div className="bg-muted/30 p-5 rounded-2xl">
                                <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Age / Birthday</p>
                                <p className="text-sm font-black flex items-center gap-2">
                                  {selectedMember.birthdate ? format(new Date(selectedMember.birthdate), 'MMMM d, yyyy') : 'No DOB recorded'}
                                  {calculateAge(selectedMember.birthdate) && <Badge variant="secondary" className="bg-primary/10 text-primary border-none h-5 px-2 text-[9px] font-black uppercase tracking-widest">{calculateAge(selectedMember.birthdate)} yrs</Badge>}
                                </p>
                              </div>
                              <div className="bg-muted/30 p-5 rounded-2xl">
                                <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Team Role</p>
                                <p className="text-sm font-black uppercase">{selectedMember.position} • {selectedMember.role}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div className="flex items-center gap-3 px-1">
                              <div className="bg-black/10 p-2 rounded-xl text-black"><MessageSquare className="h-4 w-4" /></div>
                              <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Contact & Support</h4>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                              {isMobile ? (
                                <>
                                  <a 
                                    href={selectedMember.phone ? `sms:${selectedMember.phone}` : '#'}
                                    className={cn(
                                      buttonVariants({ variant: "outline" }),
                                      "h-14 rounded-2xl border-2 border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest gap-3 shadow-sm hover:bg-primary hover:text-white transition-all w-full",
                                      !selectedMember.phone && "opacity-50 pointer-events-none"
                                    )}
                                  >
                                    <MessageSquare className="h-4 w-4" /> Message Direct
                                  </a>
                                  <a 
                                    href={selectedMember.phone ? `tel:${selectedMember.phone}` : '#'}
                                    className={cn(
                                      buttonVariants({ variant: "default" }),
                                      "h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest gap-3 shadow-xl shadow-primary/20 active:scale-95 transition-all w-full",
                                      !selectedMember.phone && "opacity-50 pointer-events-none"
                                    )}
                                  >
                                    <Phone className="h-4 w-4" /> Call Member
                                  </a>
                                </>
                              ) : (
                                <div className="bg-muted/30 p-5 rounded-2xl">
                                  <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Cell Phone</p>
                                  <p className="text-sm font-black">{selectedMember.phone || 'No phone recorded'}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {canEditDetails ? (
                          <>
                            {(selectedMember.parentName || selectedMember.emergencyContactName) && (
                              <div className="space-y-6">
                                <div className="flex items-center gap-3 px-1">
                                  <div className="bg-primary/10 p-2 rounded-xl text-primary"><Baby className="h-4 w-4" /></div>
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Emergency Network</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {selectedMember.parentName && (
                                    <div className="bg-primary/5 p-6 rounded-[2rem] border-2 border-primary/10 space-y-3">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="text-[8px] font-black uppercase text-primary/60 mb-1">Primary Guardian</p>
                                          <p className="text-base font-black tracking-tight">{selectedMember.parentName}</p>
                                        </div>
                                        <Badge className="bg-primary text-white border-none text-[8px] h-4 uppercase tracking-widest font-black">Parent</Badge>
                                      </div>
                                      <div className="flex items-center gap-4 pt-2">
                                        <a 
                                          href={selectedMember.parentPhone ? `tel:${selectedMember.parentPhone}` : '#'}
                                          className={cn(
                                            buttonVariants({ variant: "ghost", size: "icon" }),
                                            "h-9 w-9 rounded-xl bg-white shadow-sm border text-primary",
                                            !selectedMember.parentPhone && "opacity-50 pointer-events-none"
                                          )}
                                        >
                                          <Phone className="h-4 w-4" />
                                        </a>
                                        <a 
                                          href={selectedMember.parentPhone ? `sms:${selectedMember.parentPhone}` : '#'}
                                          className={cn(
                                            buttonVariants({ variant: "ghost", size: "icon" }),
                                            "h-9 w-9 rounded-xl bg-white shadow-sm border text-primary",
                                            !selectedMember.parentPhone && "opacity-50 pointer-events-none"
                                          )}
                                        >
                                          <MessageSquare className="h-4 w-4" />
                                        </a>
                                        <span className="text-[10px] font-bold text-muted-foreground font-mono">{selectedMember.parentPhone || 'No number'}</span>
                                      </div>
                                    </div>
                                  )}
                                  {selectedMember.emergencyContactName && (
                                    <div className="bg-black/5 p-6 rounded-[2rem] border-2 border-black/10 space-y-3">
                                      <div>
                                        <p className="text-[8px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Emergency Contact</p>
                                        <p className="text-base font-black tracking-tight">{selectedMember.emergencyContactName}</p>
                                      </div>
                                      <div className="flex items-center gap-4 pt-2">
                                        <a 
                                          href={selectedMember.emergencyContactPhone ? `tel:${selectedMember.emergencyContactPhone}` : '#'}
                                          className={cn(
                                            buttonVariants({ variant: "ghost", size: "icon" }),
                                            "h-9 w-9 rounded-xl bg-white shadow-sm border text-black",
                                            !selectedMember.emergencyContactPhone && "opacity-50 pointer-events-none"
                                          )}
                                        >
                                          <Phone className="h-4 w-4" />
                                        </a>
                                        <span className="text-[10px] font-bold text-muted-foreground font-mono">{selectedMember.emergencyContactPhone || 'No number'}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {selectedMember.notes && (
                              <div className="space-y-4">
                                <div className="flex items-center gap-3 px-1">
                                  <div className="bg-black/10 p-2 rounded-xl text-black"><BookOpen className="h-4 w-4" /></div>
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Coaching Notes</h4>
                                </div>
                                <div className="p-6 bg-muted/20 rounded-[2rem] border-2 border-dashed">
                                  <p className="text-sm font-medium leading-relaxed italic text-foreground/80">"{selectedMember.notes}"</p>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-primary/5 p-10 rounded-[3rem] border-2 border-dashed border-primary/20 text-center space-y-6">
                            <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-xl relative">
                              <Lock className="h-8 w-8 text-primary" />
                              <Sparkles className="absolute -top-2 -right-2 h-5 w-5 text-amber-500" />
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-xl font-black tracking-tight">Full Roster Logic</h4>
                              <p className="text-sm text-muted-foreground font-bold leading-relaxed max-w-xs mx-auto">
                                Upgrade to a Pro plan to track emergency contacts, guardian details, and private coaching notes for your entire squad.
                              </p>
                            </div>
                            <Button className="h-12 rounded-xl px-10 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20" onClick={purchasePro}>
                              Go Pro
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-muted/10 border-t flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  {isProtectedManager(selectedMember.userId) && (
                    <div className="flex items-center gap-2 text-muted-foreground opacity-50 px-2">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="text-[9px] font-black uppercase tracking-widest leading-none">Protected Club Manager Profile</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  {isAdmin && !isProtectedManager(selectedMember.userId) && (
                    <Button variant="ghost" className="h-12 px-6 rounded-xl text-destructive hover:bg-destructive/10 font-black uppercase text-[10px] tracking-widest">
                      <Trash2 className="h-4 w-4 mr-2" /> Remove Teammate
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedMember(null)} className="h-12 px-8 rounded-xl font-black uppercase text-[10px] tracking-widest border-2">Close Profile</Button>
                </div>
              </div>
            </>
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
