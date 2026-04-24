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
  Lock
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

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PracticeTemplate | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedDrills, setSelectedDrills] = useState<string[]>([]);

  // Fetch Playbook Drills for template selection
  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'drills'), orderBy('title', 'asc'));
  }, [activeTeam?.id, db]);
  const { data: teamDrills, isLoading: isDrillsLoading } = useCollection(drillsQuery);

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
    if (!newTitle || !activeTeam) return;
    try {
      const payload = {
        title: newTitle,
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
          <div className="h-2 bg-primary w-full" />
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
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Training Logistics</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Practice Hub</h1>
        </div>
        {isStaff && (
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="rounded-full h-12 px-8 font-black uppercase text-xs shadow-xl shadow-primary/20">
            <Plus className="h-5 w-5 mr-2" /> Design Template
          </Button>
        )}
      </div>

      <div className={cn("grid gap-10", isStaff ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 max-w-3xl mx-auto")}>
        {isStaff && (
          /* Left Column: Templates */
          <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Reusable Protocols</h2>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input 
                placeholder="Search protocols..." 
                className="h-9 pl-9 rounded-xl bg-muted/30 border-none font-bold text-[10px] tracking-tight"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTemplates.length > 0 ? filteredTemplates.map(template => (
              <Card key={template.id} className="rounded-[2.5rem] border-none shadow-sm ring-1 ring-black/5 hover:ring-primary/20 hover:shadow-xl transition-all duration-500 overflow-hidden bg-white group">
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="p-3 bg-primary/5 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                      <Dumbbell className="h-6 w-6" />
                    </div>
                    {isStaff && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(template)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deletePracticeTemplate(template.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black uppercase tracking-tight leading-none truncate">{template.title}</h3>
                    <p className="text-xs font-medium text-muted-foreground line-clamp-2 leading-relaxed">
                      {template.description || "No strategic summary provided."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                    <Badge variant="secondary" className="bg-muted/50 text-[8px] font-black uppercase tracking-widest h-5">
                      {template.drillIds?.length || 0} Drills
                    </Badge>
                    <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest h-5 border-primary/20 text-primary">
                      Ready for Deployment
                    </Badge>
                  </div>
                </CardContent>
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
        <div className={cn("space-y-8", !isStaff && "w-full")}>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Institutional Itinerary</h2>
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
                  <div className="flex items-stretch h-28">
                    <div className="w-24 bg-black text-white flex flex-col items-center justify-center shrink-0 transition-colors group-hover:bg-primary">
                      <span className="text-[8px] font-black uppercase opacity-60 leading-none">{format(event.date.includes('T') ? parseISO(event.date) : new Date(event.date.replace(/-/g, '/')), 'MMM')}</span>
                      <span className="text-3xl font-black leading-none">{format(event.date.includes('T') ? parseISO(event.date) : new Date(event.date.replace(/-/g, '/')), 'dd')}</span>
                    </div>
                    <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-primary/10 text-primary border-none text-[8px] uppercase font-black px-2 h-5">Practice</Badge>
                        {(event.drillIds?.length || 0) > 0 && (
                          <Badge variant="outline" className="text-[8px] font-black uppercase h-5 border-primary/20 text-primary">
                            {event.drillIds!.length} Protocol{event.drillIds!.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-black text-base uppercase truncate group-hover:text-primary transition-colors text-foreground">{event.title}</h4>
                      <div className="flex items-center justify-between mt-1">
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
                 <h3 className="text-xl font-black uppercase leading-tight tracking-tighter">Drill Synchronization</h3>
                 <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                   When a template is selected during event creation, all associated tactical drills are automatically injected into the squad's itinerary.
                 </p>
               </div>
            </Card>
          )}
        </div>
      </div>

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
    </div>
  );
}
