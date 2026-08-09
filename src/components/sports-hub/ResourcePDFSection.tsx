'use client';

/**
 * ResourcePDFSection
 *
 * Renders a branded "Download PDF" banner just below the resource header.
 * On click, generates a pixel-perfect A4 PDF using jsPDF + html2canvas,
 * with full Squad branding: red header bar, logo mark, title, content, footer.
 *
 * The hidden #pdf-target div is rendered off-screen so it doesn't affect layout.
 */

import React, { useState } from 'react';
import { Download, Loader2, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BRAND_RED   = '#C8102E';
const BRAND_DARK  = '#0F0F0F';
const BRAND_GRAY  = '#6B7280';
const BRAND_LIGHT = '#F9FAFB';
const BRAND_BORDER = '#E5E7EB';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  resourceId: string;
  title: string;
  description: string;
  category: string;
  content: string;   // raw markdown body
  filename: string;  // e.g. "TheSquad-Season-Planning.pdf"
  tags: string[];
}

// ─── Plain-text extraction from markdown (for PDF body) ───────────────────────

function markdownToLines(md: string): { type: 'h2' | 'h3' | 'bullet' | 'para' | 'divider' | 'skip'; text: string }[] {
  return md
    .trim()
    .split('\n')
    .map(line => {
      if (line.startsWith('## '))   return { type: 'h2',      text: line.slice(3).trim() };
      if (line.startsWith('### '))  return { type: 'h3',      text: line.slice(4).trim() };
      if (line.startsWith('#### ')) return { type: 'h3',      text: line.slice(5).trim() };
      if (line.startsWith('- ')  || line.startsWith('* '))
                                    return { type: 'bullet',  text: line.slice(2).trim().replace(/\*\*(.+?)\*\*/g, '$1') };
      if (line.startsWith('> '))    return { type: 'para',    text: line.slice(2).trim().replace(/\*\*(.+?)\*\*/g, '$1') };
      if (line.startsWith('---'))   return { type: 'divider', text: '' };
      if (line.startsWith('|'))     return { type: 'skip',    text: '' }; // skip tables in PDF (too complex)
      if (line.startsWith('#'))     return { type: 'skip',    text: '' }; // skip h1 (already in header)
      if (line.startsWith('```'))   return { type: 'skip',    text: '' };
      if (/^\d+\.\s/.test(line))    return { type: 'bullet',  text: line.replace(/^\d+\.\s/, '').replace(/\*\*(.+?)\*\*/g, '$1') };
      const clean = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
      if (!clean) return { type: 'skip', text: '' };
      return { type: 'para', text: clean };
    });
}

// ─── Inline PDF HTML (rendered off-screen, captured by html2canvas) ───────────

