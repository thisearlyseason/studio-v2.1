import catalog from './score-sheet-catalog.json';
import type { Resource } from './sports-hub-resources';

export const SCORE_SHEET_RESOURCES: Resource[] = catalog.map(sheet => ({
  id: `score-sheet-${sheet.id}`,
  title: `The Squad ${sheet.name} Score Sheet`,
  description: `Printable ${sheet.name.toLowerCase()} scorekeeping pack with dedicated scoring tables, continuation space and a scorer guide. Free branded PDF.`,
  type: 'score-sheet',
  sport: sheet.sport,
  difficulty: 'beginner',
  downloadCount: 0,
  isFeatured: false,
  isVideo: false,
  downloadUrl: `/downloads/score-sheets/the-squad-${sheet.id}.pdf`,
  tags: [sheet.sport.toLowerCase(), 'score sheet', 'scoresheet', 'printable', 'scorekeeping', ...(sheet.id === 'slo-pitch' ? ['slopitch', 'slow pitch'] : [])],
  createdAt: '2026-09-09',
  content: {
    overview: `The Squad branded ${sheet.name.toLowerCase()} worksheet for coaches, volunteers and community competitions.`,
    body: `## How to keep score\n\n${sheet.guide}\n\n## Download and print\n\nDownload the PDF above. Print landscape on Letter paper at actual size, or fit to printable area on A4. The pack includes scoring grids and a guide. Copy log pages for additional entries and record the same game details on each continuation page.\n\n## Before the game\n\nConfirm local rules, period lengths, roster limits and tie-break format with your organizer. These original community worksheets are not governing-body official forms; use the required official form when mandated.\n\n## Scoring reference\n\n[View the governing scoring guidance](${sheet.source})`,
  },
}));
