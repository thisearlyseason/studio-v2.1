// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression.
async page => {
  const base='http://localhost:9001',results=[];
  const mode=(await(await page.request.get(base+'/api/app-distribution')).json()).distribution;
  const check=(ok,label)=>{if(!ok)throw Error(label);results.push('PASS '+label);};
  // Built QA fixture uses emulators; production CSP itself remains unchanged.
  const c=await page.context().browser().newContext({bypassCSP:true}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try{
    await p.goto(base+'/');
    await p.getByRole('heading',{level:1}).first().waitFor();
    if(mode==='store')await p.locator('#email:visible').waitFor();
    check(mode==='store'?await p.locator('#email:visible').count()===1:await p.locator('#email:visible').count()===0,mode+' root retains intended identity');
    for(const size of [{width:1440,height:900},{width:390,height:844}]){
      await p.setViewportSize(size);
      await p.goto(base+'/sports/hockey');
      await p.getByRole('heading',{level:1}).waitFor();
      await p.getByRole('link',{name:'Portrait PDF',exact:true}).waitFor();
      check(await p.locator('a[href="/#pricing"]:visible').count()===(mode==='store'?0:1),mode+' sport purchase CTA '+size.width);
      check(await p.locator('a[download]:visible').count()===2,mode+' scoresheet downloads retained '+size.width);
      check(await p.locator('footer:visible').count()>0,mode+' footer retained '+size.width);
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),mode+' sport mobile/desktop fit '+size.width);
    }
    for(const route of ['/how-to','/privacy']){
      await p.goto(base+route);await p.getByRole('heading',{level:1}).first().waitFor();
      check(true,mode+' '+route+' reachable');
    }
    for(const route of ['/api/checkout','/api/stripe/create-checkout','/api/stripe/customer-portal','/api/stripe/payment-items','/api/stripe/fundraising-link','/api/stripe/connect/onboard','/api/subscription/addon','/api/subscription/update']){
      const r=await p.request.post(base+route,{data:{}});
      check(r.status()===(mode==='store'?403:401),mode+' '+route+' correct early boundary');
    }
    check(errors.length===0,mode+' no uncaught errors: '+errors.join(';'));
    return results;
  }finally{await c.close();}
}
