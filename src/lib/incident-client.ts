
export async function incidentRequest(teamId:string,token:string,query='',init:RequestInit={}) {
  const response = await fetch('/api/teams/incidents?teamId='+encodeURIComponent(teamId)+query,{...init,headers:{Authorization:'Bearer '+token,...init.headers},signal:AbortSignal.timeout(20000)});
  if (!response.ok) {const payload = await response.json().catch(()=>({}));throw Error(payload.error || 'Incident operation failed.');}
  return response;
}
export async function exportCurrentIncidents(teamId:string,token:string,format:'pdf'|'csv',ids?:string[]) {
  const response = await incidentRequest(teamId,token,'&export='+format+(ids?.length === 1 ? '&incidentId='+encodeURIComponent(ids[0]) : ids?.length ? '&ids='+encodeURIComponent(ids.join(',')) : ''));
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
  link.href = url;link.download = response.headers.get('Content-Disposition')?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1] || 'SAFETY_LEDGER.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadIncidentAttachment(teamId:string,id:string,token:string,name:string) {
  const response = await incidentRequest(teamId,token,'&incidentId='+encodeURIComponent(id)+'&download=attachment');
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
  link.href = url;link.download = name.replace(/[^A-Za-z0-9 ._()-]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
