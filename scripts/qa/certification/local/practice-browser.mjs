// Case-scoped Practice browser evidence and responsive measurements.
export function createPracticeBrowserObserver(page, {baseUrl, prefix, firestoreOrigin='http://127.0.0.1:8080'}) {
  let tags=[];
  const started=new WeakMap(), observedResponses=[], consoleErrors=[], failedResponses=[];
  const route=value=>{
    const match=/^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(value);
    if(!match)return null;
    if(match[1]===baseUrl&&(/^\/(practice|drills|events)$/.test(match[2])||match[2]==='/api/teams/events/action'))return match[2];
    if(match[1]===firestoreOrigin&&/^\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel$/.test(match[2]))return match[2];
    return null;
  };
  const onRequest=request=>{
    const pathname=route(request.url());
    if(pathname==='/google.firestore.v1.Firestore/Write/channel'){
      let body='';try{body=decodeURIComponent(request.postData()||'');}catch{return;}
      if(!/"writes"\s*:\s*\[\s*\{/.test(body))return;
    }
    if(pathname&&tags.length)started.set(request,{pathname,tags:[...tags],method:request.method(),startedAt:new Date().toISOString()});
  };
  const onResponse=response=>{
    const request=started.get(response.request());if(!request)return;
    const status=response.status();if(status>=500)failedResponses.push({pathname:request.pathname,status});
    for(const tag of [...new Set([...request.tags,`${prefix}-console`,`${prefix}-network`])])observedResponses.push({tag,pathname:request.pathname,method:request.method,status,startedAt:request.startedAt,completedAt:new Date().toISOString()});
  };
  const onConsole=message=>{if(message.type()==='error')consoleErrors.push(message.text());};
  const onPageError=error=>consoleErrors.push(error.message);
  page.on('request',onRequest);page.on('response',onResponse);page.on('console',onConsole);page.on('pageerror',onPageError);
  return {start(caseIds){tags=[...caseIds];},finish(){page.off('request',onRequest);page.off('response',onResponse);page.off('console',onConsole);page.off('pageerror',onPageError);return{observedResponses,consoleErrors,failedResponses};}};
}

export function requirePracticeResponses(responses,caseId,{mutation=false}={}) {
  const selected=responses.filter(response=>response.tag===caseId);
  if(!selected.length)throw new Error(`Practice ${caseId} is missing its browser capture.`);
  if(mutation&&!selected.some(response=>response.method==='POST'&&response.status>=200&&response.status<300&&(response.pathname==='/api/teams/events/action'||response.pathname==='/google.firestore.v1.Firestore/Write/channel')))throw new Error(`Practice ${caseId} is missing actual mutation transport.`);
  return selected;
}

export async function measurePracticeBounds(page,controls) {
  const boxes={};
  for(const [name,locator] of Object.entries(controls)){await locator.scrollIntoViewIfNeeded();boxes[name]=await locator.boundingBox();}
  return{viewport:page.viewportSize(),pageWidth:await page.evaluate(()=>document.documentElement.scrollWidth),boxes};
}

export function validatePracticeBounds(rows) {
  if(!rows.some(row=>row.viewport.width===1440&&row.viewport.height===900)||!rows.some(row=>row.viewport.width===390&&row.viewport.height===844))throw new Error('Practice bounds must measure both exact viewports.');
  for(const row of rows){const {width,height}=row.viewport;if(row.pageWidth>width||!Object.keys(row.boxes).length||Object.values(row.boxes).some(box=>!box||box.width<=0||box.height<=0||box.x<-.5||box.y<-.5||box.x+box.width>width+.5||box.y+box.height>height+.5))throw new Error('Practice surface/control exceeds viewport bounds: '+JSON.stringify(row));}
  return true;
}
