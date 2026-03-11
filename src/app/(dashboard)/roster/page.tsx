
"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
  MessageSquare,
  Loader2,
  FileCheck,
  Truck,
  HeartPulse,
  Camera as CameraIcon,
  Cake,
  Users,
  ChevronDown,
  ShieldAlert,
  ClipboardList
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
import { useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function RosterPage() {
  const { activeTeam, updateMember, user, isPro, isSuperAdmin, purchasePro, hasFeature, members, isMembersLoading, isStaff, updateStaffEvaluation, getStaffEvaluation } = useTeam();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Member>>({});
  const [newFee, setNewFee] = useState({ title: '', amount: '' });
  
  const [staffNote, setStaffNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

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
        notes: selectedMember.notes || '',
        waiverSigned: !!selectedMember.waiverSigned,
        transportationWaiverSigned: !!selectedMember.transportationWaiverSigned,
        medicalClearance: !!selectedMember.medicalClearance,
        mediaRelease: !!selectedMember.mediaRelease,
      });

      // Load private staff evaluation if staff
      if (isStaff) {
        getStaffEvaluation(selectedMember.id).then(setStaffNote);
      }
    }
  }, [selectedMember, isStaff, getStaffEvaluation]);

  if (!mounted || !activeTeam || isMembersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calling the squad...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canEditDetails = hasFeature('full_roster_details');

  const filteredRoster = members.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMemberClick = (member: Member) => {
    if (!isStaff) return;
    setSelectedMember(member);
    setIsEditing(false);
  };

  const handleSaveNote = async () => {
    if (!selectedMember) return;
    setIsSavingNote(true);
    await updateStaffEvaluation(selectedMember.id, staffNote);
    setIsSavingNote(false);
    toast({ title: "Evaluation Synchronized", description: "Private note secured in the vault." });
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

  const isProtectedManager = (memberUserId: string) => {
    return memberUserId === activeTeam?.createdBy;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Team Roster</h1>
          <div className="flex gap-2">
            {isStaff && (
              <Select onValueChange={(val) => {
                const member = members.find(m => m.id === val);
                if (member) handleMemberClick(member);
              }}>
                <SelectTrigger className="h-10 lg:h-11 rounded-full border-2 bg-background font-black text-[10px] lg:text-xs uppercase tracking-widest w-[160px] lg:w-[200px] shadow-sm">
                  <Users className="h-3.5 w-3.5 mr-2 text-primary" />
                  <SelectValue placeholder="Quick Jump" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl p-2">
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id} className="rounded-xl p-3 font-bold text-xs uppercase tracking-tight">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full px-4 lg:px-6 font-black uppercase text-[10px] lg:text-xs h-10 lg:h-11 tracking-widest shadow-lg shadow-primary/20">
                  <UserPlus className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-2" />
                  Invite
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-3xl lg:rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                <DialogTitle className="sr-only">Invite Team Members</DialogTitle>
                <div className="h-2 bg-primary w-full" />
                <div className="p-6 lg:p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-xl lg:text-2xl font-black tracking-tight">Invite to Squad</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[8px] lg:text-[10px]">Official Recruitment</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 py-2">
                    <div className="p-6 lg:p-8 bg-primary/5 rounded-2xl lg:rounded-[2.5rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={copyTeamCode}>
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Official Squad Code</p>
                      <div className="flex items-center justify-center gap-2 lg:gap-4">
                        <p className="text-4xl lg:text-5xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                        <Copy className="h-5 w-5 lg:h-6 lg:w-6 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-[9px] lg:text-[10px] text-muted-foreground font-bold uppercase tracking-widest pt-2">Tap to copy and share</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button className="w-full rounded-xl h-12 lg:h-14 text-sm lg:text-base font-black uppercase tracking-widest" onClick={() => setIsInviteOpen(false)}>Dismiss</Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search squad roster..." 
            className="pl-11 bg-muted/50 border-none rounded-2xl h-11 lg:h-12 shadow-inner font-black text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {filteredRoster.map((member) => (
          <Card 
            key={member.id} 
            className={cn(
              "overflow-hidden border-none shadow-sm transition-all duration-300 ring-1 ring-black/5 rounded-2xl lg:rounded-3xl",
              isStaff ? "cursor-pointer group hover:shadow-md" : "cursor-default"
            )}
            onClick={() => handleMemberClick(member)}
          >
            <CardContent className="p-3 lg:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="relative shrink-0">
                  <Avatar className="h-12 w-12 lg:h-14 lg:w-14 rounded-xl lg:rounded-2xl border-2 border-background shadow-md">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback className="rounded-xl lg:rounded-2xl font-black bg-muted text-[10px] lg:text-xs">{member.name[0]}</AvatarFallback>
                  </Avatar>
                  {isStaff && member.role === 'Admin' && (
                    <div className="absolute -top-1 -right-1 bg-primary text-white p-1 rounded-full shadow-lg border-2 border-background">
                      <ShieldCheck className="h-2.5 w-2.5 lg:h-3 lg:w-3" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 lg:gap-2 mb-0.5">
                    <h3 className="font-black truncate text-base lg:text-lg tracking-tight group-hover:text-primary transition-colors">{member.name}</h3>
                    {isStaff && (
                      <Badge variant="outline" className="text-[8px] lg:text-[9px] py-0 px-1 lg:px-1.5 h-3.5 lg:h-4 border-primary/20 text-primary font-black uppercase tracking-tighter shrink-0">
                        {member.jersey !== 'PAR' && member.jersey !== 'TBD' ? `#${member.jersey}` : member.jersey}
                      </Badge>
                    )}
                  </div>
                  {isStaff && (
                    <p className="text-[9px] lg:text-[11px] text-muted-foreground font-black uppercase tracking-widest truncate">{member.position}</p>
                  )}
                </div>
              </div>

              {isStaff && (
                <div className="flex items-center gap-2 lg:gap-4 shrink-0">
                  {member.position !== 'Parent' && (
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground mb-0.5 lg:mb-1 tracking-widest">Fees</span>
                      <div className={cn(
                        "h-7 lg:h-8 px-2 lg:px-3 rounded-lg font-black text-[8px] lg:text-[10px] border flex items-center justify-center transition-all tracking-tighter shadow-sm",
                        member.feesPaid 
                          ? "bg-primary text-white border-primary" 
                          : "bg-black text-white border-black"
                      )}>
                        {member.feesPaid ? <Check className="h-2.5 w-2.5 lg:h-3 lg:w-3 mr-1" /> : <DollarSign className="h-2.5 w-2.5 lg:h-3 lg:w-3 mr-1" />}
                        {member.feesPaid ? "PAID" : `$${member.amountOwed || 0}`}
                      </div>
                    </div>
                  )}
                  <MoreVertical className="h-4 w-4 text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity hidden sm:block" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Member Details Dialog - ONLY FOR STAFF */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="rounded-3xl lg:rounded-[3rem] sm:max-w-5xl overflow-hidden max-h-[95vh] border-none shadow-2xl p-0 flex flex-col">
          <DialogTitle className="sr-only">Member Profile</DialogTitle>
          <DialogDescription className="sr-only">Profile details</DialogDescription>
          
          {selectedMember && (
            <>
              {/* Header */}
              <div className="bg-muted/30 p-6 lg:p-10 border-b flex flex-col items-center justify-between gap-6 relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                  <Users2 className="h-32 w-32 lg:h-48 lg:w-48 -rotate-12" />
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 relative z-10 text-center sm:text-left w-full">
                  <Avatar className="h-20 w-20 lg:h-28 lg:w-28 rounded-2xl lg:rounded-[2rem] border-4 border-background shadow-xl">
                    <AvatarImage src={selectedMember.avatar} />
                    <AvatarFallback className="text-xl lg:text-2xl font-black bg-muted">{selectedMember.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 lg:space-y-2 flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row items-center gap-2 lg:gap-3">
                      <h2 className="text-2xl lg:text-4xl font-black tracking-tighter leading-tight truncate w-full sm:w-auto">{selectedMember.name}</h2>
                      <div className="flex gap-2">
                        {selectedMember.role === 'Admin' && <Badge className="bg-primary text-white border-none font-black text-[8px] lg:text-[10px] h-5 uppercase tracking-widest px-2 lg:px-3">Leadership</Badge>}
                        {isProtectedManager(selectedMember.userId) && <Badge className="bg-black text-white border-none font-black text-[8px] lg:text-[10px] h-5 uppercase tracking-widest px-2 lg:px-3">Manager</Badge>}
                      </div>
                    </div>
                    <p className="font-black text-primary uppercase tracking-[0.15em] lg:tracking-[0.2em] text-[10px] lg:text-sm">
                      {selectedMember.position} • {selectedMember.jersey !== 'PAR' ? `#${selectedMember.jersey}` : 'Staff'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3 relative z-10 w-full sm:w-auto justify-center sm:justify-end">
                    <Button 
                      variant={isEditing ? "default" : "outline"} 
                      size="sm" 
                      className={cn("rounded-full h-10 px-6 font-black uppercase text-[10px] tracking-widest transition-all shadow-lg", isEditing && "bg-black hover:bg-black/90")}
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? <><Eye className="h-3.5 w-3.5 mr-2" /> View</> : <><Edit3 className="h-3.5 w-3.5 mr-2" /> Edit</>}
                    </Button>
                  </div>
                )}
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
                  {selectedMember.position !== 'Parent' && (
                    <div className="lg:col-span-4 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r bg-muted/5 space-y-6 lg:space-y-8">
                      <div className="space-y-4 lg:space-y-6">
                        <div className="flex items-center gap-3 px-1">
                          <div className="bg-primary/10 p-2 rounded-lg lg:rounded-xl text-primary"><CreditCard className="h-4 w-4" /></div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financials</p>
                        </div>
                        
                        <div className="bg-white p-5 lg:p-6 rounded-2xl lg:rounded-[2rem] shadow-sm border ring-1 ring-black/5 space-y-4">
                          <div className="flex justify-between items-end">
                            <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-muted-foreground">Owed</p>
                            <p className="text-2xl lg:text-3xl font-black text-primary leading-none">${selectedMember.amountOwed || 0}</p>
                          </div>
                          {isAdmin && (
                            <div className="pt-2 flex flex-col gap-2">
                              <div className="flex gap-2">
                                <Input placeholder="Fee Title" value={newFee.title} onChange={e => setNewFee(p => ({ ...p, title: e.target.value }))} className="h-9 lg:h-10 text-[10px] lg:text-xs rounded-xl font-bold" />
                                <div className="relative w-20 lg:w-24 shrink-0">
                                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                  <Input type="number" placeholder="0" value={newFee.amount} onChange={e => setNewFee(p => ({ ...p, amount: e.target.value }))} className="h-9 lg:h-10 text-[10px] lg:text-xs pl-6 lg:pl-8 rounded-xl font-bold" />
                                </div>
                              </div>
                              <Button className="w-full h-9 lg:h-10 rounded-xl text-[10px] font-black" onClick={handleAddFee} disabled={!newFee.title || !newFee.amount}><Plus className="h-3 w-3 lg:h-4 lg:w-4 mr-1.5 lg:mr-2" /> Add Fee</Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 lg:space-y-3 max-h-[200px] lg:max-h-[250px] overflow-y-auto pr-1 lg:pr-2 custom-scrollbar">
                          {selectedMember.fees?.length ? selectedMember.fees.map((fee) => (
                            <div key={fee.id} className="flex items-center justify-between p-3 lg:p-4 bg-white border rounded-xl lg:rounded-2xl hover:border-primary transition-all group shadow-sm">
                              <div className="flex items-center gap-2 lg:gap-3">
                                {isAdmin ? <Checkbox checked={fee.paid} onCheckedChange={() => handleToggleFeePaid(fee.id)} className="h-4 w-4 lg:h-5 lg:w-5 rounded-md lg:rounded-lg" /> : (fee.paid ? <Check className="h-4 w-4 lg:h-5 lg:w-5 text-primary" /> : <Circle className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground/20" />)}
                                <div>
                                  <p className={cn("text-[10px] lg:text-xs font-black truncate max-w-[100px] lg:max-w-[140px]", fee.paid && "text-muted-foreground line-through")}>{fee.title}</p>
                                  <p className="text-[8px] lg:text-[9px] font-bold text-muted-foreground uppercase">${fee.amount}</p>
                                </div>
                              </div>
                              {isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8 text-destructive hover:bg-destructive/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveFee(fee.id)}><Trash2 className="h-3 w-3" /></Button>}
                            </div>
                          )) : (
                            <div className="text-center py-8 lg:py-10 bg-white/50 rounded-xl lg:rounded-2xl border border-dashed"><p className="text-[8px] lg:text-[9px] font-black uppercase text-muted-foreground opacity-40 tracking-widest">No history</p></div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "p-6 lg:p-8 space-y-8 lg:space-y-10",
                    selectedMember.position === 'Parent' ? "lg:col-span-12" : "lg:col-span-8"
                  )}>
                    {isEditing ? (
                      <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-right-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                          <div className="space-y-1.5 lg:space-y-2">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Official Name</Label>
                            <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="h-11 lg:h-12 rounded-xl font-bold bg-muted/20 border-2" />
                          </div>
                          <div className="space-y-1.5 lg:space-y-2">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Position</Label>
                            <Select value={editForm.position} onValueChange={v => setEditForm(p => ({ ...p, position: v }))}>
                              <SelectTrigger className="h-11 lg:h-12 rounded-xl font-bold bg-muted/20 border-2"><SelectValue placeholder="Select position..." /></SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="Coach">Coach</SelectItem>
                                <SelectItem value="Team Lead">Team Lead</SelectItem>
                                <SelectItem value="Assistant Coach">Assistant Coach</SelectItem>
                                <SelectItem value="Squad Leader">Squad Leader</SelectItem>
                                <SelectItem value="Player">Player</SelectItem>
                                <SelectItem value="Parent">Parent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5 lg:space-y-2">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Jersey #</Label>
                            <Input value={editForm.jersey} onChange={e => setEditForm(p => ({ ...p, jersey: e.target.value }))} className="h-11 lg:h-12 rounded-xl font-black text-lg lg:text-xl text-primary bg-muted/20 border-2" />
                          </div>
                          <div className="space-y-1.5 lg:space-y-2">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Cell Phone</Label>
                            <Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className="h-11 lg:h-12 rounded-xl font-bold bg-muted/20 border-2" />
                          </div>
                          <div className="space-y-1.5 lg:space-y-2">
                            <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Birthdate</Label>
                            <Input type="date" value={editForm.birthdate} onChange={e => setEditForm(p => ({ ...p, birthdate: e.target.value }))} className="h-11 lg:h-12 rounded-xl font-bold bg-muted/20 border-2" />
                          </div>
                        </div>

                        {canEditDetails ? (
                          <>
                            <div className="bg-primary/5 p-6 lg:p-8 rounded-2xl lg:rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-6">
                              <div className="flex items-center gap-3">
                                <div className="bg-primary/10 p-2 rounded-lg text-primary"><FileCheck className="h-4 w-4" /></div>
                                <h4 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-primary">Compliance & Waivers</h4>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-center space-x-3 bg-white p-3 rounded-xl border shadow-sm">
                                  <Checkbox id="waiverSigned" checked={editForm.waiverSigned} onCheckedChange={v => setEditForm(p => ({ ...p, waiverSigned: !!v }))} />
                                  <Label htmlFor="waiverSigned" className="text-[10px] font-black uppercase tracking-tight">General Waiver</Label>
                                </div>
                                <div className="flex items-center space-x-3 bg-white p-3 rounded-xl border shadow-sm">
                                  <Checkbox id="transportationWaiverSigned" checked={editForm.transportationWaiverSigned} onCheckedChange={v => setEditForm(p => ({ ...p, transportationWaiverSigned: !!v }))} />
                                  <Label htmlFor="transportationWaiverSigned" className="text-[10px] font-black uppercase tracking-tight">Transport Waiver</Label>
                                </div>
                                <div className="flex items-center space-x-3 bg-white p-3 rounded-xl border shadow-sm">
                                  <Checkbox id="medicalClearance" checked={editForm.medicalClearance} onCheckedChange={v => setEditForm(p => ({ ...p, medicalClearance: !!v }))} />
                                  <Label htmlFor="medicalClearance" className="text-[10px] font-black uppercase tracking-tight">Medical Cleared</Label>
                                </div>
                                <div className="flex items-center space-x-3 bg-white p-3 rounded-xl border shadow-sm">
                                  <Checkbox id="mediaRelease" checked={editForm.mediaRelease} onCheckedChange={v => setEditForm(p => ({ ...p, mediaRelease: !!v }))} />
                                  <Label htmlFor="mediaRelease" className="text-[10px] font-black uppercase tracking-tight">Media Release</Label>
                                </div>
                              </div>
                            </div>

                            <div className="bg-black/5 p-6 lg:p-8 rounded-2xl lg:rounded-[2.5rem] border-2 border-dashed border-black/10 space-y-4 lg:space-y-6">
                              <div className="flex items-center gap-3">
                                <div className="bg-black/10 p-2 rounded-lg text-black"><Baby className="h-4 w-4" /></div>
                                <h4 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-black">Emergency Network</h4>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                                <div className="space-y-1.5 lg:space-y-2">
                                  <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Guardian Name</Label>
                                  <Input value={editForm.parentName} onChange={e => setEditForm(p => ({ ...p, parentName: e.target.value }))} className="h-10 lg:h-11 rounded-xl bg-white" />
                                </div>
                                <div className="space-y-1.5 lg:space-y-2">
                                  <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Guardian Phone</Label>
                                  <Input value={editForm.parentPhone} onChange={e => setEditForm(p => ({ ...p, parentPhone: e.target.value }))} className="h-10 lg:h-11 rounded-xl bg-white" />
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="bg-primary/5 p-8 rounded-2xl border-2 border-dashed border-primary/20 text-center space-y-4">
                            <div className="bg-white w-12 h-12 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                              <Lock className="h-6 w-6 text-primary" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-sm font-black uppercase">Elite Fields Locked</h4>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Waivers and Emergency contacts require Pro.</p>
                            </div>
                            <Button size="sm" className="rounded-full h-9 px-6 font-black uppercase text-[9px] tracking-widest" onClick={purchasePro}>Upgrade to Elite</Button>
                          </div>
                        )}

                        <Button onClick={handleSaveDetails} className="w-full h-14 lg:h-16 rounded-2xl lg:rounded-[2rem] text-base lg:text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                          Save Changes
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-8 lg:space-y-10 animate-in fade-in slide-in-from-left-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-10">
                          <div className="space-y-4 lg:space-y-6">
                            <div className="flex items-center gap-3 px-1">
                              <div className="bg-black/10 p-2 rounded-lg text-black"><AtSign className="h-4 w-4" /></div>
                              <h4 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em]">Bio</h4>
                            </div>
                            <div className="space-y-3 lg:space-y-4">
                              <div className="bg-muted/30 p-4 lg:p-5 rounded-xl lg:rounded-2xl flex items-center gap-4">
                                <div className="bg-white p-2 rounded-xl shadow-sm"><Cake className="h-4 w-4 text-primary" /></div>
                                <div className="min-w-0">
                                  <p className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground mb-0.5 tracking-widest">Age</p>
                                  <p className="text-xs lg:text-sm font-black flex items-center gap-2">
                                    {selectedMember.birthdate ? format(new Date(selectedMember.birthdate), 'MMM d, yyyy') : 'No DOB'}
                                    {calculateAge(selectedMember.birthdate) && <Badge variant="secondary" className="bg-primary/10 text-primary border-none h-4 lg:h-5 px-1.5 lg:px-2 text-[8px] lg:text-[9px] font-black uppercase tracking-widest">{calculateAge(selectedMember.birthdate)}y</Badge>}
                                  </p>
                                </div>
                              </div>
                              <div className="bg-muted/30 p-4 lg:p-5 rounded-xl lg:rounded-2xl flex items-center gap-4">
                                <div className="bg-white p-2 rounded-xl shadow-sm"><Phone className="h-4 w-4 text-primary" /></div>
                                <div className="min-w-0">
                                  <p className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground mb-0.5 tracking-widest">Cell</p>
                                  <p className="text-xs lg:text-sm font-black">{selectedMember.phone || 'No phone registered'}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4 lg:space-y-6">
                            <div className="flex items-center gap-3 px-1">
                              <div className="bg-black/10 p-2 rounded-lg text-black"><MessageSquare className="h-4 w-4" /></div>
                              <h4 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em]">Connect</h4>
                            </div>
                            <div className="grid grid-cols-1 gap-2 lg:gap-3">
                              {isMobile ? (
                                <>
                                  <a href={selectedMember.phone ? `sms:${selectedMember.phone}` : '#'} className={cn(buttonVariants({ variant: "outline" }), "h-12 lg:h-14 rounded-xl lg:rounded-2xl border-2 border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest gap-2 shadow-sm w-full", !selectedMember.phone && "opacity-50 pointer-events-none")}>
                                    <MessageSquare className="h-4 w-4" /> SMS
                                  </a>
                                  <a href={selectedMember.phone ? `tel:${selectedMember.phone}` : '#'} className={cn(buttonVariants({ variant: "default" }), "h-12 lg:h-14 rounded-xl lg:rounded-2xl font-black uppercase text-[10px] tracking-widest gap-2 shadow-xl shadow-primary/20 w-full", !selectedMember.phone && "opacity-50 pointer-events-none")}>
                                    <Phone className="h-4 w-4" /> Call
                                  </a>
                                </>
                              ) : (
                                <div className="p-4 bg-muted/10 border-2 border-dashed rounded-xl lg:rounded-2xl text-center">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Mobile app required for direct dialing</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {isStaff && (
                          <div className="space-y-6 pt-4 border-t">
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-3">
                                <ShieldAlert className="h-5 w-5 text-primary" />
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Private Staff Evaluations</h4>
                              </div>
                              <Badge className="bg-primary text-white border-none font-black text-[8px] uppercase px-2 h-5">Vault Secured</Badge>
                            </div>
                            <div className="bg-muted/30 p-6 rounded-[2.5rem] border-2 border-dashed space-y-4">
                              <Textarea 
                                placeholder="Coaching notes, behavioral observations, developmental goals..."
                                value={staffNote}
                                onChange={e => setStaffNote(e.target.value)}
                                className="min-h-[150px] bg-white rounded-2xl border-none font-medium italic shadow-inner"
                              />
                              <div className="flex items-center justify-between">
                                <p className="text-[8px] font-bold text-muted-foreground uppercase max-w-[200px]">These notes are encrypted and visible ONLY to authorized coaching staff.</p>
                                <Button 
                                  size="sm" 
                                  className="rounded-xl h-10 px-6 font-black uppercase text-[9px] shadow-lg shadow-primary/20"
                                  onClick={handleSaveNote}
                                  disabled={isSavingNote}
                                >
                                  {isSavingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                                  Sync to Vault
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {canEditDetails && (
                          <div className="space-y-8">
                            <div className="space-y-4 lg:space-y-6">
                              <div className="flex items-center gap-3 px-1">
                                <div className="bg-primary/10 p-2 rounded-lg text-primary"><FileCheck className="h-4 w-4" /></div>
                                <h4 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-primary">Compliance Status</h4>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                  { icon: FileCheck, label: 'Waiver', active: selectedMember.waiverSigned },
                                  { icon: Truck, label: 'Transport', active: selectedMember.transportationWaiverSigned },
                                  { icon: HeartPulse, label: 'Medical', active: selectedMember.medicalClearance },
                                  { icon: CameraIcon, label: 'Media', active: selectedMember.mediaRelease }
                                ].map((item, i) => (
                                  <div key={i} className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border transition-all shadow-sm", item.active ? "bg-primary/5 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground opacity-40")}>
                                    <item.icon className="h-5 w-5 mb-1.5" />
                                    <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {(selectedMember.parentName || selectedMember.emergencyContactName) && (
                              <div className="space-y-4 lg:space-y-6">
                                <div className="flex items-center gap-3 px-1">
                                  <div className="bg-primary/10 p-2 rounded-lg text-primary"><Baby className="h-4 w-4" /></div>
                                  <h4 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-primary">Emergency</h4>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                                  {selectedMember.parentName && (
                                    <div className="bg-primary/5 p-5 lg:p-6 rounded-2xl lg:rounded-[2rem] border-2 border-primary/10 space-y-2">
                                      <p className="text-[7px] lg:text-[8px] font-black uppercase text-primary/60 tracking-widest">Guardian</p>
                                      <p className="text-sm lg:text-base font-black truncate">{selectedMember.parentName}</p>
                                      <p className="text-[10px] font-bold text-primary font-mono">{selectedMember.parentPhone || 'No phone'}</p>
                                    </div>
                                  )}
                                  {selectedMember.emergencyContactName && (
                                    <div className="bg-black/5 p-5 lg:p-6 rounded-2xl lg:rounded-[2rem] border-2 border-black/10 space-y-2">
                                      <p className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground tracking-widest">Emergency</p>
                                      <p className="text-sm lg:text-base font-black truncate">{selectedMember.emergencyContactName}</p>
                                      <p className="text-[10px] font-bold font-mono">{selectedMember.emergencyContactPhone || 'No phone'}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-4 lg:p-6 bg-muted/10 border-t flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-2 text-muted-foreground opacity-50 px-2">
                  {isProtectedManager(selectedMember.userId) && (
                    <span className="text-[8px] lg:text-[9px] font-black uppercase tracking-widest leading-none flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Protected Profile</span>
                  )}
                </div>
                <div className="flex gap-2 lg:gap-3 w-full sm:w-auto">
                  {isAdmin && !isProtectedManager(selectedMember.userId) && (
                    <Button variant="ghost" className="flex-1 sm:flex-none h-10 lg:h-12 px-4 lg:px-6 rounded-xl text-destructive hover:bg-destructive/10 font-black uppercase text-[9px] lg:text-[10px] tracking-widest">
                      Remove
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedMember(null)} className="flex-1 sm:flex-none h-10 lg:h-12 px-6 lg:px-8 rounded-xl font-black uppercase text-[9px] lg:text-[10px] tracking-widest border-2">Close</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {filteredRoster.length === 0 && (
        <div className="text-center py-16 lg:py-20 bg-muted/10 rounded-3xl border-2 border-dashed">
          <div className="bg-white w-14 h-14 lg:w-16 lg:h-16 rounded-2xl lg:rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm ring-1 ring-black/5">
            <Search className="h-6 w-6 lg:h-8 lg:w-8 text-muted-foreground opacity-20" />
          </div>
          <h3 className="font-black text-lg uppercase tracking-tight">No teammates</h3>
          <p className="text-xs lg:text-sm text-muted-foreground font-medium">Try adjusting your search.</p>
        </div>
      )}
    </div>
  );
}
