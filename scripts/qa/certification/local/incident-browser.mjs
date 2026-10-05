/** Serialized Playwright callback: no Node globals or URL constructor. */
export function createIncidentBrowserObserver(page,{baseUrl}) {
  let tags=[];const requests=new WeakMap(),observedResponses=[],consoleErrors=[],failedResponses=[];
  const onRequest=request=>{const match=/^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(request.url());if(match&&match[1]===baseUrl&&['/coaches-corner','/club','/api/teams/incidents'].includes(match[2])&&tags.length)requests.set(request,{tags:[...tags],pathname:match[2],method:request.method(),startedAt:new Date().toISOString()});};
  const onResponse=response=>{const request=requests.get(response.request());if(!request)return;const status=response.status();if(status>=500)failedResponses.push({pathname:request.pathname,status});for(const tag of [...new Set([...request.tags,'incident-console','incident-network'])])observedResponses.push({tag,pathname:request.pathname,method:request.method,status,startedAt:request.startedAt,completedAt:new Date().toISOString()});};
  const onConsole=message=>{if(message.type()==='error')consoleErrors.push(message.text());},onPageError=error=>consoleErrors.push(error.message);
  page.on('request',onRequest);page.on('response',onResponse);page.on('console',onConsole);page.on('pageerror',onPageError);
  return{start(caseIds){tags=[...caseIds];},finish(){page.off('request',onRequest);page.off('response',onResponse);page.off('console',onConsole);page.off('pageerror',onPageError);return{observedResponses,consoleErrors,failedResponses};}};
}
export function validateIncidentDownload({filename,byteCount,text},{required,forbidden}) {
  if(!/^[A-Za-z0-9_-]+\.(pdf|csv)$/.test(filename)||!Number.isSafeInteger(byteCount)||byteCount<=0||byteCount>2*1024*1024)throw Error('Unsafe or unbounded incident download.');
  const normalized=String(text).replace(/\s+/g,' ');
  if(required.some(value=>!normalized.includes(value))||forbidden.some(value=>normalized.includes(value)))throw Error('Incident export content does not match its exact owned record.');
  return true;
}
