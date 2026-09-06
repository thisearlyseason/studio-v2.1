import {jsPDF} from 'jspdf';
import {createHash} from 'node:crypto';
import type {TeamIncident} from '@/components/providers/team-provider';

const fields = ['id','title','teamId','teamName','reportedBy','reportedByName','createdAt','eventKind','eventId','eventName','leagueId','tournamentId','date','time','location','description','participantId','participantName','participantTeamName','division','gameId','incidentType','injuryType','involvedPeople','involvedPersonnel','witnesses','witnessesList','severity','emergencyServicesCalled','parentGuardianContacted','actionsTaken','treatmentProvided','followUpRequired','followUpNotes','reportedTo','equipmentInvolved','weatherConditions','status','auditHistory','updatedAt','updatedBy','resolvedAt','resolvedBy','attachment','attachmentDeletedAt'] as const;
const value = (record:TeamIncident, key:string) => {
  const entry = (record as unknown as Record<string,unknown>)[key];
  return entry === undefined || entry === null || entry === '' ? 'Not recorded' : typeof entry === 'object' ? JSON.stringify(entry) : String(entry);
};
export function incidentCsv(records:TeamIncident[]) {
  const quote = (text:string) => '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"','""') + '"';
  return [fields.map(quote).join(','), ...[...records].sort((a,b)=>a.id.localeCompare(b.id)).map(record=>fields.map(key=>quote(value(record,key))).join(','))].join('\r\n');
}
export function createIncidentPdf(records:TeamIncident[]) {
  if (records.length > 500) throw Error('Export is limited to 500 reports.');
  const doc = new jsPDF({compress:false});
  doc.setCreationDate(new Date('2000-01-01T00:00:00.000Z'));
  doc.setFileId(createHash('sha256').update(incidentCsv(records)).digest('hex').slice(0,32));
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  let y = 20;
  const line = (text:string) => {
    for (const part of doc.splitTextToSize(text,170)) { if (y > 275) {doc.addPage();y = 20;} doc.text(part,20,y);y += 5; }
  };
  line('SQUAD SAFETY INCIDENT LEDGER');
  for (const record of [...records].sort((a,b)=>a.id.localeCompare(b.id))) {
    y += 5; for (const key of fields) line(`${key}: ${value(record,key)}`);
  }
  return doc;
}
export function saveIncidentExport(records:TeamIncident[], format:'pdf'|'csv') {
  const name = records.length === 1 ? `INCIDENT_REPORT_${records[0].id.replace(/[^A-Za-z0-9_-]/g,'_')}` : 'SAFETY_LEDGER';
  if (format === 'pdf') {createIncidentPdf(records).save(name+'.pdf');return;}
  const url = URL.createObjectURL(new Blob([incidentCsv(records)],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name+'.csv'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
