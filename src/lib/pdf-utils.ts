import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { PDF_LOGO } from './pdf-brand-assets';

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

export const addSquadBranding = (doc: jsPDF, title: string, subtitle?: string, _lightMode?: boolean, compact?: boolean) => {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, compact ? 27 : 46, 'F');
  doc.addImage(PDF_LOGO, 'PNG', 20, 8, compact ? 25 : 32, compact ? 9 : 11.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(193, 24, 29);
  doc.text('THE SQUAD / OFFICIAL DOCUMENT', width - 20, 13, { align: 'right' });
  let size = compact ? 13 : 23;
  doc.setFontSize(size);
  while (size > 10 && doc.getTextWidth(title.toUpperCase()) > width - 40) doc.setFontSize(--size);
  doc.setTextColor(18, 18, 18);
  doc.text(title.toUpperCase(), 20, compact ? 24 : 31);
  if (!compact) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    const lines = doc.splitTextToSize(subtitle || `Generated ${format(new Date(), 'MMM d, yyyy')}`, width - 40);
    doc.text(lines.slice(0, 2), 20, 38);
  }
};

export const addSquadFooter = (doc: jsPDF, footerText?: string, businessName?: string, _lightMode?: boolean) => {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  const label = footerText || businessName || 'THE SQUAD · COMPETITION MANAGEMENT';
  doc.text(doc.splitTextToSize(label, width - 75).slice(0, 2), 20, height - 13);
  doc.setFont('helvetica', 'normal');
  doc.text(`${doc.getCurrentPageInfo().pageNumber} / ${doc.getNumberOfPages()}`, width - 20, height - 13, { align: 'right' });
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
