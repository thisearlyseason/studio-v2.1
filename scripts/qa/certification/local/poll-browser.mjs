// Serialized into the owned Playwright CLI VM; no unsupported URL globals.
export function createPollBrowserObserver(page,{baseUrl,chatId}) {
  let tags=[];
  const requests=new WeakMap(),observedResponses=[],consoleErrors=[],failedResponses=[];
  const onRequest=request=>{
    const match=/^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(request.url());
    if(!match||match[1]!==baseUrl||![`/chats/${chatId}`,'/api/teams/chat/message','/api/teams/chat/vote'].includes(match[2])||!tags.length)return;
    requests.set(request,{tags:[...tags],pathname:match[2],method:request.method(),startedAt:new Date().toISOString()});
  };
  const onResponse=response=>{
    const request=requests.get(response.request());if(!request)return;
    const status=response.status();if(status>=500)failedResponses.push({pathname:request.pathname,status});
    for(const tag of [...new Set([...request.tags,'poll-console','poll-network'])])observedResponses.push({tag,pathname:request.pathname,method:request.method,status,startedAt:request.startedAt,completedAt:new Date().toISOString()});
  };
  const onConsole=message=>{if(message.type()==='error')consoleErrors.push(message.text());};
  const onPageError=error=>consoleErrors.push(error.message);
  page.on('request',onRequest);page.on('response',onResponse);page.on('console',onConsole);page.on('pageerror',onPageError);
  return {start(caseIds){tags=[...caseIds];},finish(){page.off('request',onRequest);page.off('response',onResponse);page.off('console',onConsole);page.off('pageerror',onPageError);return {observedResponses,consoleErrors,failedResponses};}};
}
