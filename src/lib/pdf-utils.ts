import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';

export interface PDFBrandingOptions {
  title: string;
  subtitle?: string;
  businessName?: string;
  footer?: string;
  filename?: string;
  orientation?: 'p' | 'l' | 'portrait' | 'landscape';
  lightMode?: boolean;
  hideFooter?: boolean;
  compactHeader?: boolean;
}

export const exportImageToPDF = async (element: HTMLElement, options: PDFBrandingOptions) => {
  const isLandscape = options.orientation === 'landscape' || options.orientation === 'l';
  
  // Create a high-fidelity capture using onclone to avoid flickering the live UI
  try {
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: options.lightMode ? '#ffffff' : '#0a0a0a',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth + 100,
      windowHeight: element.scrollHeight + 100,
      onclone: (clonedDoc) => {
        // Find the cloned element in the hidden document
        const clonedElement = clonedDoc.getElementById(element.id) || clonedDoc.querySelector(`[ref="${element.id}"]`);
        
        if (options.lightMode) {
          // Apply light mode styles specifically to the cloned body and target element
          clonedDoc.body.classList.add('pdf-light-mode');
          if (clonedElement) {
            (clonedElement as HTMLElement).classList.add('pdf-light-mode');
            (clonedElement as HTMLElement).style.background = 'white';
            (clonedElement as HTMLElement).style.padding = '20px';
          }
        }

        // Force visibility for all elements in the clone
        const allElements = clonedDoc.getElementsByTagName("*");
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i] as HTMLElement;
          el.style.opacity = "1";
          el.style.visibility = "visible";
          el.style.animation = "none";
          el.style.transition = "none";
        }
      }
    });

    const imgData = canvas.toDataURL('image/png', 1.0);
    const doc = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Add Branding (Compact Header)
    const headerHeight = options.compactHeader ? 25 : 45;
    addSquadBranding(doc, options.title, options.subtitle, options.lightMode, options.compactHeader);

    // Add Footer if requested
    const footerHeight = options.hideFooter ? 0 : 30;
    if (!options.hideFooter) {
      addSquadFooter(doc, options.footer, options.businessName, options.lightMode);
    }

    // Capture area math for "Full Page"
    const margin = 5; // Minimal margins for maximum coverage
    const availableWidth = pageWidth - (margin * 2);
    const availableHeight = pageHeight - headerHeight - footerHeight - (margin * 2);

    let imgWidth = availableWidth;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;

    // If it's too tall, scale down to fit height
    if (imgHeight > availableHeight) {
      imgHeight = availableHeight;
      imgWidth = (canvas.width * imgHeight) / canvas.height;
    }

    // Center horizontally, position right under header
    const x = (pageWidth - imgWidth) / 2;
    const y = headerHeight + margin;

    doc.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');

    if (options.filename) {
      doc.save(`${options.filename}.pdf`);
    }
    return doc;
  } catch (error) {
    console.error("PDF Capture Error:", error);
    throw error;
  }
};

export const addSquadBranding = (doc: jsPDF, title: string, subtitle?: string, lightMode?: boolean, compact?: boolean) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerY = compact ? 25 : 45;
  
  // Header Bar
  doc.setFillColor(lightMode ? 255 : 15, lightMode ? 255 : 15, lightMode ? 255 : 20); 
  doc.rect(0, 0, pageWidth, headerY, 'F');
  
  // Accent Line
  doc.setFillColor(220, 38, 38); 
  doc.rect(0, headerY - 2, pageWidth, 2, 'F');

  doc.setTextColor(lightMode ? 0 : 255, lightMode ? 0 : 255, lightMode ? 0 : 255);
  
  if (compact) {
    // Elegant Compact Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("SQUAD INTELLIGENCE", 15, 12);
    
    doc.setFontSize(14);
    doc.text(title.toUpperCase(), 15, 20);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightMode ? 120 : 180);
    const dateText = subtitle || `SCHEDULED: ${format(new Date(), 'PPPP')}`;
    doc.text(dateText.toUpperCase(), pageWidth - 15, 18, { align: 'right' });
  } else {
    // Full Institutional Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("SQUAD", 20, 18);
    doc.setFont('helvetica', 'normal');
    doc.text("INTELLIGENCE", 20, 24);
    doc.setDrawColor(lightMode ? 200 : 255);
    doc.setLineWidth(0.1);
    doc.line(75, 12, 75, 30);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), 82, 24);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightMode ? 100 : 180);
    doc.text(subtitle || "OFFICIAL AUDIT RECORD", 20, 35);
    doc.setFontSize(7);
    doc.text(`CERTIFIED: ${format(new Date(), 'PPPP p').toUpperCase()}`, 20, 40);
  }
};

export const addSquadFooter = (doc: jsPDF, footerText?: string, businessName?: string, lightMode?: boolean) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(lightMode ? 252 : 248, lightMode ? 252 : 250, lightMode ? 252 : 252); 
  doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(footerText || `SQUAD INTELLIGENCE • PREMIUM AUDIT LOG`, 20, pageHeight - 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text("Verified by Squad Intelligence Mobile Architecture", pageWidth - 20, pageHeight - 15, { align: 'right' });
};

export const generateBrandedPDF = (options: PDFBrandingOptions, contentCallback: (doc: jsPDF, startY: number) => number) => {
  const doc = new jsPDF({ orientation: options.orientation || 'portrait' });
  addSquadBranding(doc, options.title, options.subtitle, options.lightMode, options.compactHeader);
  doc.setTextColor(0, 0, 0);
  const finalY = contentCallback(doc, options.compactHeader ? 35 : 60);
  if (!options.hideFooter) {
    addSquadFooter(doc, options.footer, options.businessName, options.lightMode);
  }
  if (options.filename) {
    doc.save(`${options.filename}.pdf`);
  }
  return doc;
};
