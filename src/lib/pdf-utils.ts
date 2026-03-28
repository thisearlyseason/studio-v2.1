import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export interface PDFBrandingOptions {
  title: string;
  subtitle?: string;
  footer?: string;
  filename: string;
  primaryColor?: string;
}

export const generateBrandedPDF = (options: PDFBrandingOptions, contentCallback: (doc: jsPDF, startY: number) => number) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor = options.primaryColor || '#000000'; // Default to black for institutional feel or #7c3aed for primary
  
  // --- Institutional Header ---
  // Dark Header Bar
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Primary Accent Line
  doc.setFillColor(124, 58, 237); // primary color hex
  doc.rect(0, 42, pageWidth, 3, 'F');
  
  // Header Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(options.title.toUpperCase(), 20, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text(options.subtitle || "OFFICIAL INSTITUTIONAL RECORD • VERIFIED BY STUDIO SECURE HUB", 20, 34);
  
  const timestamp = format(new Date(), 'PPPP p');
  doc.setFontSize(8);
  doc.text(`GENERATED: ${timestamp.toUpperCase()}`, 20, 39);

  // --- Content ---
  doc.setTextColor(0, 0, 0);
  const finalY = contentCallback(doc, 60);

  // --- Footer ---
  doc.setFillColor(245, 245, 245);
  doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text(options.footer || "STUDIO INTELLIGENCE • ALL RIGHTS RESERVED", 20, pageHeight - 15);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text("Scan for verification status on Studio Mobile Hub", pageWidth - 20, pageHeight - 15, { align: 'right' });

  doc.save(`${options.filename}.pdf`);
  return doc;
};

export const exportImageToPDF = async (imageElement: HTMLDivElement, options: PDFBrandingOptions) => {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(imageElement, { 
    backgroundColor: '#ffffff',
    scale: 2 
  });
  const imgData = canvas.toDataURL('image/png');
  
  generateBrandedPDF(options, (doc, startY) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const availableWidth = pageWidth - (margin * 2);
    const imgWidth = availableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    doc.addImage(imgData, 'PNG', margin, startY, imgWidth, imgHeight);
    return startY + imgHeight + 20;
  });
};
