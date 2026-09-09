// Rebuild the printable vector PDFs: node scripts/generate-score-sheets.mjs
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('src/lib/score-sheet-catalog.json', root), 'utf8'));
const out = new URL('public/downloads/score-sheets/', root);
await mkdir(out, { recursive: true });
const logo = await readFile(new URL('public/logo-dark.png', root));
const RED = '#C8102E';
let pdf, y, title, pages;
const W = 279.4, H = 215.9, M = 12, CW = W - M * 2;
function text(value, x, yy, size = 9, bold = false) {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor('#151515');
  pdf.text(Array.isArray(value) ? value : String(value), x, yy);
}
function page(label) {
  if (pages++) pdf.addPage();
  pdf.setFillColor(RED); pdf.rect(M, 10, CW, 1.5, 'F');
  const img = pdf.getImageProperties(logo);
  const iw = 29, ih = iw * img.height / img.width;
  pdf.addImage(logo, 'PNG', M, 16, iw, Math.min(ih, 16));
  text(title.toUpperCase(), M + 37, 23, 18, true);
  text(label, M + 37, 30, 9);
  text('Date: __________________   Venue: __________________________   League / event: __________________________', M, 42);
  text('Home / A: ____________________________________   Away / B: ____________________________________', M, 51);
  text('Rules / format / period length: __________________________   Scorer: ______________________________', M, 60);
  pdf.setDrawColor('#BFC3C9'); pdf.setLineWidth(0.2);
  pdf.line(M, H - 13, W - M, H - 13);
  text('THE SQUAD  /  SPORTS HUB     •     thesquad.pro', M, H - 8, 8, true);
  text(`Community score sheet | ${pages}`, W - 66, H - 8, 8);
  y = 69;
}
function table(label, headers, widths, rows, height = 8, values = []) {
  if (y + 9 + (rows + 1) * height > H - 18) throw new Error(`Overflow: ${title} / ${label}`);
  text(label.toUpperCase(), M, y, 9, true); y += 4;
  const factor = CW / widths.reduce((a,b) => a+b,0);
  widths = widths.map(n => n * factor);
  for (let row = 0; row <= rows; row++) {
    let x = M;
    headers.forEach((h, i) => {
      pdf.setFillColor(row === 0 ? '#F0F1F3' : '#FFFFFF');
      pdf.setDrawColor('#BFC3C9'); pdf.rect(x, y, widths[i], height, 'FD');
      const value = row === 0 ? h : values[row-1]?.[i] ?? '';
      if (value) text(value, x + 1.6, y + height / 2 + 1, 7.5, row === 0);
      x += widths[i];
    });
    y += height;
  }
  y += 8;
}
function note(value) {
  const lines = pdf.splitTextToSize(value, CW);
  if (y + lines.length * 4 > H - 18) throw new Error(`Note overflow: ${title}`);
  text(lines, M, y, 8); y += lines.length * 4 + 5;
}
function result() { note('Final A: __________   Final B: __________   Winner / tie: __________________   Verified by: __________________'); }
function summary(s) {
  table('Score by period (OT = overtime)', ['Team', ...Array.from({length:s.periods},(_,i)=>String(i+1)), 'OT','Total'], [4,...Array(s.periods).fill(1),1,1],2,8,[['Home / A'],['Away / B']]);
}
for (const s of catalog) {
  pdf = new jsPDF({ orientation:'landscape', unit:'mm', format:'letter', compress:true });
  pdf.setProperties({title:`The Squad - ${s.name} Score Sheet`,author:'The Squad',subject:'Printable community sport scorekeeping'});
  pdf.setCreationDate(new Date('2026-09-09T00:00:00Z'));
  title = s.name; pages = 0;
  if (s.layout === 'diamond') {
    for (const side of ['AWAY','HOME']) {
      page(`${side} BATTING RECORD | One cell per plate appearance; use continuation pages when needed`);
      const innings = s.periods;
      const widths = [8,40, ...Array(innings).fill(16),8,8,8,8];
      const header = ['#','Batter / substitute',...Array.from({length:innings},(_,i)=>String(i+1)),'AB','R','H','RBI'];
      const rowHeight = s.id === 'slo-pitch' ? 8 : 9.5;
      const start = y + 4, factor = CW / widths.reduce((a,b)=>a+b,0);
      table('Batting order - record substitute names and positions in the same slot',header,widths, s.id==='slo-pitch'?12:10,rowHeight,Array.from({length:s.id==='slo-pitch'?12:10},(_,i)=>[String(i+1)]));
      const left = M + 48 * factor, cell = 16 * factor;
      pdf.setDrawColor('#D8DBDF');
      for(let r=0;r<(s.id==='slo-pitch'?12:10);r++) for(let c=0;c<innings;c++) {
        const xx=left+c*cell+cell/2, yy=start+(r+1)*rowHeight+rowHeight/2, d=2.5;
        pdf.line(xx,yy-d,xx+d,yy); pdf.line(xx+d,yy,xx,yy+d); pdf.line(xx,yy+d,xx-d,yy); pdf.line(xx-d,yy,xx,yy-d);
      }
      note('1B/2B/3B/HR = hits; BB = walk; K = strikeout; E = error; FC = fielder choice. Record outs and runner advances.');
    }
    page('GAME SUMMARY / PITCHING / CONTINUATION');
    table('Inning totals',['Team',...Array.from({length:s.periods},(_,i)=>String(i+1)),'Extra','R','H','E'],[4,...Array(s.periods+4).fill(1)],2,8,[['Away'],['Home']]);
    table('Pitching (IP: .1 = one out; .2 = two outs)',['Team / pitcher','IP','H','R','ER','BB','K','Pitches'],[5,1,1,1,1,1,1,1],4);
    result();
  } else if(s.layout==='cornhole') {
    page('ROUND LOG | A raw = 3 x holes + board bags; B raw calculated separately');
    table('Complete all eight bags before scoring',['Round','A holes','A board','A raw','B holes','B board','B raw','A net','B net','A total','B total'],Array(11).fill(1),12,8,Array.from({length:12},(_,i)=>[String(i+1)]));
    note('A net = max(A raw - B raw, 0); B net = max(B raw - A raw, 0). Example: 7 versus 5 awards 2 to A only.');
    page('CONTINUATION | Carry forward A: __________ B: __________');
    table('Additional rounds',['Round','A holes','A board','A raw','B holes','B board','B raw','A net','B net','A total','B total'],Array(11).fill(1),10,8,Array.from({length:10},(_,i)=>[String(i+13)])); result();
  } else if(s.layout==='golf') {
    page('18-HOLE STROKE PLAY | Players A-D: enter names below');
    for(const [start,end,label] of [[1,9,'OUT'],[10,18,'IN']]) {
      table(`${label} - gross strokes including penalties`,['Player / hole',...Array.from({length:9},(_,i)=>String(start+i)),label],[4,...Array(10).fill(1)],5,8,[['Par'],['A'],['B'],['C'],['D']]);
    }
    page('PLAYER REGISTER / TOTALS');
    table('Gross and net scores',['Player name','OUT','IN','Gross','Playing HCP','Net','Player signature','Marker signature'],[5,1,1,1,2,1,3,3],4,13);
    note('Course: ______________________   Tees: ______________   Course rating / slope: ______________________');
  } else if(s.layout==='sets') {
    page(s.id==='tennis'?'MATCH RECORD | Set scores are games; tie-break scores are points':'MATCH RECORD | Record actual final points and the winner of each set/game');
    table('Match format',['Best of','Target / set rule','Win by','Deciding game / tie-break rule'],[2,4,2,5],1,10);
    table(s.id==='tennis'?'Set results':'Set / game results',['Set / game','A score','B score','Winner',s.id==='tennis'?'Tie-break A':'A timeouts',s.id==='tennis'?'Tie-break B':'B timeouts','Start / finish'],[2,2,2,2,2,2,4],5,10,Array.from({length:5},(_,i)=>[String(i+1)]));
    note('Sets / games won - A: ______ B: ______   Match winner: __________________   Verified by: __________________');
    page('DETAILED LOG | Copy this page for each additional set or game');
    if(s.id==='volleyball') {
      table('Starting rotation - jersey numbers',['Team','I (server)','II','III','IV','V','VI','Libero'],[3,...Array(7).fill(1)],2,8,[['A'],['B']]);
      table('Service turns / substitutions / timeouts',['Set','Team','Server / in-out #','A score','B score','Action / notes'],[1,1,3,1,1,5],7,9);
    } else {
      table(s.id==='tennis'?'Game log - write tie-break points in notes':'Rally / service log - mark side-out or second server',['Set/game','Server / #','Point winner','A score','B score','Action / tie-break / notes'],[2,2,2,1,1,5],11,9);
    }
  } else {
    page('MATCH SUMMARY / SCORING LOG'); summary(s);
    const goals=s.layout==='goals';
    const columns=goals?['Period','Time','Team','Scorer #','Assist #',s.id==='hockey'?'Assist 2':'Type / notes','A total','B total']:['Period','Time','Team','Player #','Points','Play / type','A total','B total'];
    table('Scoring events',columns,[1,1.5,1,2,2,2,1,1],8,8);
    result();
    page('SCORING CONTINUATION | Carry forward A: ______ B: ______ | Copy as needed');
    table('Scoring events - running score continues from previous page',columns,[1,1.5,1,2,2,2,1,1],13,8);
    page('ROSTER | Copy for additional players');
    table('Roster',['A #','A player','A role / fouls','B #','B player','B role / fouls'],[1,4,2,1,4,2],12,8);
    page('DISCIPLINE / SUBSTITUTIONS / TIMEOUTS | Copy for additional entries');
    table(s.id==='soccer'?'Cards and substitutions':'Penalties / fouls / timeouts',['Period / time','Team / #','Action / offence','Duration','Released / notes'],[2,2,5,2,4],12,8);
    if(goals) {
      page('GOALKEEPERS / TIE-BREAK / CONTINUATION');
      table('Goalkeeper record',['Team','Goalkeeper # / name','Minutes','Shots faced','Saves','Goals against'],[1,5,2,2,2,2],4,9);
      if (s.id.includes('lacrosse')) {
        table('Overtime goals / continuation',['Period','Clock','Team','Scorer #','Assist #','A total','B total'],[1,2,1,2,2,1,1],5,8);
        note('Overtime format / winning goal: __________________________________________________________');
      } else {
        table('Shootout / penalty kicks - separate from match scoring',['Attempt','A taker','A goal / miss','B taker','B goal / miss'],[1,3,2,3,2],5,8,Array.from({length:5},(_,i)=>[String(i+1)]));
        note('Additional sudden-death attempts: __________________________________________________________');
      }
    }
  }
  page('SCORER GUIDE / LOCAL RULES');
  note(s.guide);
  note('Before play, confirm competition rules, time limits, substitutions and tie-break format with the organizer. These are original community worksheets, not governing-body official forms. Use the required official form when mandated.');
  note('Print landscape on Letter paper at actual size, or fit to printable area on A4. Print extra log pages for overtime, extra innings, extended sets or large rosters. Use the same game details on every continuation page.');
  table('Local rules / corrections / match notes',['Notes'],[1],6,9);
  note(`Scoring reference: ${s.source}`);
  await writeFile(new URL(`the-squad-${s.id}.pdf`,out),Buffer.from(pdf.output('arraybuffer')));
  console.log(`${s.id}: ${pages} pages`);
}