function PDFTemplate({ title, description, category, content, tags }: Omit<Props, 'resourceId' | 'filename'>) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = markdownToLines(content);

  return (
    <div
      id="squad-pdf-target"
      style={{
        position: 'fixed',
        left: '-9999px',
        top: 0,
        width: '794px',
        backgroundColor: '#ffffff',
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        color: BRAND_DARK,
        boxSizing: 'border-box',
        lineHeight: 1.4,
      }}
    >
      {/* ── Header bar ── */}
      <div style={{ backgroundColor: BRAND_RED, padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Logo mark */}
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '18px', fontWeight: 900, color: BRAND_RED, letterSpacing: '-0.05em' }}>S</span>
          </div>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>
              The Squad · Sports Hub
            </div>
            <div style={{ fontSize: '14px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Free Resource
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {today}
          </div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.55)' }}>
            www.thesquad.pro/sports-hub
          </div>
        </div>
      </div>

      {/* ── Title section ── */}
      <div style={{ padding: '28px 32px 20px', borderBottom: `2px solid ${BRAND_BORDER}`, backgroundColor: BRAND_LIGHT }}>
        <div style={{
          display: 'inline-block', backgroundColor: `${BRAND_RED}18`, color: BRAND_RED,
          fontSize: '8px', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: '20px', marginBottom: '10px',
        }}>
          {category}
        </div>
        <h1 style={{
          fontSize: '24px', fontWeight: 900, letterSpacing: '-0.03em',
          color: BRAND_DARK, margin: '0 0 8px 0', lineHeight: 1.15,
        }}>
          {title}
        </h1>
        <p style={{ fontSize: '12px', color: BRAND_GRAY, margin: 0, lineHeight: 1.5, maxWidth: '680px' }}>
          {description}
        </p>
      </div>

      {/* ── Body content ── */}
      <div style={{ padding: '24px 32px 60px' }}>
        {lines.map((line, i) => {
          if (line.type === 'skip') return null;
          if (line.type === 'h2') return (
            <h2 key={i} style={{
              fontSize: '13px', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: BRAND_RED,
              margin: '24px 0 8px 0', paddingBottom: '6px',
              borderBottom: `2px solid ${BRAND_RED}30`,
            }}>
              {line.text}
            </h2>
          );
          if (line.type === 'h3') return (
            <h3 key={i} style={{
              fontSize: '12px', fontWeight: 700, color: BRAND_DARK,
              margin: '16px 0 6px 0',
            }}>
              {line.text}
            </h3>
          );
          if (line.type === 'bullet') return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '5px' }}>
              <span style={{ color: BRAND_RED, fontSize: '10px', marginTop: '3px', flexShrink: 0 }}>●</span>
              <span style={{ fontSize: '11px', color: BRAND_DARK, lineHeight: 1.5 }}>{line.text}</span>
            </div>
          );
          if (line.type === 'divider') return (
            <div key={i} style={{ borderTop: `1px solid ${BRAND_BORDER}`, margin: '16px 0' }} />
          );
          return (
            <p key={i} style={{
              fontSize: '11px', color: '#374151', lineHeight: 1.65,
              margin: '0 0 8px 0',
            }}>
              {line.text}
            </p>
          );
        })}

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: `1px solid ${BRAND_BORDER}` }}>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: BRAND_GRAY, marginBottom: '8px' }}>
              Tags
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map((t, i) => (
                <span key={i} style={{
                  fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em',
                  backgroundColor: BRAND_LIGHT, color: BRAND_GRAY,
                  padding: '3px 8px', borderRadius: '20px', border: `1px solid ${BRAND_BORDER}`,
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: `1px solid ${BRAND_BORDER}`, padding: '12px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#ffffff',
      }}>
        <span style={{ fontSize: '8px', color: BRAND_GRAY }}>
          © {new Date().getFullYear()} The Squad · Free to use, not for resale
        </span>
        <span style={{ fontSize: '8px', color: BRAND_GRAY }}>
          www.thesquad.pro/sports-hub/playbook
        </span>
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export function ResourcePDFSection({ resourceId, title, description, category, content, filename, tags }: Props) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'done'>('idle');

  const handleDownload = async () => {
    setStatus('generating');
    try {
      const element = document.getElementById('squad-pdf-target');
      if (!element) { setStatus('idle'); return; }

      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
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
      setTimeout(() => setStatus('idle'), 3500);
    } catch (e) {
      console.error('PDF generation error', e);
      setStatus('idle');
    }
  };

  return (
    <>
      {/* Hidden PDF template rendered off-screen */}
      <PDFTemplate
        title={title}
        description={description}
        category={category}
        content={content}
        tags={tags}
      />

      {/* Visible download banner */}
      <div className="mb-10 rounded-2xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
        {/* Red accent strip */}
        <div className="h-1 hero-gradient" />

        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Icon */}
          <div className="h-11 w-11 rounded-xl hero-gradient flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-white" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-0.5">
              Free Resource · Printable PDF
            </p>
            <p className="font-black text-sm tracking-tight leading-snug">
              Download the branded PDF version
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Includes full content with The Squad branding — ready to print or share.
            </p>
          </div>

          {/* Button */}
          <Button
            onClick={handleDownload}
            disabled={status === 'generating'}
            className="shrink-0 hero-gradient text-white border-0 gap-2 font-black text-xs uppercase tracking-widest rounded-xl h-10 px-5 hover:opacity-90 transition-opacity shadow-md"
          >
            {status === 'generating' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {status === 'done'       && <CheckCircle className="h-3.5 w-3.5" />}
            {status === 'idle'       && <Download className="h-3.5 w-3.5" />}
            {status === 'generating' ? 'Building PDF…' : status === 'done' ? 'Downloaded!' : 'View Resource'}
          </Button>
        </div>
      </div>
    </>
  );
}
