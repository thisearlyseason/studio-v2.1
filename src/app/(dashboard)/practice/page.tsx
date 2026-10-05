"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Search, 
  Dumbbell, 
  Clock, 
  Calendar, 
  ChevronRight, 
  Trash2, 
  Edit2, 
  Users, 
  Trophy,
  Activity,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  GraduationCap
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { useTeam, PracticeTemplate, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { EventDetailDialog } from '../events/EventDetailDialog';
import { PlaybookPanel } from '@/components/practice/PlaybookPanel';
import { PracticeCover } from '@/components/practice/PracticeMedia';
import { PracticeTemplateReader, type PracticeReaderDrill } from '@/components/practice/PracticeTemplateReader';
import { validatePracticeTemplate } from '@/lib/practice-content-policy';

export default function PracticeManagementPage() {
  const { 
    activeTeam, 
    activeTeamEvents, 
    isStaff, 
    isPro, 
    purchasePro, 
    addPracticeTemplate, 
    updatePracticeTemplate, 
    deletePracticeTemplate,
    updateRSVP,
    deleteEvent,
    members 
  } = useTeam();
  const db = useFirestore();

  const [viewingTemplateId, setViewingTemplateId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PracticeTemplate | null>(null);
  const [activeView, setActiveView] = useState<'practice' | 'playbook'>('practice');
  
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedDrills, setSelectedDrills] = useState<string[]>([]);

  // Fetch Playbook Drills for template selection
  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'drills'), orderBy('title', 'asc'));
  }, [activeTeam?.id, db]);
  const { data: teamDrills, isLoading: isDrillsLoading, error: drillsError } = useCollection<PracticeReaderDrill>(drillsQuery);

  // Fetch Practice Templates
  const templatesQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'practice_templates'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: templates, isLoading: isTemplatesLoading } = useCollection<PracticeTemplate>(templatesQuery);

  // Derive "Actual Practices" from team events
  const practiceEvents = useMemo(() => {
    return (activeTeamEvents || [])
      .filter(e => e.eventType === 'practice')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeTeamEvents]);

  const filteredTemplates = useMemo(() => {
    return (templates || []).filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [templates, searchTerm]);

  const handleSaveTemplate = async () => {
    if (!activeTeam) return;
    const validationError = validatePracticeTemplate({ title: newTitle, description: newDesc, drillIds: selectedDrills }, teamDrills || []);
    if (validationError) {
      toast({
        title: 'Invalid Protocol',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }
    try {
      const payload = {
        title: newTitle.trim(),
        description: newDesc,
        drillIds: selectedDrills
      };

      if (editingTemplate) {
        await updatePracticeTemplate(editingTemplate.id, payload);
        toast({ title: "Template Optimized", description: "Practice protocol has been updated." });
      } else {
        await addPracticeTemplate(payload);
        toast({ title: "Template Published", description: "Reusable practice protocol is now live." });
      }
      setIsCreateOpen(false);
      resetForm();
    } catch (e) {
      toast({ title: "Operation Failed", variant: "destructive" });
    }
  };

  const handleDeleteTemplate = async (template: PracticeTemplate) => {
    const assignedEvents = (activeTeamEvents || []).filter(event => event.practiceTemplateId === template.id);
    if (assignedEvents.length > 0) {
      toast({
        title: 'Protocol Is In Use',
        description: `Remove this protocol from ${assignedEvents.length} assigned practice ${assignedEvents.length === 1 ? 'event' : 'events'} before deleting it.`,
        variant: 'destructive',
      });
      return;
    }
    try {
      await deletePracticeTemplate(template.id);
      toast({ title: 'Protocol Deleted', description: 'The unused practice protocol was removed.' });
    } catch (error: any) {
      toast({ title: 'Delete Failed', description: error?.message || 'The protocol could not be deleted.', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewDesc('');
    setSelectedDrills([]);
    setEditingTemplate(null);
  };

  const openEdit = (template: PracticeTemplate) => {
    setEditingTemplate(template);
    setNewTitle(template.title);
    setNewDesc(template.description);
    setSelectedDrills(template.drillIds || []);
    setIsCreateOpen(true);
  };

  if (!isPro) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full rounded-[3.5rem] border-none shadow-2xl bg-white overflow-hidden ring-1 ring-black/5">

          <div className="p-10 text-center space-y-6">
            <div className="mx-auto w-20 h-20 bg-primary/5 rounded-[2rem] flex items-center justify-center ring-1 ring-primary/10">
              <Lock className="h-10 w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase tracking-tight">Tactical Practice Engine</h3>
              <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                Advanced practice templates, drill synchronization, and institutional training archives require an Elite Pro subscription.
              </p>
            </div>
            <Button 
              onClick={purchasePro}
              className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-xl shadow-primary/20"
            >
              Unlock Elite Protocols
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Training workspace</Badge>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Practice & Playbook</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">Plan sessions and keep your team’s drills, plays, and media together.</p>
        </div>
        {isStaff && activeView === 'practice' && (
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="rounded-full h-12 px-8 font-black uppercase text-xs shadow-xl shadow-primary/20">
            <Plus className="h-5 w-5 mr-2" /> Design Template
          </Button>
        )}
      </div>

      <div className="inline-flex w-full max-w-md items-center rounded-2xl border bg-muted/30 p-1" role="tablist" aria-label="Practice workspace views">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'practice'}
          onClick={() => setActiveView('practice')}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black uppercase transition-colors",
            activeView === 'practice' ? "bg-black text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Dumbbell className="h-4 w-4" /> Practice Planner
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'playbook'}
          onClick={() => setActiveView('playbook')}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black uppercase transition-colors",
            activeView === 'playbook' ? "bg-black text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <GraduationCap className="h-4 w-4" /> Playbook
        </button>
      </div>

      {activeView === 'playbook' ? (
        <PlaybookPanel embedded />
      ) : (
        <>

      <div className={cn("grid gap-8 min-w-0", isStaff ? "grid-cols-1" : "grid-cols-1 max-w-3xl mx-auto")}>
        {isStaff && (
          /* Left Column: Templates */
          <div className="min-w-0 space-y-8">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-2">
            <h2 className="text-2xl font-black tracking-tight">Practice Planner</h2>
            <div className="relative w-full xl:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Search practices..." 
                className="h-12 pl-9 rounded-2xl bg-muted/30 border-none text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {filteredTemplates.length > 0 ? filteredTemplates.map(template => (
              <Card key={template.id} className="group rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 overflow-hidden bg-white min-w-0 hover:shadow-xl transition-shadow">
                <button type="button" aria-label={`View practice: ${template.title}`} onClick={() => setViewingTemplateId(template.id)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary">
                  <div className="relative">
                    <PracticeCover drill={(template.drillIds || []).map(id => teamDrills?.find(drill => drill.id === id)).find(drill => drill?.coverImageUrl || drill?.videoUrl || drill?.url || drill?.additionalMedia?.length)} title={template.title} />
                    <Badge className="absolute top-4 left-4 rounded-full bg-primary text-white px-3 py-1">Practice plan</Badge>
                    <Badge className="absolute top-4 right-4 rounded-full bg-black/75 text-white px-3 py-1">{template.drillIds?.length || 0} {(template.drillIds?.length || 0) === 1 ? 'drill' : 'drills'}</Badge>
                  </div>
                  <div className="p-6 space-y-3">
                  <h3 className="text-xl font-bold leading-snug break-words">{template.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{template.description || 'No practice objective provided.'}</p>
                  <div className="flex flex-wrap gap-2">{Array.from(new Set((template.drillIds || []).map(id => teamDrills?.find(drill => drill.id === id)).flatMap(drill => drill ? [drill.category || drill.type || 'Drill protocol', ...(drill.estimatedTime ? [String(drill.estimatedTime)] : [])] : []))).map(label => <Badge key={label} variant="secondary" className="rounded-full px-3 py-1">{label}</Badge>)}</div>
                  <span className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary">View practice <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
                  </div>
                </button>
                {isStaff && <div className="flex flex-wrap gap-2 border-t px-4 py-2">
                  <Button aria-label={`Edit ${template.title}`} variant="ghost" className="min-h-11 gap-2" onClick={() => openEdit(template)}><Edit2 className="h-4 w-4" /> Edit</Button>
                  <Button aria-label={`Delete ${template.title}`} variant="ghost" className="min-h-11 gap-2 text-red-600" onClick={() => handleDeleteTemplate(template)}><Trash2 className="h-4 w-4" /> Delete</Button>
                </div>}
              </Card>
            )) : (
              <div className="col-span-full py-20 text-center space-y-4 bg-muted/20 rounded-[3rem] border-2 border-dashed">
                <Info className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">No practice protocols defined.</p>
              </div>
            )}
          </div>
          </div>
        )}

        {/* Column: Recent Activity / Itinerary */}
        <div className={cn("space-y-8 min-w-0", !isStaff && "w-full")}>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Scheduled practices</h2>
          <div className="space-y-4">
            {practiceEvents.length > 0 ? practiceEvents.slice(0, 5).map(event => (
              <EventDetailDialog 
                key={event.id}
                event={event}
                updateRSVP={updateRSVP}
                isAdmin={isStaff}
                onEdit={() => {}}
                onDelete={deleteEvent}
                members={members}
                defaultTab="plan"
              >
                <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg hover:-translate-y-0.5 transition-all group overflow-hidden bg-white cursor-pointer">
                  <div className="flex items-stretch min-h-28">
                    <div className="w-24 bg-black text-white flex flex-col items-center justify-center shrink-0 transition-colors group-hover:bg-primary">
                      <span className="text-[8px] font-black uppercase opacity-60 leading-none">{format(event.date.includes('T') ? parseISO(event.date) : new Date(event.date.replace(/-/g, '/')), 'MMM')}</span>
                      <span className="text-3xl font-black leading-none">{format(event.date.includes('T') ? parseISO(event.date) : new Date(event.date.replace(/-/g, '/')), 'dd')}</span>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge className="bg-primary/10 text-primary border-none text-[8px] uppercase font-black px-2 h-5">Practice</Badge>
                        {(event.drillIds?.length || 0) > 0 && (
                          <Badge variant="outline" className="text-[8px] font-black uppercase h-5 border-primary/20 text-primary">
                            {event.drillIds!.length} Protocol{event.drillIds!.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-black text-base uppercase break-words group-hover:text-primary transition-colors text-foreground">{event.title}</h4>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                        <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 opacity-60">
                          <Clock className="h-3 w-3" /> {event.startTime || 'TBD'}
                        </p>
                        <span className="text-[9px] font-black text-primary uppercase">
                          {(event.drillIds?.length || 0) > 0 ? 'View Tactical Plan →' : 'No plan assigned'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </EventDetailDialog>
            )) : (
              <div className="py-10 text-center opacity-40 italic text-[9px] font-black uppercase">No recent training recorded.</div>
            )}
          </div>


          {isStaff && (
            <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 space-y-4 relative overflow-hidden group">
               <Trophy className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12 transition-transform duration-700 group-hover:scale-110" />
               <div className="relative z-10 space-y-4">
                 <Badge className="bg-primary text-white border-none font-black text-[8px]">COMMAND INTEL</Badge>
                 <h3 className="text-xl font-black uppercase leading-tight tracking-tighter break-words">Drill Synchronization</h3>
                 <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                   When a template is selected during event creation, all associated tactical drills are automatically injected into the squad's itinerary.
                 </p>
               </div>
            </Card>
          )}
        </div>
      </div>

      <PracticeTemplateReader
        template={templates?.find(template => template.id === viewingTemplateId) || null}
        drills={teamDrills || []}
        loading={isDrillsLoading}
        error={Boolean(drillsError)}
        onClose={() => setViewingTemplateId(null)}
        onEdit={isStaff ? () => {
          const template = templates?.find(item => item.id === viewingTemplateId);
          setViewingTemplateId(null);
          if (template) openEdit(template);
        } : undefined}
      />

      {/* Create/Edit Template Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-2xl p-0 sm:rounded-[3rem] border-none shadow-2xl bg-white text-foreground overflow-y-auto max-h-[90vh] custom-scrollbar">
          <div className="bg-black text-white p-8 lg:p-10 space-y-2">
            <DialogTitle className="font-black text-2xl uppercase tracking-tighter">
              {editingTemplate ? 'Optimize Protocol' : 'Develop Protocol'}
            </DialogTitle>
            <DialogDescription className="text-white/40 text-[10px] font-black uppercase tracking-widest">
              {editingTemplate ? 'Modify an existing institutional training block.' : 'Curate a new tactical block for routine squad deployment.'}
            </DialogDescription>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Protocol Title</Label>
                <Input 
                  placeholder="e.g. Infield Foundations & Double Plays" 
                  className="h-14 rounded-2xl border-2 font-black text-lg" 
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Strategic Objective</Label>
                <Textarea 
                  placeholder="Describe the overall goal of this training block..." 
                  className="rounded-2xl border-2 font-medium min-h-[100px] p-4 resize-none"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t">
              <div className="flex items-center justify-between px-1">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Injected Drills</Label>
                  <p className="text-[8px] font-bold text-muted-foreground uppercase">Select drills from your institutional playbook</p>
                </div>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none h-6 px-3 font-black uppercase text-[9px]">
                  {selectedDrills.length} SELECTED
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-2 border-2 border-dashed rounded-[2rem] bg-muted/20 custom-scrollbar">
                {teamDrills && teamDrills.length > 0 ? teamDrills.map((drill: any) => {
                  const isSelected = selectedDrills.includes(drill.id);
                  return (
                    <div 
                      key={drill.id} 
                      onClick={() => setSelectedDrills(prev => isSelected ? prev.filter(id => id !== drill.id) : [...prev, drill.id])}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300",
                        isSelected ? "bg-primary border-primary text-white shadow-lg scale-[0.98]" : "bg-white border-transparent hover:border-primary/20"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-xl shrink-0",
                        isSelected ? "bg-white/20 text-white" : "bg-primary/5 text-primary"
                      )}>
                        <Dumbbell className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-[10px] font-black uppercase truncate", isSelected ? "text-white" : "text-foreground")}>{drill.title}</p>
                        <p className={cn("text-[8px] font-bold uppercase opacity-60", isSelected ? "text-white/80" : "text-muted-foreground")}>{drill.category || 'Skill'}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    </div>
                  );
                }) : (
                  <div className="col-span-full py-10 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-30">Your Playbook is empty.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-8 bg-background border-t flex items-center justify-end gap-3 translate-y-[-1px]">
            <DialogClose asChild>
              <Button variant="outline" className="rounded-xl h-12 px-6 font-black uppercase text-[10px] border-2">Abort</Button>
            </DialogClose>
            <Button 
              className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl shadow-primary/20"
              onClick={handleSaveTemplate}
            >
              Secure Protocol
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
