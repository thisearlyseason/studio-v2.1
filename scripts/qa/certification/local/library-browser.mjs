export function createLibraryBrowserObserver(page,{baseUrl}){
  let tags=[];const requests=new WeakMap(),observedResponses=[],consoleErrors=[],failedResponses=[];
  const onRequest=request=>{const match=/^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(request.url());if(match&&match[1]===baseUrl&&['/files','/api/teams/library'].includes(match[2])&&tags.length)requests.set(request,{tags:[...tags],pathname:match[2],method:request.method(),startedAt:new Date().toISOString()});};
  const onResponse=response=>{const request=requests.get(response.request());if(!request)return;const status=response.status();if(status>=500)failedResponses.push({pathname:request.pathname,status});for(const tag of [...new Set([...request.tags,'lib-console','lib-network'])])observedResponses.push({tag,pathname:request.pathname,method:request.method,status,startedAt:request.startedAt,completedAt:new Date().toISOString()});};
  const onConsole=message=>{if(message.type()==='error')consoleErrors.push(message.text());},onPageError=error=>consoleErrors.push(error.message);
  page.on('request',onRequest);page.on('response',onResponse);page.on('console',onConsole);page.on('pageerror',onPageError);
  return{start(caseIds){tags=[...caseIds];},finish(){page.off('request',onRequest);page.off('response',onResponse);page.off('console',onConsole);page.off('pageerror',onPageError);return{observedResponses,consoleErrors,failedResponses};}};
}

export function validateLibraryDownload({filename,byteCount,sha256},{name,length,hash}){
  if(filename!==name||filename.includes('/')||filename.includes('\\')||/[\r\n]/.test(filename))throw Error('Unexpected Library attachment filename.');
  if(byteCount!==length||byteCount>10*1024*1024||byteCount<1)throw Error('Unexpected Library attachment length.');
  if(sha256!==hash)throw Error('Library attachment SHA-256 mismatch.');
  return true;
}

export async function completeLibraryUpload(response,reload,deadline){
  const result=await Promise.race([response.json(),deadline().then(()=>{throw Error('Library response body exceeded its deadline.');})]);
  if(typeof result?.fileId!=='string'||!result.fileId)throw Error('Library upload omitted its exact file identity.');
  await reload();
  return result.fileId;
}
