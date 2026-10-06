import { competitionVenues, surfaceLabel } from "./venues";
import qrcode from "qrcode-generator";
import { PDF_LOGO } from "../pdf-brand-assets";
import {
  type CompetitionDocument,
  sourceLabel,
  tournamentGames,
} from "./document";
import { resolveCompetition } from "./results";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function qrImage(url: string): string {
  const qr = qrcode(0, "M");
  qr.addData(url, "Byte");
  qr.make();
  return qr.createDataURL(6, 24);
}
export function snapshotHtml(document: CompetitionDocument): string {
  const games = tournamentGames(document).map(g => ({...g, ...document.officialAssignments?.[g.id]}));
  const { standings, states } = resolveCompetition(
    document.topology,
    document.results,
    document.approvals,
  );
  const bracket = [...new Set(document.topology.matches.map((m) => m.stage))]
    .map(
      (stage) =>
        `<section class="bracket-stage"><h2>${escape(stage)}</h2><div class="bracket">${[
          ...new Set(
            document.topology.matches
              .filter((m) => m.stage === stage)
              .map((m) => m.round),
          ),
        ]
          .map(
            (round) =>
              `<div class="round"><h3>${document.topology.matches.filter(m => m.stage === stage && m.round === round).length === 1 && !document.topology.matches.some(m => m.stage === stage && m.pool) && round === Math.max(...document.topology.matches.filter(m => m.stage === stage).map(m => m.round)) ? "Final" : `Round ${round}`}</h3>${document.topology.matches
                .filter((m) => m.stage === stage && m.round === round)
                .map((m) => {
                  const state = states.get(m.id)!;
                  const slot = document.schedule.find(
                    (g) => g.matchId === m.id,
                  );
                  const stageMatches = document.topology.matches.filter(match => match.stage === m.stage);
                  const isFinal = !m.pool && m.round === Math.max(...stageMatches.map(match => match.round)) && stageMatches.filter(match => match.round === m.round).length === 1;
                  return `<article><small>${escape(isFinal ? `${m.stage} · Final` : m.label)}${m.bestOf > 1 ? ` · Best of ${m.bestOf}` : ""}</small>${m.sources.map((source, i) => `<p class="${state.winner && state.winner === state.teamIds[i] ? "winner" : ""}"><span>${escape(document.topology.teams.find((t) => t.id === state.teamIds[i])?.name || sourceLabel(source, document.topology))}</span>${state.winner && state.winner === state.teamIds[i] ? '<b class="winner-label">Winner</b>' : ""}</p>`).join("")}<small>${slot ? `${escape(slot.date)} ${escape(slot.time)} · ${escape(surfaceLabel(document.options.resources.find((r) => r.id === slot.resourceId)!))}` : "Unplaced"}</small></article>`;
                })
                .join("")}</div>`,
          )
          .join("")}</div></section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(document.title)}</title><style>
@page{size:A4;margin:16mm 14mm 18mm;@bottom-left{content:"THE SQUAD · TOURNAMENT REPORT";font:8pt Arial;color:#777}@bottom-right{content:counter(page) " / " counter(pages);font:8pt Arial;color:#777}}
*{box-sizing:border-box}body{font:14px Arial,Helvetica,sans-serif;max-width:1100px;margin:auto;padding:40px;color:#171717;background:#fff;line-height:1.45}header{margin-bottom:30px}.brand-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:30px}.brand-row img{width:125px;height:auto}.document-tag{color:#c1181d;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px}h1{font-size:34px;line-height:1.05;letter-spacing:-1.2px;margin:0 0 16px;max-width:900px;overflow-wrap:anywhere}header p{font-size:11px;color:#666;margin:5px 0}.report-meta{display:flex;gap:30px;background:#f5f5f5;border-radius:10px;padding:16px;margin:22px 0}.report-meta b{font-size:20px;display:block;color:#111}.report-meta span{font-size:10px;text-transform:uppercase;letter-spacing:1px}h2{font-size:21px;letter-spacing:-.5px;margin:27px 0 13px;break-after:avoid}h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin:0 0 10px}section{margin:16px 0}.bracket{display:flex;gap:16px;overflow:auto}.round{min-width:220px;flex:1}article{border:1px solid #ddd;border-radius:10px;background:#fff;padding:14px;margin:0 0 15px;break-inside:avoid}article small{display:block;font-size:10px;color:#666;line-height:1.5}article>small:first-child{font-weight:bold;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px}article p{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0;padding:11px 0;overflow-wrap:anywhere}article p+p{border-top:1px solid #eee}article p.winner{font-weight:bold}.winner-label{font-size:8px;text-transform:uppercase;color:#c1181d;background:#fff0f0;border-radius:4px;padding:3px 5px}article>small:last-child{margin-top:10px}table{width:100%;border-collapse:collapse;margin:12px 0 28px;font-size:12px;table-layout:fixed}th{background:#141414;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.3px;padding:12px 9px;text-align:left}td{padding:12px 9px;border-bottom:1px solid #e5e5e5;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f7f7f7}tr{break-inside:avoid}thead{display:table-header-group}.schedule-table th:nth-child(2){width:26%}.schedule-table th:nth-child(3){width:10%}.schedule-table th:nth-child(5){width:21%}.standings-table th:first-child{width:34%}.report-footer{font-size:10px;color:#777;margin-top:28px}.schedule-section{break-before:page}
@media print{body{padding:0;font-size:10pt;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:27pt}.brand-row{margin-bottom:23px}.brand-row img{width:110px}.bracket{flex-wrap:wrap;overflow:visible;gap:12px}.round{flex:1 1 29%;min-width:170px;max-width:100%}.bracket-stage{break-inside:avoid}.round h3{break-after:avoid}table{font-size:8.5pt}th{font-size:7pt;padding:9px 6px}td{padding:10px 6px}article small{font-size:8pt}article{padding:12px}.report-footer{display:none}}
</style><header><div class="brand-row"><img src="${PDF_LOGO}" alt="The Squad"><span class="document-tag">Tournament report</span></div><h1>${escape(document.title)}</h1><p>Saved ${escape(new Date(document.updatedAt).toLocaleString('en-CA', {timeZone: document.topology.rules.timezone, dateStyle:'medium', timeStyle:'short'}))} · ${escape(document.topology.rules.timezone)}</p><p>Offline copy. Results and assignments reflect this export.</p><div class="report-meta"><div><b>${document.topology.teams.length}</b><span>Teams</span></div><div><b>${games.filter(g=>!g.isNotRequired).length}</b><span>Games</span></div><div><b>${games.filter(g=>g.isCompleted).length}</b><span>Completed</span></div></div></header><section><h2>Venues</h2>${competitionVenues(
    document.options.resources,
  )
    .map(
      (v) =>
        `<p><strong>${escape(v.name)}</strong>${v.address ? ` · ${escape(v.address)}` : ""}<br>${v.resources.map((r) => escape(surfaceLabel(r))).join(" · ")}</p>`,
    )
    .join("")}</section>${Object.entries(standings)
    .filter(([group]) => !group.startsWith("Swiss Round"))
    .map(
      ([group, rows]) =>
        `<h2>${escape(group)}</h2><table class="standings-table"><thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>PF</th><th>PA</th><th>Pts</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(document.topology.teams.find((t) => t.id === r.teamId)?.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.for}</td><td>${r.against}</td><td>${r.points}</td></tr>`).join("")}</tbody></table>`,
    )
    .join(
      "",
    )}<h2>Bracket</h2>${bracket}<section class="schedule-section"><h2>Schedule & results</h2><table class="schedule-table"><thead><tr><th>Round</th><th>Match</th><th>Score</th><th>Date / time</th><th>Field</th><th>Referee</th></tr></thead><tbody>${games.map((g) => `<tr><td>${escape(g.round)}</td><td>${escape(g.team1)} vs ${escape(g.team2)}</td><td>${g.isCompleted ? `${g.score1}–${g.score2}` : g.isNotRequired ? "Not required" : g.isConditional ? "If needed" : "Upcoming"}</td><td>${escape(g.date)} ${escape(g.time)}</td><td>${escape(g.location)}</td><td>${escape(g.refereeName || "Awaiting assignment")}</td></tr>`).join("")}</tbody></table></section><footer class="report-footer">THE SQUAD · Tournament report</footer></html>`;
}
export function downloadFile(
  filename: string,
  content: string,
  type = "text/html",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
