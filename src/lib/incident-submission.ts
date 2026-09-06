import {validateIncidentInput} from './incident-policy';

export function prepareIncidentSubmission(form:Record<string,unknown>,event:{requestId:string;eventId:string;eventKind:string}) {
  const supportingDocumentUrl = form.supportingDocumentUrl;
  const facts = Object.fromEntries(Object.entries(form).filter(([key])=>!['leagueId','tournamentId','reportedByName','eventName','supportingDocumentUrl'].includes(key)));
  if (supportingDocumentUrl) throw Error('Select a private supporting file instead of a URL.');
  const people = Array.isArray(facts.involvedPersonnel) ? facts.involvedPersonnel.map(person=>person.name).filter(Boolean).join(', ') : '';
  return {...validateIncidentInput({...facts,eventId:event.eventId,eventKind:event.eventKind,involvedPeople:facts.involvedPeople || facts.participantName || people}),requestId:event.requestId};
}
export async function settleIncidentSubmission(save:()=>Promise<unknown>,feedback:{busy:(value:boolean)=>void;success:()=>void;error:(message:string)=>void}) {
  feedback.busy(true);
  try {await save();feedback.success();}
  catch (error) {feedback.error(error instanceof Error?error.message:'Incident was not saved.');}
  finally {feedback.busy(false);}
}
