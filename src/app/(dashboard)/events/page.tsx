
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  Info, 
  CheckCircle2, 
  Users, 
  Link as LinkIcon, 
  UserPlus, 
  Trash2, 
  HelpCircle, 
  XCircle, 
  Edit3, 
  Copy,
  Trophy,
  CalendarDays,
  ArrowRight,
  Lock,
  Sparkles,
  Download,
  ListPlus,
  Table as TableIcon,
  ChevronLeft,
  Loader2,
  CalendarCheck,
  CalendarX,
  CircleHelp,
  ShieldCheck,
  FileCheck
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, TeamEvent, CustomFormField, FormFieldType } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  promoteToRoster: (teamId: string, eventId: string, reg: any) => Promise<void>;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  hasAttendance: boolean;
  purchasePro: () => void;
  children: React.ReactNode;
}

function EventDetailDialog({ event, updateRSVP, promoteToRoster, isAdmin, onEdit, onDelete, hasAttendance, purchasePro, children }: EventDetailDialogProps) {
  const { members = [], user, addRegistration, submitEventWaiver } = useTeam();
  const db = useFirestore();
  
  const [showInternalForm, setShowInternalForm] = useState(false);
  const [showWaiverStep, setShowWaiverStep] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmittingInternal, setIsSubmittingInternal] = useState(false);

  const regQuery = useMemoFirebase(() => {
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event.id, event.teamId]);
  
  const { data: registrations } = useCollection<any>(regQuery);

  const copyRegLink = () => {
    const url = `${window.location.origin}/events/register/${event.teamId}?eventId=${event.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied", description: "Share this link with external participants." });
  };

  const attendanceData = useMemo(() => {
    const internal = Object.entries(event.userRsvps || {}).map(([uid, status]) => {
      const member = members.find(m => m.userId === uid);
      return {
        id: uid,
        name: member?.name || 'Unknown Member',
        avatar: member?.avatar,
        role: member?.position || 'Member',
        status,
        isExternal: false,
        waiverAgreed: event.specialWaiverResponses?.[uid]?.agreed || false
      };
    });

    const external = (registrations || []).map(reg => ({
      id: reg.id,
      name: reg.name,
      avatar: undefined,
      role: 'Public Registrant',
      status: 'going',
      isExternal: true,
      regData: reg,
      waiverAgreed: true // Externals agree during registration form usually
    }));

    return [...internal, ...external];
  }, [event.userRsvps, event.specialWaiverResponses, members, registrations]);

  const goingList = attendanceData.filter(a => a.status === 'going');
  const maybeList = attendanceData.filter(a => a.status === 'maybe');
  const notGoingList = attendanceData.filter(a => a.status === 'notGoing');

  const hasAgreedToWaiver = user ? !!event.specialWaiverResponses?.[user.id]?.agreed : false;

  const handleRSVPAction = (status: string) => {
    if (status === 'going') {
      if (event.requiresSpecialWaiver && !hasAgreedToWaiver) {
        setShowWaiverStep(true);
        return;
      }
      if (event.isRegistrationRequired) {
        setShowInternalForm(true);
        return;
      }
    }
    updateRSVP(event.id, status);
  };

  const handleWaiverAgreement = async (agreed: boolean) => {
    if (!user) return;
    await submitEventWaiver(event.id, agreed);
    if (agreed) {
      setShowWaiverStep(false);
      // Proceed to form or RSVP
      if (event.isRegistrationRequired) {
        setShowInternalForm(true);
      } else {
        updateRSVP(event.id, 'going');
      }
    } else {
      setShowWaiverStep(false);
      toast({ title: "Waiver Declined", description: "You cannot join this event without accepting the waiver.", variant: "destructive" });
    }
  };

  const handleInternalSubmit = async () => {
    if (!user) return;
    setIsSubmittingInternal(true);
    const success = await addRegistration(event.teamId, event.id, {
      name: user.name,
      email: user.email,
      phone: user.phone || 'N/A',
      userId: user.id,
      responses: formData
    });
    if (success) {
      updateRSVP(event.id, 'going');
      setShowInternalForm(false);
      toast({ title: "Registration Confirmed" });
    }
    setIsSubmittingInternal(false);
  };

  const handleDownloadCSV = () => {
    if (!registrations || registrations.length === 0) return;
    const customFieldIds = event.customFormFields?.map(f => f.id) || [];
    const customFieldLabels = event.customFormFields?.map(f => f.label) || [];
    const headers = ['Name', 'Email', 'Phone', 'Status', ...customFieldLabels];
    const rows = registrations.map(reg => {
      const basic = [`"${reg.name}"`, `"${reg.email}"`, `"${reg.phone}"`, `"${reg.status}"`];
      const customValues = customFieldIds.map(fid => {
        const val = reg.responses?.[fid];
        const displayVal = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : (val || '');
        return `"${displayVal}"`;
      });
      return [...basic, ...customValues].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `registrations_${event.title.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const currentStatus = event.userRsvps?.[user?.id || ''];

  return (
    <Dialog onOpenChange={(open) => { if(!open) { setShowInternalForm(false); setShowWaiverStep(false); } }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl p-0 overflow-hidden rounded-3xl lg:rounded-[2.5rem] max-h-[95vh] flex flex-col border-none shadow-2xl">
        <DialogTitle className="sr-only">{event.title}</DialogTitle>
        <DialogDescription className="sr-only">Roster and logistics for {event.title}</DialogDescription>
        
        {showWaiverStep ? (
          <div className="flex-1 flex flex-col bg-background animate-in slide-in-from-right duration-300">
            <div className="p-6 lg:p-10 space-y-8 max-w-2xl mx-auto w-full">
              <Button variant="ghost" onClick={() => setShowWaiverStep(false)} className="rounded-full h-10 px-4 -ml-4 font-black uppercase text-[10px] tracking-widest"><ChevronLeft className="h-4 w-4 mr-2" /> Back</Button>
              <div className="space-y-4">
                <Badge className="bg-amber-100 text-amber-700 border-none font-black px-3 h-6 uppercase tracking-widest text-[9px]">Mandatory Event Waiver</Badge>
                <h3 className="text-3xl font-black tracking-tight leading-tight">Review Requirements</h3>
                <p className="text-muted-foreground font-bold leading-relaxed">This event requires your explicit acknowledgment of the following terms before you can join the squad roster.</p>
              </div>
              <div className="bg-muted/30 p-6 lg:p-8 rounded-2xl lg:rounded-[2.5rem] border-2 border-dashed border-primary/20 overflow-y-auto max-h-[300px] custom-scrollbar">
                <p className="text-sm lg:text-base font-bold text-foreground/80 leading-relaxed whitespace-pre-wrap italic">
                  {event.specialWaiverText || "No special waiver text provided. Please confirm your participation and agreement to standard team safety protocols."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <Button variant="outline" className="h-14 rounded-2xl font-black uppercase text-xs tracking-widest border-2 text-destructive hover:bg-destructive/5" onClick={() => handleWaiverAgreement(false)}>I Do Not Agree</Button>
                <Button className="h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={() => handleWaiverAgreement(true)}>Accept & Continue</Button>
              </div>
            </div>
          </div>
        ) : showInternalForm ? (
          <div className="flex-1 flex flex-col bg-background animate-in slide-in-from-right duration-300">
            <div className="p-6 lg:p-10 space-y-8 max-w-2xl mx-auto w-full">
              <Button variant="ghost" onClick={() => setShowInternalForm(false)} className="rounded-full h-10 px-4 -ml-4 font-black uppercase text-[10px] tracking-widest"><ChevronLeft className="h-4 w-4 mr-2" /> Back</Button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black tracking-tight">Complete Registration</h3>
                <p className="text-muted-foreground font-bold">Please provide the details required for this match.</p>
              </div>
              <div className="space-y-6">
                {event.customFormFields?.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">{field.label}</Label>
                    {field.type === 'short_text' && <Input value={formData[field.id] || ''} onChange={e => setFormData(p => ({ ...p, [field.id]: e.target.value }))} className="h-12 rounded-xl font-bold" />}
                    {field.type === 'long_text' && <Textarea value={formData[field.id] || ''} onChange={e => setFormData(p => ({ ...p, [field.id]: e.target.value }))} className="rounded-xl min-h-[100px] font-bold" />}
                    {field.type === 'checkbox' && (
                      <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-xl border-2">
                        <Checkbox checked={!!formData[field.id]} onCheckedChange={v => setFormData(p => ({ ...p, [field.id]: !!v }))} />
                        <Label className="cursor-pointer font-bold">{field.label}</Label>
                      </div>
                    )}
                  </div>
                ))}
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 mt-4" onClick={handleInternalSubmit} disabled={isSubmittingInternal}>
                  {isSubmittingInternal ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Confirm My Spot"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
              <div className="lg:col-span-4 bg-muted/30 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r flex flex-col justify-between space-y-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Badge className={cn("border-none font-black uppercase tracking-widest text-[8px] lg:text-[10px] px-2 lg:px-3 h-5 lg:h-6", event.isTournament ? "bg-black text-white" : "bg-primary text-white")}>
                      {event.isTournament ? "Tournament" : "Match"}
                    </Badge>
                    <h2 className="text-2xl lg:text-3xl font-black tracking-tighter leading-tight break-words">{event.title}</h2>
                    <p className="font-black text-primary text-base lg:text-lg">
                      {event.isTournament && event.endDate ? (
                        `${format(new Date(event.date), 'MMM d')} - ${format(new Date(event.endDate), 'MMM d, yyyy')}`
                      ) : (
                        new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:gap-4">
                    <div className="flex items-center gap-3 lg:gap-4 bg-background p-3 lg:p-4 rounded-xl lg:rounded-2xl shadow-sm border-2 border-black/5">
                      <div className="bg-primary/10 p-2 lg:p-3 rounded-lg lg:rounded-xl text-primary"><Clock className="h-4 w-4 lg:h-5 lg:w-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-muted-foreground">Time</p>
                        <p className="text-xs lg:text-sm font-black truncate">{event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 lg:gap-4 bg-background p-3 lg:p-4 rounded-xl lg:rounded-2xl shadow-sm border-2 border-black/5">
                      <div className="bg-primary/10 p-2 lg:p-3 rounded-lg lg:rounded-xl text-primary"><MapPin className="h-4 w-4 lg:h-5 lg:w-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-muted-foreground">Loc</p>
                        <p className="text-xs lg:text-sm font-black truncate">{event.location}</p>
                      </div>
                    </div>
                  </div>

                  {event.requiresSpecialWaiver && (
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-start gap-3">
                      <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest leading-none">Special Waiver Active</p>
                        <p className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter">Sign-off required for all participants</p>
                      </div>
                    </div>
                  )}

                  {event.isTournament && event.tournamentSchedule && event.tournamentSchedule.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily Schedule</p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                        {event.tournamentSchedule.map((item: any, idx: number) => (
                          <div key={idx} className="bg-background p-3 rounded-xl border border-black/5 shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[8px] font-black text-primary uppercase">{format(new Date(item.date), 'MMM d')}</span>
                              <span className="text-[8px] font-bold text-muted-foreground">{item.time}</span>
                            </div>
                            <p className="text-[10px] font-black leading-tight">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 lg:p-5 bg-background/50 rounded-xl lg:rounded-2xl border-2 border-dashed border-primary/20">
                    <p className="text-xs lg:text-sm text-muted-foreground font-black leading-relaxed italic break-words">"{event.description || 'No additional details.'}"</p>
                  </div>
                </div>

                <div className="pt-4 lg:pt-8 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    {event.isRegistrationRequired && <Badge className="bg-blue-600 text-white font-black px-2 lg:px-3 h-6 lg:h-7 text-[8px] lg:text-[10px] uppercase shadow-lg">Registration On</Badge>}
                    {isAdmin && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl border-primary/20 text-primary" onClick={() => onEdit(event)}><Edit3 className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl border-destructive/20 text-destructive" onClick={() => onDelete(event.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  {hasAttendance && (
                    <div className="grid grid-cols-3 gap-2 text-center bg-background rounded-xl lg:rounded-2xl p-3 lg:p-4 shadow-inner border-2">
                      <div><p className="text-lg lg:text-xl font-black text-green-600 leading-none">{goingList.length}</p><p className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground mt-1">Yes</p></div>
                      <div><p className="text-lg lg:text-xl font-black text-amber-600 leading-none">{maybeList.length}</p><p className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground mt-1">Maybe</p></div>
                      <div><p className="text-lg lg:text-xl font-black text-red-600 leading-none">{notGoingList.length}</p><p className="text-[7px] lg:text-[8px] font-black uppercase text-muted-foreground mt-1">No</p></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8 flex flex-col bg-background">
                {hasAttendance ? (
                  <Tabs defaultValue="attendance" className="flex-1 flex flex-col">
                    <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 border-b flex items-center justify-between">
                      <TabsList className="bg-muted/50 rounded-xl p-1 h-10 lg:h-11">
                        <TabsTrigger value="attendance" className="rounded-lg font-black text-[8px] lg:text-[10px] uppercase tracking-widest px-4 lg:px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Roster</TabsTrigger>
                        {event.isRegistrationRequired && <TabsTrigger value="responses" className="rounded-lg font-black text-[8px] lg:text-[10px] uppercase tracking-widest px-4 lg:px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Form Responses</TabsTrigger>}
                        {event.requiresSpecialWaiver && <TabsTrigger value="waiver" className="rounded-lg font-black text-[8px] lg:text-[10px] uppercase tracking-widest px-4 lg:px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Waiver Stats</TabsTrigger>}
                        {event.allowExternalRegistration && <TabsTrigger value="links" className="rounded-lg font-black text-[8px] lg:text-[10px] uppercase tracking-widest px-4 lg:px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Links</TabsTrigger>}
                      </TabsList>
                      <DialogClose asChild><Button variant="ghost" size="icon" className="rounded-full h-8 w-8"><XCircle className="h-5 w-5 text-muted-foreground" /></Button></DialogClose>
                    </div>

                    <div className="flex-1 px-6 lg:px-8 py-4 lg:py-6 overflow-y-auto">
                      <TabsContent value="attendance" className="mt-0 space-y-6 lg:space-y-8">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 px-1">
                            <CheckCircle2 className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-green-600" />
                            <span className="text-[8px] lg:text-[10px] font-black uppercase text-green-600 tracking-[0.2em]">Going ({goingList.length})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:gap-3">
                            {goingList.length > 0 ? goingList.map((person) => (
                              <div key={person.id} className="flex items-center justify-between p-2.5 lg:p-3 bg-muted/20 rounded-xl lg:rounded-2xl ring-2 ring-black/5">
                                <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                                  <Avatar className="h-7 w-7 lg:h-8 lg:w-8 shrink-0"><AvatarImage src={person.avatar} /><AvatarFallback className="font-black text-[10px]">{person.name[0]}</AvatarFallback></Avatar>
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[11px] lg:text-xs font-black truncate">{person.name}</span>
                                      {person.isExternal && <Badge className="text-[6px] h-3 bg-primary text-white font-black uppercase px-1 shrink-0">Public</Badge>}
                                      {event.requiresSpecialWaiver && (
                                        person.waiverAgreed ? <FileCheck className="h-3 w-3 text-green-600" /> : <ShieldCheck className="h-3 w-3 text-red-600 opacity-40" />
                                      )}
                                    </div>
                                    <span className="text-[7px] lg:text-[8px] text-muted-foreground font-black uppercase tracking-widest truncate">{person.role}</span>
                                  </div>
                                </div>
                                {person.isExternal && person.regData?.status === 'pending' && isAdmin && (
                                  <Button size="sm" variant="ghost" className="h-6 text-[8px] font-black text-primary hover:bg-primary/10 rounded-full shrink-0" onClick={() => promoteToRoster(event.teamId, event.id, person.regData!)}>Add</Button>
                                )}
                              </div>
                            )) : <p className="text-[10px] lg:text-xs text-muted-foreground font-black italic px-1">No responses yet...</p>}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="waiver" className="mt-0 pt-4 space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Special Waiver Compliance</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {members.map(member => {
                            const response = event.specialWaiverResponses?.[member.userId];
                            const status = response ? (response.agreed ? 'Agreed' : 'Declined') : 'Pending';
                            return (
                              <div key={member.id} className="flex items-center justify-between p-4 bg-muted/10 rounded-2xl border">
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8"><AvatarImage src={member.avatar} /><AvatarFallback className="font-black text-[10px]">{member.name[0]}</AvatarFallback></Avatar>
                                  <div className="min-w-0">
                                    <p className="text-xs font-black truncate">{member.name}</p>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">{member.position}</p>
                                  </div>
                                </div>
                                <Badge className={cn(
                                  "text-[8px] font-black uppercase tracking-widest border-none px-2 h-5",
                                  status === 'Agreed' ? "bg-green-600 text-white" : status === 'Declined' ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
                                )}>{status}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      </TabsContent>

                      <TabsContent value="responses" className="mt-0 pt-4 space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Detailed Registration Submissions</h4>
                          {isAdmin && registrations && registrations.length > 0 && (
                            <Button variant="outline" size="sm" className="rounded-full h-8 px-4 font-black uppercase text-[8px] tracking-widest gap-2" onClick={handleDownloadCSV}>
                              <Download className="h-3 w-3" /> Export CSV
                            </Button>
                          )}
                        </div>
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-4 pr-4">
                            {registrations && registrations.length > 0 ? registrations.map((reg) => (
                              <div key={reg.id} className="p-4 rounded-2xl border bg-muted/10 space-y-3">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-black text-sm">{reg.name}</p>
                                    <p className="text-[10px] font-bold text-muted-foreground">{reg.email} • {reg.phone}</p>
                                  </div>
                                  <Badge variant="secondary" className="text-[8px] font-black uppercase">{reg.status}</Badge>
                                </div>
                                {event.customFormFields?.map((field) => (
                                  <div key={field.id} className="pt-2 border-t border-dashed">
                                    <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mb-1">{field.label}</p>
                                    <p className="text-xs font-medium">
                                      {field.type === 'checkbox' 
                                        ? (reg.responses?.[field.id] ? 'Yes' : 'No')
                                        : (reg.responses?.[field.id] || 'N/A')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )) : (
                              <div className="text-center py-20 opacity-30">
                                <ListPlus className="h-10 w-10 mx-auto mb-2" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No detailed responses found.</p>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </TabsContent>

                      <TabsContent value="links" className="mt-0 pt-4">
                        <div className="bg-primary/5 p-6 lg:p-8 rounded-2xl lg:rounded-[2rem] border-2 border-dashed border-primary/20 text-center space-y-4 lg:space-y-6">
                          <div className="bg-white w-12 h-12 lg:w-16 lg:h-16 rounded-2xl lg:rounded-3xl flex items-center justify-center mx-auto shadow-xl">
                            <LinkIcon className="h-6 w-6 lg:h-8 lg:w-8 text-primary" />
                          </div>
                          <h4 className="text-lg lg:text-xl font-black tracking-tight">Public Portal</h4>
                          <Button className="w-full h-12 lg:h-14 rounded-xl lg:rounded-2xl font-black text-[10px] lg:text-xs uppercase tracking-widest shadow-lg gap-2" onClick={copyRegLink}><Copy className="h-3.5 w-3.5" /> Copy Link</Button>
                        </div>
                      </TabsContent>
                    </div>

                    <div className="px-6 lg:px-8 py-6 lg:py-8 border-t bg-muted/10 mt-auto shrink-0">
                      <p className="text-[8px] lg:text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] text-center mb-4">Select Status</p>
                      <div className="grid grid-cols-3 gap-2 lg:gap-4">
                        <Button 
                          variant="outline"
                          className={cn(
                            "rounded-xl lg:rounded-2xl h-12 lg:h-14 font-black text-[8px] lg:text-[10px] uppercase transition-all duration-300", 
                            currentStatus === 'notGoing' ? "bg-red-600 text-black border-red-600 shadow-lg" : "hover:bg-red-600 hover:text-black hover:border-red-600"
                          )} 
                          onClick={() => handleRSVPAction('notGoing')}
                        >
                          NO
                        </Button>
                        <Button 
                          variant="outline"
                          className={cn(
                            "rounded-xl lg:rounded-2xl h-12 lg:h-14 font-black text-[8px] lg:text-[10px] uppercase transition-all duration-300", 
                            currentStatus === 'maybe' ? "bg-amber-500 text-black border-amber-500 shadow-lg" : "hover:bg-amber-500 hover:text-black hover:border-amber-500"
                          )} 
                          onClick={() => handleRSVPAction('maybe')}
                        >
                          Maybe
                        </Button>
                        <Button 
                          variant="outline"
                          className={cn(
                            "rounded-xl lg:rounded-2xl h-12 lg:h-14 font-black text-[8px] lg:text-[10px] uppercase transition-all duration-300", 
                            currentStatus === 'going' ? "bg-green-600 text-black border-green-600 shadow-lg" : "hover:bg-green-600 hover:text-black hover:border-green-600"
                          )} 
                          onClick={() => handleRSVPAction('going')}
                        >
                          Going
                        </Button>
                      </div>
                    </div>
                  </Tabs>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 p-8 lg:p-12 text-center space-y-6">
                    <div className="bg-primary/10 p-5 lg:p-6 rounded-2xl lg:rounded-[2rem] shadow-xl relative">
                      <Users className="h-8 w-8 lg:h-12 lg:w-12 text-primary" />
                      <div className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full border-2 border-background"><Lock className="h-3 w-3" /></div>
                    </div>
                    <div className="space-y-2 max-w-sm">
                      <h3 className="text-xl lg:text-2xl font-black tracking-tight">RSVP Tracking</h3>
                      <p className="text-muted-foreground font-bold text-xs lg:text-sm leading-relaxed">
                        Track squad confirmations and manage public sign-ups with a Pro plan.
                      </p>
                    </div>
                    <Button className="rounded-xl lg:rounded-2xl h-11 lg:h-12 px-8 lg:px-10 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20" onClick={purchasePro}>
                      Upgrade
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, promoteToRoster, isSuperAdmin, hasFeature, purchasePro, user } = useTeam();
  const db = useFirestore();

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc'));
  }, [activeTeam?.id, db]);
  
  const { data: rawEvents } = useCollection<TeamEvent>(eventsQuery);
  const events = useMemo(() => rawEvents || [], [rawEvents]);

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [mounted, setMounted] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [allowExternal, setAllowExternal] = useState(false);
  const [isRegRequired, setIsRegRequired] = useState(false);
  const [maxRegs, setMaxRegs] = useState('');
  const [customFormFields, setCustomFormFields] = useState<CustomFormField[]>([]);
  const [tournamentSchedule, setTournamentSchedule] = useState<any[]>([]);
  
  // Special Waiver State
  const [useSpecialWaiver, setUseSpecialWaiver] = useState(false);
  const [specialWaiverText, setSpecialWaiverText] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const calendarModifiers = useMemo(() => {
    if (!events) return {};
    const eventDays: Date[] = [];
    const tournamentDays: Date[] = [];
    events.forEach(e => {
      try {
        if (e.isTournament && e.endDate) {
          let curr = startOfDay(new Date(e.date));
          const last = endOfDay(new Date(e.endDate!));
          while (curr <= last) {
            tournamentDays.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
          }
        } else {
          eventDays.push(startOfDay(new Date(e.date)));
        }
      } catch (err) {}
    });
    return { hasEvent: eventDays, hasTournament: tournamentDays };
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    if (!date || !events) return [];
    const target = startOfDay(date);
    return events.filter(e => {
      if (e.isTournament && e.endDate) {
        try {
          return isWithinInterval(target, { start: startOfDay(new Date(e.date)), end: endOfDay(new Date(e.endDate)) });
        } catch (err) { return false; }
      }
      return startOfDay(new Date(e.date)).getTime() === target.getTime();
    });
  }, [date, events]);

  if (!mounted || !activeTeam) return null;
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canPlanTournaments = hasFeature('tournaments');
  const hasAttendanceTracking = hasFeature('attendance_tracking');

  const handleEdit = (event: TeamEvent) => {
    setEditingEvent(event); setIsTournamentMode(!!event.isTournament); setNewTitle(event.title);
    setNewDate(new Date(event.date).toISOString().split('T')[0]);
    if (event.endDate) setNewEndDate(new Date(event.endDate).toISOString().split('T')[0]);
    setNewTime(event.startTime); setNewLocation(event.location); setNewDescription(event.description);
    setAllowExternal(!!event.allowExternalRegistration); 
    setIsRegRequired(!!event.isRegistrationRequired);
    setMaxRegs(event.maxRegistrations?.toString() || '');
    setCustomFormFields(event.customFormFields || []);
    setTournamentSchedule(event.tournamentSchedule || []); 
    setUseSpecialWaiver(!!event.requiresSpecialWaiver);
    setSpecialWaiverText(event.specialWaiverText || '');
    setIsCreateOpen(true);
  };

  const handleCreateEvent = () => {
    if (!newTitle || !newDate) return;
    const payload: any = { 
      title: newTitle, 
      date: new Date(newDate).toISOString(), 
      startTime: newTime || 'TBD', 
      location: newLocation, 
      description: newDescription, 
      allowExternalRegistration: allowExternal, 
      isRegistrationRequired: isRegRequired,
      customFormFields: customFormFields,
      isTournament: isTournamentMode, 
      tournamentSchedule: tournamentSchedule.map((m, idx) => ({ ...m, id: `tm_${idx}_${Date.now()}` })),
      requiresSpecialWaiver: useSpecialWaiver,
      specialWaiverText: useSpecialWaiver ? specialWaiverText : ''
    };
    if (isTournamentMode && newEndDate) payload.endDate = new Date(newEndDate).toISOString();
    const regLimit = parseInt(maxRegs); if (!isNaN(regLimit)) payload.maxRegistrations = regLimit;
    if (editingEvent) updateEvent(editingEvent.id, payload); else addEvent(payload);
    setIsCreateOpen(false); resetForm();
  };

  const resetForm = () => { setEditingEvent(null); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setAllowExternal(false); setIsRegRequired(false); setMaxRegs(''); setCustomFormFields([]); setTournamentSchedule([]); setUseSpecialWaiver(false); setSpecialWaiverText(''); };

  const addFormField = (type: FormFieldType) => {
    const newField: CustomFormField = { id: `field_${Date.now()}`, label: 'New Field Label', type, required: false };
    setCustomFormFields([...customFormFields, newField]);
  };

  const updateFieldLabel = (id: string, label: string) => {
    setCustomFormFields(customFormFields.map(f => f.id === id ? { ...f, label } : f));
  };

  const removeFormField = (id: string) => {
    setCustomFormFields(customFormFields.filter(f => f.id !== id));
  };

  const addScheduleItem = () => {
    setTournamentSchedule([...tournamentSchedule, { date: newDate || new Date().toISOString().split('T')[0], time: '10:00 AM', label: 'Match 1' }]);
  };

  const updateScheduleItem = (idx: number, field: string, val: string) => {
    const n = [...tournamentSchedule]; n[idx][field] = val; setTournamentSchedule(n);
  };

  const removeScheduleItem = (idx: number) => {
    setTournamentSchedule(tournamentSchedule.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight">Schedule</h1>
          <p className="text-[10px] lg:text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Official Team Ledger</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 w-full sm:w-auto">
            <Button size="sm" className="flex-1 sm:flex-none rounded-full h-10 lg:h-11 px-4 lg:px-6 font-black uppercase text-[10px] tracking-widest shadow-lg" onClick={() => { setIsTournamentMode(false); setIsCreateOpen(true); }}><Plus className="h-3.5 w-3.5 mr-1.5 lg:mr-2" /> Match</Button>
            <Button size="sm" variant="secondary" className="flex-1 sm:flex-none rounded-full bg-black text-white h-10 lg:h-11 px-4 lg:px-6 font-black uppercase text-[10px] tracking-widest relative overflow-hidden" onClick={() => canPlanTournaments ? (setIsTournamentMode(true), setIsCreateOpen(true)) : purchasePro()}>
              <Trophy className="h-3.5 w-3.5 mr-1.5 lg:mr-2" /> Tourney
              {!canPlanTournaments && <div className="absolute top-0 right-0 bg-primary h-full w-1 flex flex-col items-center justify-center"><Lock className="h-2 w-2 text-white" /></div>}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-5xl rounded-3xl lg:rounded-[2.5rem] overflow-hidden p-0 max-h-[90vh] flex flex-col border-none shadow-2xl">
          <DialogTitle className="sr-only">Event Form Builder</DialogTitle>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full min-h-[500px]">
              <div className="lg:col-span-5 p-6 lg:p-8 lg:border-r space-y-4 lg:space-y-6 bg-primary/5">
                <DialogHeader>
                  <h2 className="text-xl lg:text-2xl font-black tracking-tight">{editingEvent ? "Update" : "New"} {isTournamentMode ? "Tournament" : "Match"}</h2>
                  <p className="font-black text-primary uppercase tracking-widest text-[8px] lg:text-[10px]">Logistics Hub</p>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Event Title</Label>
                    <Input placeholder="e.g. League Match" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-11 lg:h-12 rounded-xl font-black text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                      <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-11 lg:h-12 rounded-xl font-black text-[10px] lg:text-xs" />
                    </div>
                    {isTournamentMode ? (
                      <div className="space-y-1.5">
                        <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                        <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-11 lg:h-12 rounded-xl font-black text-[10px] lg:text-xs" />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Time</Label>
                        <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-11 lg:h-12 rounded-xl font-black text-[10px] lg:text-xs" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                    <Input placeholder="Stadium name..." value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-11 lg:h-12 rounded-xl font-black text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1">Notes</Label>
                    <Textarea placeholder="Instructions..." value={newDescription} onChange={e => setNewDescription(e.target.value)} className="min-h-[80px] rounded-xl font-bold text-xs" />
                  </div>
                </div>
              </div>
              
              <div className="lg:col-span-7 p-6 lg:p-8 space-y-6 flex flex-col justify-between bg-background">
                <Tabs defaultValue={isTournamentMode ? "schedule" : "registration"} className="flex-1">
                  <TabsList className="bg-muted/50 rounded-xl p-1 h-10 mb-6">
                    {isTournamentMode && <TabsTrigger value="schedule" className="font-black text-[8px] uppercase px-4">Daily Games</TabsTrigger>}
                    <TabsTrigger value="registration" className="font-black text-[8px] uppercase px-4">Reg Form</TabsTrigger>
                    {hasAttendanceTracking && <TabsTrigger value="waiver" className="font-black text-[8px] uppercase px-4">Waiver</TabsTrigger>}
                  </TabsList>

                  <TabsContent value="schedule" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tournament Ledger</Label>
                      <Button variant="outline" size="sm" className="h-8 font-black uppercase text-[8px]" onClick={addScheduleItem}>+ Add Game</Button>
                    </div>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {tournamentSchedule.length > 0 ? tournamentSchedule.map((item, idx) => (
                        <div key={idx} className="p-4 bg-muted/20 rounded-xl border border-black/5 space-y-3 group relative">
                          <div className="grid grid-cols-2 gap-3">
                            <Input type="date" value={item.date} onChange={e => updateScheduleItem(idx, 'date', e.target.value)} className="h-9 text-[10px] rounded-lg" />
                            <Input type="time" value={item.time} onChange={e => updateScheduleItem(idx, 'time', e.target.value)} className="h-9 text-[10px] rounded-lg" />
                          </div>
                          <Input placeholder="Game Label (e.g. Semi Finals)" value={item.label} onChange={e => updateScheduleItem(idx, 'label', e.target.value)} className="h-9 text-[10px] rounded-lg font-bold" />
                          <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 bg-white shadow-sm border rounded-full text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeScheduleItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      )) : (
                        <div className="text-center py-12 border-2 border-dashed rounded-xl opacity-30">
                          <p className="text-[10px] font-black uppercase">Schedule is empty</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="registration" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListPlus className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-black uppercase tracking-widest">Form Builder</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label htmlFor="req-reg" className="text-[10px] font-black uppercase tracking-widest opacity-60">Required?</Label>
                        <Checkbox id="req-reg" checked={isRegRequired} onCheckedChange={v => setIsRegRequired(!!v)} />
                      </div>
                    </div>

                    {isRegRequired && (
                      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest">Max Regs</Label>
                            <Input type="number" placeholder="Unlimited" value={maxRegs} onChange={e => setMaxRegs(e.target.value)} className="h-10 rounded-xl" />
                          </div>
                          <div className="flex items-center gap-3 self-end h-10 px-3 bg-muted/30 rounded-xl border">
                            <Checkbox id="ext-reg" checked={allowExternal} onCheckedChange={v => setAllowExternal(!!v)} />
                            <Label htmlFor="ext-reg" className="text-[9px] font-black uppercase cursor-pointer">Public Link?</Label>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Custom Fields</Label>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" className="h-7 text-[8px] font-black uppercase" onClick={() => addFormField('short_text')}>+ Text</Button>
                              <Button variant="ghost" size="sm" className="h-7 text-[8px] font-black uppercase" onClick={() => addFormField('checkbox')}>+ Check</Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                            {customFormFields.length > 0 ? customFormFields.map((field) => (
                              <div key={field.id} className="flex gap-2 items-center p-2 bg-muted/20 rounded-xl border group">
                                <Badge variant="outline" className="text-[7px] font-black h-5 uppercase shrink-0">{field.type.replace('_', ' ')}</Badge>
                                <Input 
                                  value={field.label} 
                                  onChange={e => updateFieldLabel(field.id, e.target.value)}
                                  className="h-8 text-xs font-bold bg-transparent border-none focus-visible:ring-0"
                                />
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeFormField(field.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )) : (
                              <div className="text-center py-8 bg-muted/10 rounded-xl border-2 border-dashed opacity-40">
                                <p className="text-[10px] font-black uppercase">No custom fields added</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="waiver" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-amber-600" />
                        <h3 className="text-sm font-black uppercase tracking-widest">Special Event Waiver</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label htmlFor="special-waiver" className="text-[10px] font-black uppercase tracking-widest opacity-60">Enable?</Label>
                        <Checkbox id="special-waiver" checked={useSpecialWaiver} onCheckedChange={v => setUseSpecialWaiver(!!v)} />
                      </div>
                    </div>

                    {useSpecialWaiver && (
                      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Waiver Terms & Conditions</Label>
                          <Textarea 
                            placeholder="Provide detailed legal terms for this specific event..." 
                            value={specialWaiverText} 
                            onChange={e => setSpecialWaiverText(e.target.value)}
                            className="min-h-[200px] rounded-2xl p-4 text-xs font-medium leading-relaxed bg-muted/10 border-2"
                          />
                          <p className="text-[9px] text-amber-600 font-bold italic ml-1 flex items-center gap-1.5"><Info className="h-3 w-3" /> All players must agree to these terms before they can RSVP "Going".</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                <Button className="w-full h-14 rounded-2xl text-base lg:text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-4" onClick={handleCreateEvent}>Save Event Hub</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-full p-1 h-11 lg:h-12 bg-muted/50 border-2 max-w-sm mx-auto">
          <TabsTrigger value="list" className="rounded-full h-full font-black text-[9px] lg:text-[10px] uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">List</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-full h-full font-black text-[9px] lg:text-[10px] uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-3 lg:space-y-4 mt-6 lg:mt-8">
          {events.length > 0 ? events.map((event) => {
            const currentRSVP = event.userRsvps?.[user?.id || ''];
            const showStatus = hasAttendanceTracking && currentRSVP;
            
            return (
              <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} promoteToRoster={promoteToRoster} onEdit={handleEdit} onDelete={(id) => { if(confirm("Delete?")) deleteEvent(id); }} hasAttendance={hasAttendanceTracking} purchasePro={purchasePro}>
                <Card className={cn("overflow-hidden hover:border-primary/30 transition-all duration-500 cursor-pointer group border-none shadow-sm hover:shadow-xl ring-1 ring-black/5 rounded-2xl lg:rounded-[2rem]", event.isTournament && "ring-primary/20")}>
                  <div className="flex items-stretch">
                    <div className={cn(
                      "w-16 sm:w-24 flex flex-col items-center justify-center border-r-2 shrink-0 transition-colors group-hover:bg-primary/10 p-2 lg:p-4", 
                      showStatus ? (currentRSVP === 'going' ? 'bg-green-50' : currentRSVP === 'maybe' ? 'bg-amber-50' : currentRSVP === 'notGoing' ? 'bg-red-50' : 'bg-primary/5') : 'bg-primary/5'
                    )}>
                      <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest mb-0.5 text-primary">{format(new Date(event.date), 'MMM')}</span>
                      <span className="text-xl lg:text-3xl font-black tracking-tighter text-primary">{format(new Date(event.date), 'dd')}</span>
                    </div>
                    <div className="flex-1 p-4 lg:p-6 space-y-2 lg:space-y-3 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5 lg:space-y-1 min-w-0">
                          <div className="flex gap-2 mb-1">
                            {event.isTournament && <Badge className="bg-primary text-white font-black text-[7px] lg:text-[8px] uppercase tracking-widest px-1.5 h-3.5 lg:h-4 border-none shadow-sm">Tourney</Badge>}
                            {event.requiresSpecialWaiver && <Badge className="bg-amber-500 text-white font-black text-[7px] lg:text-[8px] uppercase tracking-widest px-1.5 h-3.5 lg:h-4 border-none shadow-sm">Waiver</Badge>}
                            {event.isRegistrationRequired && <Badge variant="outline" className="text-[7px] lg:text-[8px] font-black uppercase tracking-widest px-1.5 h-3.5 lg:h-4 border-blue-600/30 text-blue-600">Register</Badge>}
                            {showStatus && (
                              <Badge className={cn("text-[7px] lg:text-[8px] font-black uppercase px-1.5 h-3.5 lg:h-4 border-none", currentRSVP === 'going' ? 'bg-green-600' : currentRSVP === 'maybe' ? 'bg-amber-500' : 'bg-red-600')}>
                                {currentRSVP === 'going' ? 'Going' : currentRSVP === 'maybe' ? 'Maybe' : 'No'}
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-black text-base lg:text-xl leading-tight group-hover:text-primary transition-colors truncate pr-4">{event.title}</h3>
                        </div>
                        <ChevronRight className="h-4 w-4 text-primary opacity-30 shrink-0 mt-1" />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] lg:text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center"><Clock className="h-3 w-3 lg:h-4 lg:w-4 mr-1.5 text-primary shrink-0" />{event.startTime}</div>
                        {event.location && <div className="flex items-center truncate max-w-[120px] sm:max-w-[200px]"><MapPin className="h-3 w-3 lg:h-4 lg:w-4 mr-1.5 text-primary shrink-0" />{event.location}</div>}
                      </div>
                    </div>
                  </div>
                </Card>
              </EventDetailDialog>
            );
          }) : (
            <div className="text-center py-20 lg:py-24 border-2 border-dashed rounded-[2rem] lg:rounded-[3rem] bg-muted/10"><p className="text-muted-foreground font-black uppercase tracking-widest text-[10px] lg:text-xs opacity-40">No events scheduled.</p></div>
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-6 lg:mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <Card className="lg:col-span-2 border-none shadow-xl rounded-3xl lg:rounded-[3rem] overflow-hidden">
              <CardContent className="p-4 lg:p-8">
                <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md mx-auto w-full max-w-md lg:max-w-none" modifiers={calendarModifiers} modifiersClassNames={{ hasEvent: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-primary after:rounded-full", hasTournament: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-2 lg:w-3 after:h-1 after:bg-black after:rounded-full" }} />
              </CardContent>
            </Card>
            <div className="space-y-4 lg:space-y-6">
              <h3 className="font-black text-base lg:text-lg px-2">{date ? format(date, 'MMMM d') : 'Select date'}</h3>
              <div className="space-y-3 lg:space-y-4">
                {selectedDayEvents.length > 0 ? selectedDayEvents.map(event => {
                  const currentRSVP = event.userRsvps?.[user?.id || ''];
                  const showStatus = hasAttendanceTracking && currentRSVP;
                  
                  return (
                    <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} promoteToRoster={promoteToRoster} onEdit={handleEdit} onDelete={(id) => { if(confirm("Delete?")) deleteEvent(id); }} hasAttendance={hasAttendanceTracking} purchasePro={purchasePro}>
                      <Card className="cursor-pointer hover:scale-[1.02] transition-all border-none shadow-sm rounded-xl lg:rounded-2xl p-3 lg:p-4 space-y-1.5 lg:space-y-2 ring-1 ring-black/5 relative overflow-hidden bg-white">
                        {showStatus && (
                          <div className={cn("absolute top-0 right-0 p-1.5 rounded-bl-xl", currentRSVP === 'going' ? 'bg-green-600 text-white' : currentRSVP === 'maybe' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white')}>
                            {currentRSVP === 'going' ? <CalendarCheck className="h-3 w-3" /> : currentRSVP === 'maybe' ? <CircleHelp className="h-3 w-3" /> : <CalendarX className="h-3 w-3" />}
                          </div>
                        )}
                        <span className="text-[7px] lg:text-[8px] font-black uppercase text-primary tracking-[0.2em]">{event.isTournament ? "TOURNAMENT" : "MATCH"}</span>
                        <h4 className="font-black text-sm lg:text-base leading-tight truncate">{event.title}</h4>
                        <p className="text-[9px] lg:text-[10px] font-black text-muted-foreground uppercase">{event.startTime} • {event.location || 'TBD'}</p>
                      </Card>
                    </EventDetailDialog>
                  );
                }) : (
                  <div className="p-8 lg:p-10 text-center border-2 border-dashed rounded-2xl lg:rounded-3xl opacity-40">
                    <CalendarDays className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-center">Open Date</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
