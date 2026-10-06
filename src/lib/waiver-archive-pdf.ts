import { jsPDF } from 'jspdf';
import { addSquadBranding, addSquadFooter } from './pdf-utils';
export type WaiverPdfRecord = { id: string; signer: string; teamName?: string; signedAt: string; type: string; waiverText: string };
export function createWaiverArchivePdf(leagueName: string, records: WaiverPdfRecord[]) {
  const doc = new jsPDF();
  let y = 61;
  let title = 'Waiver archive';
  const date = (value: string) => new Date(value).toLocaleString('en-CA', {dateStyle:'medium', timeStyle:'short'});
  const header = () => addSquadBranding(doc, title, leagueName, true);
  const next = () => { doc.addPage(); header(); y = 60; };
  const ensure = (height: number) => { if (y + height > 267) next(); };
  const text = (value: string, size = 10, bold = false, color = 40) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
    for (const paragraph of value.split(/\n\s*\n/)) {
      const lines: string[] = doc.splitTextToSize(paragraph, 170);
      const leading = size * 0.45 + 1;
      ensure(Math.min(2, lines.length) * leading);
      for (const line of lines) {
        ensure(leading);
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
        doc.text(line, 20, y); y += leading;
      }
      if (value.includes('\n\n')) y += 3;
    }
  };
  const section = (label: string) => { ensure(24); y += 7; doc.setTextColor(193,24,29); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text(label.toUpperCase(),20,y); y+=8; };
  header();
  text('SIGNED AGREEMENTS', 19, true, 15); y+=5;
  text(`${records.length} signed record${records.length === 1 ? '' : 's'} · Generated ${date(new Date().toISOString())}`, 10);
  y+=7; text('This archive contains the recorded agreement text and sign-off details for the registrations below. Keep it with your league records.', 10);
  section('Archive index');
  records.forEach((r,i) => { ensure(22); text(`${String(i+1).padStart(2,'0')}  ${r.signer}`,11,true); text(`${r.teamName || 'Independent'} · ${date(r.signedAt)}`,9,false,90); y+=4; });
  for (const r of records) {
    title='Signed agreement'; next();
    text(r.signer,20,true,15); y+=3;
    text(r.teamName || 'Independent',11,false,90);
    section('Sign-off details');
    text(`Signed: ${date(r.signedAt)}`); text(`Registration: ${r.type}`); text(`Record: ${r.id}`,8,false,100);
    section('Agreement text');
    text(r.waiverText,10);
    section('Electronic signature record');
    text(`${r.signer} accepted the agreement above on ${date(r.signedAt)}. The submitted signature and agreement text are retained with this registration.`,10);
  }
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){doc.setPage(page);addSquadFooter(doc,'THE SQUAD · SIGNED AGREEMENTS');}
  return doc;
}
