"use client";

import React from 'react';
import {exportCurrentIncidents, downloadIncidentAttachment, incidentRequest} from '@/lib/incident-client';
import {toast} from '@/hooks/use-toast';
import { useTeam, TeamIncident } from '@/components/providers/team-provider';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ShieldAlert, ShieldCheck, Download } from 'lucide-react';
import { generateBrandedPDF } from '@/lib/pdf-utils';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

export function IncidentDetailDialog({ incident, isOpen, onOpenChange }: { incident: TeamIncident | null, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { firebaseUser } = useTeam();
  const [deletedAttachmentId, setDeletedAttachmentId] = React.useState('');
  if (!incident) return null;

  const handleDownloadPDF = async () => {
    try { await exportCurrentIncidents(incident.teamId, await firebaseUser.getIdToken(), 'pdf', [incident.id]); }
    catch (error) { toast({title:'Incident export failed',description:error instanceof Error ? error.message : 'Unable to export.',variant:'destructive'}); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[3.5rem] p-0 border-none shadow-2xl overflow-hidden sm:max-w-3xl bg-white text-foreground">
        <DialogTitle className="sr-only">Incident Audit: {incident.title}</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary"><ShieldAlert className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight truncate">{incident.title}</DialogTitle>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {(() => { try { return format(parseISO(incident.date), 'MMMM d, yyyy'); } catch { return incident.date; } })()} {incident.time && (() => { try { return format(parseISO(`${incident.date}T${incident.time}`), 'h:mm a'); } catch { return incident.time; } })()} • {incident.location}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge className={cn(
                  "border-none font-black text-[10px] uppercase px-4 h-7 shrink-0",
                  incident.emergencyServicesCalled ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "bg-muted text-muted-foreground"
                )}>
                  {incident.emergencyServicesCalled ? 'Critical Alert' : 'Routine Log'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Factual Narrative</h4>
                <div className="bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed">
                  <p className="text-sm font-medium leading-relaxed italic text-foreground/80 leading-relaxed">"{incident.description}"</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Environmental Context</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-muted/20 rounded-xl border-2 space-y-1">
                    <p className="text-[7px] font-black uppercase text-muted-foreground">Conditions</p>
                    <p className="text-[10px] font-bold uppercase">{incident.weatherConditions || 'Archived'}</p>
                  </div>
                  <div className="p-4 bg-muted/20 rounded-xl border-2 space-y-1">
                    <p className="text-[7px] font-black uppercase text-muted-foreground">Apparatus</p>
                    <p className="text-[10px] font-bold uppercase truncate">{incident.equipmentInvolved || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Treatment Records</h4>
                <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/10 shadow-inner">
                  <p className="text-sm font-bold leading-relaxed text-foreground/80">{incident.treatmentProvided || 'Not recorded'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Severity — full-width block below the 2-col grid, most prominent element in audit */}
          <Card className="bg-black text-white rounded-[2.5rem] p-6 space-y-4 relative overflow-hidden group border-none">
            <ShieldCheck className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Severity / Injury Type</p>
                <p className="text-2xl font-black uppercase">{incident.severity || 'Minor'}</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {incident.followUpRequired && (
                  <Badge className="bg-amber-400 text-black border-none font-black text-[9px] uppercase px-3 h-6">Action Items Pending</Badge>
                )}
                <Badge className={cn(
                  "border-none font-black text-[9px] uppercase px-3 h-6",
                  incident.emergencyServicesCalled ? "bg-red-600 text-white" : "bg-white/20 text-white"
                )}>
                  {incident.emergencyServicesCalled ? 'Emergency Services Called' : 'No Emergency Services'}
                </Badge>
              </div>
            </div>
          </Card>

          {incident.attachment && !incident.attachmentDeletedAt && deletedAttachmentId !== incident.id && <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={async()=>{try{await downloadIncidentAttachment(incident.teamId,incident.id,await firebaseUser.getIdToken(),incident.attachment!.name);}catch(error){toast({title:'Attachment download failed',description:error instanceof Error?error.message:'Unavailable',variant:'destructive'});}}}>Download supporting file</Button>
            <Button variant="outline" onClick={async()=>{try{await incidentRequest(incident.teamId,await firebaseUser.getIdToken(),'&incidentId='+encodeURIComponent(incident.id)+'&download=attachment',{method:'DELETE'});setDeletedAttachmentId(incident.id);}catch(error){toast({title:'Attachment deletion failed',description:error instanceof Error?error.message:'Unavailable',variant:'destructive'});}}}>Delete supporting file</Button>
          </div>}
          <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-2 font-black uppercase text-xs tracking-widest transition-all hover:bg-muted" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button className="flex-1 h-14 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" /> Download Institutional PDF
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
