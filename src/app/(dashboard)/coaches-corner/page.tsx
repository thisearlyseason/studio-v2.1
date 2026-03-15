
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, TeamDocument, Member, TeamIncident } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  PenTool, 
  FileSignature, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Search, 
  ShieldCheck,
  Loader2,
  FileText,
  ShieldAlert,
  Edit3,
  Settings,
  Info,
  Shield
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DEFAULT_PROTOCOLS = [
  { id: 'default_medical', title: 'Medical Clearance', type: 'waiver' },
  { id: 'default_travel', title: 'Travel Consent', type: 'waiver' },
  { id: 'default_parental', title: 'Parental Waiver', type: 'waiver' },
  { id: 'default_photography', title: 'Photography Release', type: 'waiver' },
  { id: 'default_tournament', title: 'Tournament Waiver', type: 'tournament_waiver' }
];

function IncidentLog({ teamId }: { teamId: string }) {
  const { addIncident, deleteIncident } = useTeam();
  const db = useFirestore();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', date: format(new Date(), 'yyyy-MM-dd'), location: '',
    peopleInvolved: '', description: '', outcome: '',
    emergencyServicesCalled: false, contactInfo: '', witnessInfo: ''
  });

  const incidentsQuery = useMemoFirebase(() => (db && teamId) ? query(collection(db, 'teams', teamId, 'incidents'), orderBy('createdAt', 'desc')) : null, [db, teamId]);
  const { data: incidents } = useCollection<TeamIncident>(incidentsQuery);

  const handleSubmit = async () => {
    if (!form.title || !form.description) return;
    await addIncident(form);
    setIsAddOpen(false);
    setForm({ title: '', date: format(new Date(), 'yyyy-MM-dd'), location: '', peopleInvolved: '', description: '', outcome: '', emergencyServicesCalled: false, contactInfo: '', witnessInfo: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-black uppercase tracking-tight">Incident Intelligence</h2>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="rounded-xl h-11 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4 mr-2" /> Log Incident
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {incidents?.map(incident => (
          <Card key={incident.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group hover:ring-primary/20 transition-all">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <Badge variant={incident.emergencyServicesCalled ? 'destructive' : 'secondary'} className="font-black text-[8px] uppercase">{incident.emergencyServicesCalled ? 'Critical' : 'Routine'}</Badge>
                    <span className="text-[10px] font-black text-muted-foreground uppercase">{incident.date} • {incident.location}</span>
                  </div>
                  <h3 className="font-black text-xl uppercase tracking-tight">{incident.title}</h3>
                  <p className="text-sm font-medium text-muted-foreground leading-relaxed italic">"{incident.description}"</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] font-bold uppercase tracking-widest pt-4 border-t">
                    <div className="space-y-1"><p className="opacity-40">Personnel Involved</p><p>{incident.peopleInvolved}</p></div>
                    <div className="space-y-1"><p className="opacity-40">Final Outcome</p><p>{incident.outcome}</p></div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:bg-destructive/5 self-start" onClick={() => deleteIncident(incident.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!incidents || incidents.length === 0) && <div className="py-20 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40"><ShieldAlert className="h-12 w-12 mx-auto mb-4" /><p className="text-sm font-black uppercase tracking-widest">No safety incidents reported.</p></div>}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogTitle className="sr-only">Incident Registration</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-10 space-y-8 overflow-y-auto max-h-[90vh]">
            <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Official Incident Report</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Report Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Date of Incident</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Location</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">People Involved</Label><Input value={form.peopleInvolved} onChange={e => setForm({...form, peopleInvolved: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
              <div className="col-span-full space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Incident Narrative</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="h-32 border-2 rounded-xl" /></div>
              <div className="col-span-full space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Final Outcome</Label><Input value={form.outcome} onChange={e => setForm({...form, outcome: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border col-span-full">
                <Switch checked={form.emergencyServicesCalled} onCheckedChange={v => setForm({...form, emergencyServicesCalled: v})} />
                <Label className="text-[10px] font-black uppercase tracking-widest">Emergency Services Called?</Label>
              </div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Contact Information</Label><Input value={form.contactInfo} onChange={e => setForm({...form, contactInfo: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Witness Testimony</Label><Input value={form.witnessInfo} onChange={e => setForm({...form, witnessInfo: e.target.value})} className="h-12 border-2 rounded-xl" /></div>
            </div>
            <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleSubmit}>Commit Official Report</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CoachesCornerPage() {
  const { activeTeam, isStaff, createTeamDocument, updateTeamDocument, deleteTeamDocument, db } = useTeam();
  const [activeTab, setActiveTab] = useState('compliance');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'], isActive: true });

  const docsQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc')) : null, [activeTeam?.id, db]);
  const { data: allDocuments } = useCollection<TeamDocument>(docsQuery);
  
  const documents = useMemo(() => allDocuments?.filter(d => !DEFAULT_PROTOCOLS.some(p => p.id === d.id)) || [], [allDocuments]);
  const teamProtocols = useMemo(() => allDocuments?.filter(d => DEFAULT_PROTOCOLS.some(p => p.id === d.id)) || [], [allDocuments]);

  if (!isStaff) return <div className="py-24 text-center opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /><h1 className="text-2xl font-black mt-4 uppercase tracking-widest">Staff Access Restricted</h1></div>;

  const openEdit = (doc: any) => {
    setEditingDocId(doc.id);
    setNewDoc({ title: doc.title, content: doc.content, type: doc.type, assignedTo: doc.assignedTo || ['all'], isActive: doc.isActive ?? true });
    setIsCreateOpen(true);
  };

  const handleToggleProtocol = async (proto: any, active: boolean) => {
    // If it doesn't exist in Firestore yet, create it with the default content
    const existing = teamProtocols.find(d => d.id === proto.id);
    if (!existing) {
      const fullProto = DEFAULT_PROTOCOLS.find(p => p.id === proto.id);
      await createTeamDocument({ ...fullProto, isActive: active, assignedTo: ['all'] });
    } else {
      await updateTeamDocument(proto.id, { isActive: active });
    }
    toast({ title: `Protocol ${active ? 'Activated' : 'Deactivated'}` });
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/50 rounded-xl h-auto p-1 border-2 w-full md:w-auto flex-wrap gap-1 shadow-sm">
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Compliance</TabsTrigger>
            <TabsTrigger value="safety" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Safety Hub</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} className="mt-0">
        <TabsContent value="compliance" className="space-y-10 mt-0">
          <section className="space-y-6 pt-4">
            <div className="flex items-center gap-3 px-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Institutional Protocols</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEFAULT_PROTOCOLS.map(proto => {
                const activeDoc = teamProtocols.find(d => d.id === proto.id);
                const isActive = activeDoc ? (activeDoc.isActive ?? true) : false;
                
                return (
                  <Card key={proto.id} className={cn("rounded-3xl border-none shadow-sm p-6 flex flex-col justify-between group transition-all", isActive ? "bg-white ring-1 ring-black/5" : "bg-muted/20 opacity-60")}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="bg-primary/5 p-3 rounded-2xl shadow-sm border"><CheckCircle2 className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground/30")} /></div>
                      <Switch checked={isActive} onCheckedChange={(v) => handleToggleProtocol(proto, v)} />
                    </div>
                    <div className="space-y-1 mb-4">
                      <p className="font-black text-sm uppercase">{proto.title}</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">System Mandate</p>
                    </div>
                    <Button variant="ghost" size="sm" className="w-full font-black text-[9px] uppercase tracking-widest border border-muted-foreground/10 hover:bg-primary/5" onClick={() => openEdit(activeDoc || proto)}>
                      <Edit3 className="h-3 w-3 mr-2" /> Edit Legal Text
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>

          <div className="space-y-6 pt-10 border-t">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-primary" />
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Custom Documents & Waivers</h2>
              </div>
              <Button onClick={() => { setEditingDocId(null); setNewDoc({ title: '', content: '', type: 'waiver', assignedTo: ['all'], isActive: true }); setIsCreateOpen(true); }} className="h-11 px-6 rounded-xl font-black shadow-lg shadow-primary/20 transition-all active:scale-95">
                <Plus className="h-4 w-4 mr-2" /> New Document
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {documents.map(doc => (
                <Card key={doc.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group transition-all hover:shadow-xl hover:ring-primary/20">
                  <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="bg-primary/5 p-4 rounded-2xl text-primary transition-transform group-hover:scale-110">
                        <PenTool className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-xl uppercase tracking-tight leading-none group-hover:text-primary transition-colors">{doc.title}</h3>
                          {!doc.isActive && <Badge variant="secondary" className="text-[7px] font-black uppercase">INACTIVE</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2">
                          <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {doc.signatureCount} Signed</span>
                          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-primary/5" onClick={() => openEdit(doc)}><Edit3 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteTeamDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {documents.length === 0 && (
                <div className="py-20 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
                  <FileText className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest">No custom documents established.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="safety" className="mt-0">
          {activeTeam && <IncidentLog teamId={activeTeam.id} />}
        </TabsContent>
      </Tabs>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogTitle className="sr-only">Document Architect Protocol</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingDocId ? 'Update' : 'Launch'} Protocol</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Strategic compliance document creation</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Document Title</Label>
                <Input value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="h-14 rounded-xl border-2 font-black text-lg focus:border-primary/20 transition-all" placeholder="e.g. Media Release Waiver" disabled={editingDocId?.startsWith('default_')} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Content</Label>
                <Textarea value={newDoc.content} onChange={e => setNewDoc({...newDoc, content: e.target.value})} className="min-h-[250px] rounded-2xl border-2 font-medium p-6 bg-muted/10 focus:bg-white transition-all resize-none" placeholder="Define the legal terms or coordination instructions..." />
              </div>
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-black uppercase">Active Status</Label>
                  <p className="text-[8px] font-bold text-muted-foreground uppercase">Deactivating hides this from parents/players</p>
                </div>
                <Switch checked={newDoc.isActive} onCheckedChange={v => setNewDoc({...newDoc, isActive: v})} />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button className="w-full h-16 rounded-[2rem] font-black text-lg uppercase shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={async () => { if(editingDocId) await updateTeamDocument(editingDocId, newDoc); else await createTeamDocument(newDoc); setIsCreateOpen(false); }}>
                {editingDocId ? 'Commit Synchronization' : 'Deploy Protocol to Roster'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
