import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export interface PDFBrandingOptions {
  title: string;
  subtitle?: string;
  businessName?: string;
  footer?: string;
  filename?: string;
}

export const addSquadBranding = (doc: jsPDF, title: string, subtitle?: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // --- SQUAD INTELLIGENCE Institutional Header ---
  // Dark Header Bar
  doc.setFillColor(15, 15, 20); // Deep Midnight
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Primary Accent Line (Squad Tactical Red)
  doc.setFillColor(220, 38, 38); // #dc2626 - Tactical Red
  doc.rect(0, 42, pageWidth, 3, 'F');
  
  // Decorative Red accent in corner
  doc.setFillColor(254, 242, 242); // #fef2f2 - Very Light Red
  doc.circle(pageWidth, 0, 60, 'F');

  // Branding Text: "SQUAD INTELLIGENCE"
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text("SQUAD", 20, 18);
  doc.setFont('helvetica', 'normal');
  doc.text("INTELLIGENCE", 20, 24);
  
  // Vertical Divider
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.1);
  doc.line(75, 12, 75, 30);

  // Document Title
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 82, 24);
  
  // Subtitle / Institutional Line
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text(subtitle || "OFFICIAL AUDIT RECORD • VERIFIED BY SQUAD INTELLIGENCE SECURE HUB", 20, 35);
  
  const timestamp = format(new Date(), 'PPPP p');
  doc.setFontSize(7);
  doc.text(`CERTIFIED: ${timestamp.toUpperCase()}`, 20, 40);
};

export const generateBrandedPDF = (options: PDFBrandingOptions, contentCallback: (doc: jsPDF, startY: number) => number) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Add Header
  addSquadBranding(doc, options.title, options.subtitle);

  // --- Content ---
  doc.setTextColor(0, 0, 0);
  const finalY = contentCallback(doc, 60);

  // --- Footer ---
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(options.footer || `SQUAD INTELLIGENCE • ${options.businessName || 'SQUAD INTELLIGENCE'} • PREMIUM AUDIT LOG`, 20, pageHeight - 15);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text("Scan for verification status on Squad Intelligence Mobile", pageWidth - 20, pageHeight - 15, { align: 'right' });

  if (options.filename) {
    doc.save(`${options.filename}.pdf`);
  }
  
  return doc;
};
