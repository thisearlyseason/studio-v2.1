import {createHash} from 'node:crypto';
import {zonedInstant} from './competition/schedule';
type Row = Record<string, any>;
const key = (row: Row) => String(row.email || row.refereeKey || '').trim().toLowerCase();
const interval = (g: Row, event: Row) => {
  const [h,m] = String(g.time || '').split(':').map(Number);
  const start = h*60+m, duration = Number(g.gameDurationMinutes || g.durationMinutes || event.gameLength || 60);
  const startMs = Number(g.scheduledStartMs) || (g.date && Number.isFinite(start) ? zonedInstant(g.date,start,event.competition?.topology?.rules?.timezone || event.timezone || 'UTC') : undefined);
  return {date:g.date,startMinute:start,endMinute:start+duration,...(startMs ? {startMs,endMs:startMs+duration*60000}: {})};
};
export function allocateTournamentOfficials(games: Row[], profiles: Row[], external: Row[], event: Row) {
  const eligible=profiles.filter(p=>key(p)&&p.status!=='removed'&&!p.isDeleted);
  const reserved=[...external], counts=new Map<string,number>();
  const result=games.map(g=>({...g}));
  const rest=Math.max(Number(event.competition?.options?.rest || 0),Number(event.competition?.options?.travel || 0));
  for(const game of [...result].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time)))) {
    const slot=interval(game,event);
    if(game.isConditional) { delete game.refereeId; delete game.refereeName; continue; }
    if(!slot.date||!Number.isFinite(slot.startMinute)) continue;
    if(game.isCompleted) { if(game.refereeId) { const p=eligible.find(p=>(p.refereeId||p.id)===game.refereeId); if(p) reserved.push({...slot,refereeKey:key(p)}); } continue; }
    const candidates=[...eligible].sort((a,b)=>Number((b.refereeId||b.id)===game.refereeId)-Number((a.refereeId||a.id)===game.refereeId)||(counts.get(key(a))||0)-(counts.get(key(b))||0));
    const selected=candidates.find(p=>!reserved.some(r=>r.refereeKey===key(p)&&(r.startMs && slot.startMs ? slot.startMs < Number(r.endMs)+rest*60000 && Number(r.startMs)<Number(slot.endMs)+rest*60000 : r.date===slot.date&&slot.startMinute<Number(r.endMinute)+rest&&Number(r.startMinute)<slot.endMinute+rest)));
    delete game.refereeId; delete game.refereeName;
    if(selected) { game.refereeId=selected.refereeId||selected.id;game.refereeName=selected.name;reserved.push({...slot,refereeKey:key(selected)});counts.set(key(selected),(counts.get(key(selected))||0)+1); }
  }
  return result;
}
// All reads happen before the caller starts its transaction writes.
export async function planTournamentOfficials(db: FirebaseFirestore.Firestore, transaction: FirebaseFirestore.Transaction, teamId: string, eventId: string, event: Row, games: Row[], extraProfiles: Row[] = []) {
  const collection=db.collection('tournamentRefereeAssignments');
  const [profilesSnapshot,owned]=await Promise.all([transaction.get(db.collection('tournamentReferees').where('eventId','==',eventId)),transaction.get(collection.where('eventId','==',eventId))]);
  const profiles=[...profilesSnapshot.docs.filter(d=>d.data().teamId===teamId).map(d=>d.data()),...extraProfiles];
  const all=await Promise.all([...new Set(profiles.map(key).filter(Boolean))].map(k=>transaction.get(collection.where('refereeKey','==',k))));
  const external=all.flatMap(s=>s.docs.map(d=>d.data())).filter(r=>r.teamId!==teamId||r.eventId!==eventId);
  const allocated=allocateTournamentOfficials(games,profiles,external,event);
  const writes=allocated.filter(g=>g.refereeId).map(g=>{
    const profile=profiles.find(p=>(p.refereeId||p.id)===g.refereeId);
    if(!profile)return null;
    const id='tr_'+createHash('sha256').update(`${teamId}:${eventId}:${g.id}`).digest('hex').slice(0,40);
    return {ref:collection.doc(id),data:{teamId,eventId,gameId:g.id,refereeId:g.refereeId,refereeName:g.refereeName,refereeKey:key(profile),...interval(g,event),scheduleVersion:Number(event.scheduleVersion||0)+1,updatedAt:new Date().toISOString()}};
  }).filter(Boolean);
  return {games:allocated,writeCount:writes.length+owned.docs.filter(d=>d.data().teamId===teamId).length,apply(){for(const d of owned.docs)if(d.data().teamId===teamId)transaction.delete(d.ref);for(const w of writes)if(w)transaction.set(w.ref,w.data);}};
}
