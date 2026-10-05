// Self-contained for serialization into the Playwright CLI VM (no Node globals).
export function createMediaBrowserObserver(page,{baseUrl}){
  let tags=[];const requests=new WeakMap(),observedResponses=[],consoleErrors=[],failedResponses=[];
  const onRequest=request=>{const match=/^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(request.url());if(match&&match[1]===baseUrl&&['/settings','/team','/roster','/coaches-corner','/api/media','/api/media/recruiting'].includes(match[2])&&tags.length)requests.set(request,{tags:[...tags],pathname:match[2],method:request.method(),startedAt:new Date().toISOString()});};
  const onResponse=response=>{const request=requests.get(response.request());if(!request)return;const status=response.status();if(status>=500)failedResponses.push({pathname:request.pathname,status});for(const tag of [...new Set([...request.tags,'media-console','media-network'])])observedResponses.push({tag,pathname:request.pathname,method:request.method,status,startedAt:request.startedAt,completedAt:new Date().toISOString()});};
  const onConsole=message=>{if(message.type()==='error')consoleErrors.push(message.text());},onPageError=error=>consoleErrors.push(error.message);
  page.on('request',onRequest);page.on('response',onResponse);page.on('console',onConsole);page.on('pageerror',onPageError);
  return{start(caseIds){tags=[...caseIds];},finish(){page.off('request',onRequest);page.off('response',onResponse);page.off('console',onConsole);page.off('pageerror',onPageError);return{observedResponses,consoleErrors,failedResponses};}};
}

// Append a legal ISO BMFF free box: sample offsets/container bytes stay intact.
// Never allocate or retain a boundary-sized payload on disk or in memory.
export async function* generatedMp4Body(prefix,total){
  if(!Number.isSafeInteger(total)||total-prefix.length<8||total>500*1024*1024+1)throw Error('Invalid bounded MP4 fixture length.');
  yield prefix;const header=Buffer.alloc(8);header.writeUInt32BE(total-prefix.length,0);header.write('free',4,'ascii');yield header;
  let remaining=total-prefix.length-8;const zeros=Buffer.alloc(64*1024);
  while(remaining){const count=Math.min(remaining,zeros.length);yield zeros.subarray(0,count);remaining-=count;}
}

export function parseMediaBrowserEnvelope(raw,caseId){
  let result;try{result=JSON.parse(raw);}catch{throw Error(`Media ${caseId} browser envelope is missing or invalid (${raw.length} stdout characters).`);}
  if(!result||!Object.hasOwn(result,'value')||!['observedResponses','consoleErrors','failedResponses'].every(key=>Array.isArray(result[key])))throw Error(`Media ${caseId} browser envelope is incomplete.`);
  return result;
}
