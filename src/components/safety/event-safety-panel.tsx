"use client";

import React, { useMemo, useState } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { useTeam, TeamIncident } from '@/components/providers/team-provider';
import { useCollection, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

type Props = { kind: 'league' | 'tournament'; eventId: string; eventName: string; divisions?: string[] };

export function EventSafetyPanel({ kind, eventId, eventName, divisions = [] }: Props) {
  const { activeTeam, db, isStaff, user, addIncident, updateIncident } = useTeam();
  const [isOpen, setIsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('');
  const [participantFilter, setParticipantFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [form, setForm] = useState({
    participantName: '', participantTeamName: '', division: '', gameId: '', date: format(new Date(), 'yyyy-MM-dd'), time: format(new Date(), 'HH:mm'),
    location: '', incidentType: 'injury', injuryType: '', description: '', actionsTaken: '', treatmentProvided: '',
    emergencyServicesCalled: false, parentGuardianContacted: false, followUpRequired: false, followUpNotes: '', status: 'open', supportingDocumentUrl: '',
  });
  const incidentsQuery = useMemoFirebase(() => activeTeam?.id && db ? query(collection(db, 'teams', activeTeam.id, 'incidents'), orderBy('date', 'desc')) : null, [activeTeam?.id, db]);
  const { data } = useCollection<TeamIncident>(incidentsQuery);
  const incidents = useMemo(() => (data || []).filter(incident =>
    (kind === 'league' ? incident.leagueId : incident.tournamentId) === eventId &&
    (statusFilter === 'all' || (incident.status || 'open') === statusFilter) &&
    (!teamFilter || (incident.participantTeamName || incident.teamName || '').toLowerCase().includes(teamFilter.toLowerCase())) &&
    (divisionFilter === 'all' || incident.division === divisionFilter) &&
    (!dateFilter || incident.date === dateFilter) &&
    (!participantFilter || (incident.participantName || incident.involvedPeople || '').toLowerCase().includes(participantFilter.toLowerCase()))
  ), [data, dateFilter, divisionFilter, eventId, kind, participantFilter, statusFilter, teamFilter]);

  if (!isStaff && user?.role !== 'superadmin' && user?.role !== 'league_creator') return null;

  const save = async () => {
    if (!form.participantName || !form.date || !form.description) return;
    await addIncident({
      ...form, title: `${form.incidentType}: ${form.participantName}`, involvedPeople: form.participantName,
      ...(kind === 'league' ? { leagueId: eventId } : { tournamentId: eventId }),
      eventName, reportedByName: user?.name || user?.email || 'Organizer',
    });
    setIsOpen(false);
    toast({ title: 'Safety Report Logged', description: 'The private organizer incident record is now available for follow-up.' });
  };

  return <div className="space-y-6">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div><h3 className="text-2xl font-black uppercase">Injury / Incident Log</h3><p className="text-xs text-muted-foreground">Private organizer records for {eventName}.</p></div>
      <Button onClick={() => setIsOpen(true)}><Plus className="h-4 w-4 mr-2" />Log Incident</Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['all','open','monitoring','follow_up_required','resolved'].map(value => <SelectItem key={value} value={value}>{value.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select>
      <Input placeholder="Filter by team" value={teamFilter} onChange={event => setTeamFilter(event.target.value)} />
      <Input placeholder="Filter by participant" value={participantFilter} onChange={event => setParticipantFilter(event.target.value)} />
      <Select value={divisionFilter} onValueChange={setDivisionFilter}><SelectTrigger><SelectValue placeholder="Division" /></SelectTrigger><SelectContent><SelectItem value="all">All divisions</SelectItem>{divisions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
      <Input aria-label="Filter incidents by date" type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} />
    </div>
    <div className="grid gap-3">
      {incidents.map(incident => <Card key={incident.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-base">{incident.participantName || incident.involvedPeople || incident.title}</CardTitle><p className="text-xs text-muted-foreground">{incident.participantTeamName || incident.teamName} • {incident.division || 'No division'} • {incident.date} {incident.time || ''}</p></div><Badge>{(incident.status || 'open').replaceAll('_',' ')}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-sm">{incident.description}</p><div className="flex flex-wrap gap-2">{incident.followUpRequired && <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />Follow-up required</Badge>}{incident.emergencyServicesCalled && <Badge variant="destructive">Emergency services</Badge>}</div>{incident.supportingDocumentUrl && <a href={incident.supportingDocumentUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary underline">Supporting document</a>}{incident.status !== 'resolved' && <Button size="sm" variant="outline" onClick={() => activeTeam?.id && updateIncident(activeTeam.id, incident.id, { status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: user?.id })}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Mark Resolved</Button>}</CardContent></Card>)}
      {incidents.length === 0 && <div className="rounded-3xl border-2 border-dashed p-16 text-center text-sm text-muted-foreground">No incidents match these filters.</div>}
    </div>
    <Dialog open={isOpen} onOpenChange={setIsOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Log Safety Incident</DialogTitle></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><Label>Participant</Label><Input value={form.participantName} onChange={e => setForm({...form, participantName:e.target.value})} /></div><div><Label>Team</Label><Input value={form.participantTeamName} onChange={e => setForm({...form, participantTeamName:e.target.value})} /></div>
      <div><Label>Division</Label>{divisions.length ? <Select value={form.division} onValueChange={division => setForm({...form,division})}><SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger><SelectContent>{divisions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select> : <Input value={form.division} onChange={e => setForm({...form,division:e.target.value})} />}</div><div><Label>Game / Event</Label><Input value={form.gameId} onChange={e => setForm({...form,gameId:e.target.value})} /></div>
      <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} /></div><div><Label>Time</Label><Input type="time" value={form.time} onChange={e => setForm({...form,time:e.target.value})} /></div>
      <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({...form,location:e.target.value})} /></div><div><Label>Incident Type</Label><Input value={form.incidentType} onChange={e => setForm({...form,incidentType:e.target.value})} /></div>
      <div className="sm:col-span-2"><Label>Injury Type</Label><Input value={form.injuryType} onChange={e => setForm({...form,injuryType:e.target.value})} /></div><div className="sm:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></div>
      <div className="sm:col-span-2"><Label>Immediate Action Taken</Label><Textarea value={form.actionsTaken} onChange={e => setForm({...form,actionsTaken:e.target.value})} /></div><div className="sm:col-span-2"><Label>First Aid Provided</Label><Textarea value={form.treatmentProvided} onChange={e => setForm({...form,treatmentProvided:e.target.value})} /></div>
      <label className="flex items-center justify-between gap-3">Emergency services contacted<Switch checked={form.emergencyServicesCalled} onCheckedChange={value => setForm({...form,emergencyServicesCalled:value})} /></label><label className="flex items-center justify-between gap-3">Parent/guardian contacted<Switch checked={form.parentGuardianContacted} onCheckedChange={value => setForm({...form,parentGuardianContacted:value})} /></label>
      <label className="flex items-center justify-between gap-3">Follow-up required<Switch checked={form.followUpRequired} onCheckedChange={value => setForm({...form,followUpRequired:value,status:value?'follow_up_required':'open'})} /></label><div><Label>Status</Label><Select value={form.status} onValueChange={status => setForm({...form,status})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['open','monitoring','follow_up_required','resolved'].map(s => <SelectItem key={s} value={s}>{s.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2"><Label>Follow-up Notes</Label><Textarea value={form.followUpNotes} onChange={e => setForm({...form,followUpNotes:e.target.value})} /></div>
      <div className="sm:col-span-2"><Label>Supporting Document URL</Label><Input type="url" placeholder="https://…" value={form.supportingDocumentUrl} onChange={e => setForm({...form,supportingDocumentUrl:e.target.value})} /></div>
    </div><DialogFooter><Button onClick={save}>Save Private Report</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
