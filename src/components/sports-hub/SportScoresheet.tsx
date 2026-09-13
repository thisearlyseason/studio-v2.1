'use client';

import Link from 'next/link';
import { ChevronLeft, Printer } from 'lucide-react';
import type { SportScoresheet as Scoresheet, ScoresheetTable } from '@/lib/sport-scoresheets';
import './sport-scoresheet.css';

function Fields({ labels }: { labels: string[] }) {
  return <div className="sheet-fields">{labels.map(label => (
    <div key={label} className="sheet-field"><span>{label}</span><div aria-hidden="true" /></div>
  ))}</div>;
}

function RecordTable({ table }: { table: ScoresheetTable }) {
  return (
    <section className="sheet-section" aria-label={table.title}>
      <h3>{table.title}</h3>
      {table.note && <p className="sheet-note">{table.note}</p>}
      <div className="sheet-table-scroll" role="region" aria-label={`${table.title} table`} tabIndex={0}>
        <table>
          <thead><tr>{table.columns.map((column, col) => <th scope="col" key={`${col}-${column}`}>{column}</th>)}</tr></thead>
          <tbody>{Array.from({ length: table.rows }, (_, row) => (
            <tr key={row}>{table.columns.map((column, col) => col === 0 && table.rowLabels
              ? <th scope="row" key={`${col}-${column}`}>{table.rowLabels[row]}</th>
              : <td key={`${col}-${column}`}><span aria-hidden="true">&nbsp;</span></td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function SportScoresheet({ sheet }: { sheet: Scoresheet }) {
  return (
    <div className="sport-scoresheet">
      <div className="sheet-toolbar">
        <Link href="/sports-hub/templates" className="inline-flex items-center gap-2 text-sm font-bold"><ChevronLeft className="h-4 w-4" />All templates</Link>
        <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white"><Printer className="h-4 w-4" />Print / Save PDF</button>
      </div>
      <div className="sheet-intro">
        <p className="text-xs font-black uppercase text-primary">Free game-day template · 2 pages</p>
        <h1>{sheet.title}</h1>
        <p>{sheet.description}</p>
        <p>Print a blank copy to complete by hand, or choose Save as PDF in your browser’s print dialog. Use A4 or Letter paper at 100% scale and turn off browser headers and footers.</p>
        <Link href={`/sports/${sheet.sportSlug}`} className="inline-block font-bold text-primary">Explore {sheet.title.replace(/ (Innings )?Scoresheet$/, '')} management →</Link>
      </div>
      {sheet.pages.map((page, index) => (
        <article key={page.title} className="sheet-page" aria-label={`${sheet.title} page ${index + 1}`}>
          <div className="sheet-page-heading">
            <div><p>THE SQUAD · {sheet.title}</p><h2>{page.title}</h2></div>
            <span>{index + 1} / {sheet.pages.length}</span>
          </div>
          {index === 0 ? <><p className="sheet-instructions">{sheet.instructions}</p><Fields labels={sheet.fields} /></> : <Fields labels={['Event / match / round reference', 'Date / participants']} />}
          {page.tables.map(table => <RecordTable key={table.title} table={table} />)}
          {page.fields && <Fields labels={page.fields} />}
          <div className="sheet-page-footer"><span>thesquad.pro · Free printable scoresheet</span><span>{index + 1} / {sheet.pages.length}</span></div>
        </article>
      ))}
    </div>
  );
}
