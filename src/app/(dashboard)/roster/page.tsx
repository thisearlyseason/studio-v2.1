
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
  const { activeTeam, updateMember, user, isPro, isSuperAdmin, purchasePro, hasFeature, members, isMembersLoading, isStaff, isParent, updateStaffEvaluation, getStaffEvaluation } = useTeam();
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

  // Filter roster for Parents: Only show Coaches or other Parents
  const filteredRoster = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (isParent && !isStaff) {
      const isVisiblePosition = ['Coach', 'Parent', 'Team Lead', 'Assistant Coach', 'Squad Leader'].includes(member.position);
      return matchesSearch && isVisiblePosition;
    }
    return matchesSearch;
  });

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
    toast({ title: "Evaluation Synchronized" });
  };

  const handleAddFee = () => {
    if (!selectedMember || !newFee.title || !newFee.amount) return;
    const feeItem: FeeItem = { id: 'fee_' + Date.now(), title: newFee.title, amount: parseFloat(newFee.amount) || 0, paid: false, createdAt: new Date().toISOString() };
    const currentFees = selectedMember.fees || [];
    const updatedFees = [...currentFees, feeItem];
    updateMember(selectedMember.id, { fees: updatedFees, amountOwed: updatedFees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0), feesPaid: updatedFees.every(f => f.paid) });
    setSelectedMember({ ...selectedMember, fees: updatedFees });
    setNewFee({ title: '', amount: '' });
  };

  const handleToggleFeePaid = (feeId: string) => {
    if (!selectedMember) return;
    const updatedFees = (selectedMember.fees || []).map(f => f.id === feeId ? { ...f, paid: !f.paid } : f);
    updateMember(selectedMember.id, { fees: updatedFees, amountOwed: updatedFees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0), feesPaid: updatedFees.every(f => f.paid) });
    setSelectedMember({ ...selectedMember, fees: updatedFees });
  };

  const handleRemoveFee = (feeId: string) => {
    if (!selectedMember) return;
    const updatedFees = (selectedMember.fees || []).filter(f => f.id !== feeId);
    updateMember(selectedMember.id, { fees: updatedFees, amountOwed: updatedFees.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0), feesPaid: updatedFees.length > 0 && updatedFees.every(f => f.paid) });
    setSelectedMember({ ...selectedMember, fees: updatedFees });
  };

  const handleSaveDetails = () => {
    if (selectedMember) {
      const adminPositions = ['Coach', 'Team Lead', 'Assistant Coach', 'Squad Leader'];
      const newRole = adminPositions.includes(editForm.position || '') ? 'Admin' : 'Member';
      const updates = { ...editForm, role: newRole };
      updateMember(selectedMember.id, updates);
      setSelectedMember({ ...selectedMember, ...updates, role: newRole });
      setIsEditing(false);
      toast({ title: "Updated" });
    }
  };

  const copyTeamCode = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(activeTeam.code);
        toast({ title: "Code Copied" });
      }
    } catch (err) {}
  };

  const calculateAge = (dob?: string) => {
    if (!dob) return null;
    try { return differenceInYears(new Date(), new Date(dob)); } catch { return null; }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Team Roster</h1>
            {isParent && !isStaff && <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Contact List: Coaches & Guardians Only</p>}
          </div>
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
                    <SelectItem key={m.id} value={m.id} className="rounded-xl p-3 font-bold text-xs uppercase tracking-tight">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isStaff && (
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-full px-4 lg:px-6 font-black uppercase text-[10px] lg:text-xs h-10 lg:h-11 tracking-widest shadow-lg shadow-primary/20">
                    <UserPlus className="h-3.5 w-3.5 lg:h-4 lg:w-4 mr-2" /> Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-3xl lg:rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                  <div className="h-2 bg-primary w-full" />
                  <div className="p-6 lg:p-8 space-y-6">
                    <DialogHeader>
                      <DialogTitle className="text-xl lg:text-2xl font-black tracking-tight">Recruitment Code</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase text-[8px] lg:text-[10px]">Invite new teammates</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 lg:p-8 bg-primary/5 rounded-2xl lg:rounded-[2.5rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={copyTeamCode}>
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Official Squad Code</p>
                      <div className="flex items-center justify-center gap-2 lg:gap-4">
                        <p className="text-4xl lg:text-5xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                        <Copy className="h-5 w-5 lg:h-6 lg:w-6 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search squad roster..." className="pl-11 bg-muted/50 border-none rounded-2xl h-11 lg:h-12 shadow-inner font-black text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className={cn("overflow-hidden border-none shadow-sm transition-all duration-300 ring-1 ring-black/5 rounded-2xl lg:rounded-3xl", isStaff ? "cursor-pointer group hover:shadow-md" : "cursor-default")} onClick={() => handleMemberClick(member)}>
            <CardContent className="p-3 lg:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 lg:gap-4">
                <Avatar className="h-12 w-12 lg:h-14 lg:w-14 rounded-xl lg:rounded-2xl border-2 border-background shadow-md">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-xl lg:rounded-2xl font-black bg-muted text-[10px] lg:text-xs">{member.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 lg:gap-2 mb-0.5">
                    <h3 className="font-black truncate text-base lg:text-lg tracking-tight group-hover:text-primary transition-colors">{member.name}</h3>
                    {member.jersey !== 'TBD' && member.jersey !== 'HQ' && <Badge variant="outline" className="text-[8px] lg:text-[9px] h-4 border-primary/20 text-primary font-black uppercase">#{member.jersey}</Badge>}
                  </div>
                  <p className="text-[9px] lg:text-[11px] text-muted-foreground font-black uppercase tracking-widest truncate">{member.position}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {!isStaff && member.phone && isMobile && (
                  <a href={`tel:${member.phone}`} className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary hover:text-white transition-all"><Phone className="h-4 w-4" /></a>
                )}
                {isStaff && <MoreVertical className="h-4 w-4 text-muted-foreground opacity-30" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="rounded-3xl lg:rounded-[3rem] sm:max-w-5xl overflow-hidden max-h-[95vh] border-none shadow-2xl p-0 flex flex-col">
          <DialogTitle className="sr-only">Profile</DialogTitle>
          {selectedMember && (
            <>
              <div className="bg-muted/30 p-6 lg:p-10 border-b flex flex-col items-center justify-between gap-6 shrink-0 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-6 w-full">
                  <Avatar className="h-20 w-20 lg:h-28 lg:w-28 rounded-2xl lg:rounded-[2rem] border-4 border-background shadow-xl">
                    <AvatarImage src={selectedMember.avatar} />
                    <AvatarFallback className="text-xl lg:text-2xl font-black bg-muted">{selectedMember.name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 lg:space-y-2 flex-1">
                    <h2 className="text-2xl lg:text-4xl font-black tracking-tighter leading-tight uppercase">{selectedMember.name}</h2>
                    <p className="font-black text-primary uppercase tracking-[0.2em] text-[10px] lg:text-sm">{selectedMember.position} • {selectedMember.jersey !== 'PAR' ? `#${selectedMember.jersey}` : 'Staff'}</p>
                  </div>
                </div>
                {isAdmin && <Button variant="outline" size="sm" className="rounded-full h-10 px-6 font-black uppercase text-[10px]" onClick={() => setIsEditing(!isEditing)}>{isEditing ? 'View' : 'Edit'}</Button>}
              </div>
              <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
                {isEditing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2"><Label>Official Name</Label><Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="h-12 rounded-xl" /></div>
                    <div className="space-y-2"><Label>Position</Label><Input value={editForm.position} onChange={e => setEditForm(p => ({ ...p, position: e.target.value }))} className="h-12 rounded-xl" /></div>
                    <Button className="col-span-full h-14 rounded-2xl font-black" onClick={handleSaveDetails}>Save Changes</Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3"><div className="bg-black/10 p-2 rounded-lg"><AtSign className="h-4 w-4" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em]">Contact</h4></div>
                      <div className="space-y-3">
                        <div className="bg-muted/30 p-4 rounded-xl flex items-center gap-4"><Phone className="h-4 w-4 text-primary" /><div><p className="text-[8px] font-black uppercase opacity-40">Phone</p><p className="text-sm font-black">{selectedMember.phone || 'N/A'}</p></div></div>
                      </div>
                    </div>
                    {isStaff && (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 text-primary"><ShieldAlert className="h-4 w-4" /><h4 className="text-xs font-black uppercase tracking-[0.2em]">Staff Notes</h4></div>
                        <Textarea placeholder="Private notes..." value={staffNote} onChange={e => setStaffNote(e.target.value)} className="min-h-[150px]" />
                        <Button className="w-full h-10 rounded-xl text-[10px] font-black uppercase" onClick={handleSaveNote} disabled={isSavingNote}>{isSavingNote ? 'Syncing...' : 'Save Private Note'}</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
