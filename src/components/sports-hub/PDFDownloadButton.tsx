'use client';

import React, { useRef, useState } from 'react';
import { Download, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PDFDownloadButtonProps {
  contentId: string;   // id of the DOM element to capture
  filename: string;    // e.g. "Squad-Season-Planning-Spreadsheet.pdf"
  label?: string;
}

export function PDFDownloadButton({ contentId, filename, label = 'Download PDF' }: PDFDownloadButtonProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'done'>('idle');

  const handleDownload = async () => {
    setStatus('generating');
    try {
      const element = document.getElementById(contentId);
      if (!element) { setStatus('idle'); return; }

      // Dynamic import so these heavy libs only load on demand
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;

      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
        heightLeft -= pageH;
      }

      pdf.save(filename);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      console.error('PDF generation failed', e);
      setStatus('idle');
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={status === 'generating'}
      className="gap-2 font-black text-xs uppercase tracking-widest rounded-xl h-9"
    >
      {status === 'generating' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-300" />}
      {status === 'idle' && <Download className="h-3.5 w-3.5" />}
      {status === 'generating' ? 'Generating…' : status === 'done' ? 'Downloaded!' : label}
    </Button>
  );
}
