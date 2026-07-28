/**
 * BrandedPDFContent
 *
 * A hidden, print-ready element rendered off-screen.
 * html2canvas captures this exact element.
 * All styles are inline so the canvas capture is pixel-perfect.
 */

interface BrandedPDFContentProps {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  children: React.ReactNode;
}

const BRAND_RED = '#C8102E';
const BRAND_DARK = '#0F0F0F';
const BRAND_GRAY = '#6B7280';
const BRAND_LIGHT = '#F9FAFB';
const BRAND_BORDER = '#E5E7EB';

export function BrandedPDFContent({ id, title, subtitle, category, children }: BrandedPDFContentProps) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div
      id={id}
      style={{
        position: 'fixed',
        left: '-9999px',
        top: 0,
        width: '794px',       // A4 at 96dpi
        minHeight: '1123px',
        backgroundColor: '#ffffff',
        fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
        color: BRAND_DARK,
        boxSizing: 'border-box',
      }}
    >
      {/* Header bar */}
      <div style={{ backgroundColor: BRAND_RED, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Squad logo mark */}
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '16px', fontWeight: 900, color: BRAND_RED }}>S</span>
          </div>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>The Squad · Sports Hub</div>
            <div style={{ fontSize: '13px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>Free Resource</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Generated {today}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>thesquad.pro/sports-hub</div>
        </div>
      </div>

      {/* Title section */}
      <div style={{ padding: '28px 32px 20px', borderBottom: `2px solid ${BRAND_BORDER}`, backgroundColor: BRAND_LIGHT }}>
        <div style={{
          display: 'inline-block', backgroundColor: `${BRAND_RED}15`, color: BRAND_RED,
          fontSize: '9px', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: '20px', marginBottom: '10px',
        }}>{category}</div>
        <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.03em', color: BRAND_DARK, margin: '0 0 6px 0', lineHeight: 1.1 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', color: BRAND_GRAY, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>}
      </div>

      {/* Body content */}
      <div style={{ padding: '24px 32px 40px' }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTop: `1px solid ${BRAND_BORDER}`, padding: '12px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#ffffff',
      }}>
        <span style={{ fontSize: '9px', color: BRAND_GRAY }}>© {new Date().getFullYear()} The Squad · Free to use, not for resale</span>
        <span style={{ fontSize: '9px', color: BRAND_GRAY }}>Sports Hub · thesquad.pro</span>
      </div>
    </div>
  );
}

// ─── Reusable PDF-safe styled helpers ────────────────────────────────────────

export function PDFSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{
        fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em',
        color: BRAND_RED, margin: '0 0 10px 0', paddingBottom: '6px',
        borderBottom: `2px solid ${BRAND_RED}30`,
      }}>{title}</h2>
      {children}
    </div>
  );
}

export function PDFTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '11px' }}>
      <thead>
        <tr style={{ backgroundColor: BRAND_RED }}>
          {headers.map((h, i) => (
            <th key={i} style={{
              padding: '7px 10px', textAlign: 'left', color: '#ffffff',
              fontWeight: 800, fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#ffffff' : BRAND_LIGHT }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{ padding: '7px 10px', color: BRAND_DARK, borderBottom: `1px solid ${BRAND_BORDER}`, fontSize: '11px' }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PDFField({ label, lines = 1 }: { label: string; lines?: number }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: BRAND_GRAY, marginBottom: '3px' }}>{label}</div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ borderBottom: `1px solid ${BRAND_DARK}30`, height: '22px', marginBottom: '2px' }} />
      ))}
    </div>
  );
}

export function PDFCheckList({ items }: { items: string[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
          <div style={{
            width: '14px', height: '14px', border: `2px solid ${BRAND_BORDER}`,
            borderRadius: '3px', flexShrink: 0, marginTop: '1px',
          }} />
          <span style={{ fontSize: '11px', color: BRAND_DARK, lineHeight: 1.4 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function PDFBulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 8px 0', padding: '0 0 0 16px' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '11px', color: BRAND_DARK, marginBottom: '4px', lineHeight: 1.4 }}>{item}</li>
      ))}
    </ul>
  );
}

export function PDFCallout({ text }: { text: string }) {
  return (
    <div style={{
      backgroundColor: `${BRAND_RED}08`, borderLeft: `3px solid ${BRAND_RED}`,
      padding: '10px 14px', borderRadius: '0 6px 6px 0', marginBottom: '12px',
    }}>
      <p style={{ fontSize: '11px', color: BRAND_DARK, margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>{text}</p>
    </div>
  );
}
