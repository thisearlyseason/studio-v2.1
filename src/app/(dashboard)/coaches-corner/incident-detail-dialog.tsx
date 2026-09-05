"use client";

import React from 'react';
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
  const { activeTeam } = useTeam();
  if (!incident) return null;

  const handleDownloadPDF = () => {
    generateBrandedPDF({
      title: "SQUAD SAFETY REPORT",
      subtitle: "INSTITUTIONAL ARCHIVE RECORD",
      filename: `INCIDENT_REPORT_${incident.date}_${incident.title.replace(/\s+/g, '_')}`
    }, (doc, startY) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Severity Label
      const severity = incident.severity || 'routine';
      const sevColors: Record<string, [number, number, number]> = {
        'critical': [220, 38, 38],
        'severe': [234, 88, 12],
        'moderate': [202, 138, 4],
        'minor': [22, 163, 74],
        'routine': [100, 100, 100]
      };
      const [r, g, b] = sevColors[severity.toLowerCase()] || [100, 100, 100];
      
      doc.setFillColor(r, g, b);
      doc.roundedRect(pageWidth - 60, startY - 25, 40, 8, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(severity.toUpperCase(), pageWidth - 40, startY - 20, { align: 'center' });

      // --- Content Section: Case Summary ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text("CASE SUMMARY: " + incident.title.toUpperCase(), 20, startY);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(20, startY + 3, pageWidth - 20, startY + 3);
      
      // --- Metadata Grid ---
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("REPORT DATE", 20, startY + 13);
      doc.text("INCIDENT DATE", 75, startY + 13);
      doc.text("LOCATION", 130, startY + 13);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(new Date().toLocaleDateString(), 20, startY + 18);
      doc.text(`${incident.date} ${incident.time || ''}`, 75, startY + 18);
      doc.text(incident.location || 'TBD', 130, startY + 18);

      // --- Technical Specs ---
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("ENVIRONMENT", 20, startY + 25);
      doc.text("APPARATUS / EQUIPMENT", 75, startY + 25);
      doc.text("REPORTED TO", 130, startY + 25);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(incident.weatherConditions || 'Recorded Environment', 20, startY + 29);
      doc.text(incident.equipmentInvolved || 'N/A', 75, startY + 29);
      doc.text(incident.reportedTo || 'Staff Registry', 130, startY + 29);

      // --- Primary Narrative ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text("FACTUAL NARRATIVE", 20, startY + 40);
      
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(incident.description, pageWidth - 40);
      doc.text(descLines, 20, startY + 48);
      
      let currentY = startY + 48 + (descLines.length * 6);
      
      // Involved Personnel
      if (incident.involvedPeople) {
        currentY += 10;
        doc.setFont('helvetica', 'bold');
        doc.text("INVOLVED PERSONNEL", 20, currentY);
        currentY += 8;
        doc.setFont('helvetica', 'normal');
        doc.text(incident.involvedPeople, 20, currentY);
      }
      
      // Immediate Treatment
      if (incident.treatmentProvided) {
        currentY += 15;
        doc.setFont('helvetica', 'bold');
        doc.text("TREATMENT & IMMEDIATE PROTOCOL", 20, currentY);
        currentY += 8;
        doc.setFont('helvetica', 'normal');
        const treatmentLines = doc.splitTextToSize(incident.treatmentProvided, pageWidth - 40);
        doc.text(treatmentLines, 20, currentY);
        currentY += (treatmentLines.length * 6);
      }
      
      // Witnesses
      currentY += 15;
      doc.setFont('helvetica', 'bold');
      doc.text("WITNESSES", 20, currentY);
      currentY += 8;
      doc.setFont('helvetica', 'normal');
      doc.text(incident.witnesses || 'None recorded', 20, currentY);
      
      // Tactical Actions
      currentY += 15;
      doc.setFont('helvetica', 'bold');
      doc.text("FOLLOW-UP ACTIONS TAKEN", 20, currentY);
      currentY += 8;
      doc.setFont('helvetica', 'normal');
      const actionLines = doc.splitTextToSize(incident.actionsTaken || 'Standard safety protocols applied.', pageWidth - 40);
      doc.text(actionLines, 20, currentY);
      currentY += (actionLines.length * 6);

      return currentY + 20;
    });
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
                  <p className="text-sm font-bold leading-relaxed text-foreground/80">{incident.treatmentProvided || 'Standard site protocols followed.'}</p>
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
