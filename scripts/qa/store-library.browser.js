// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression.
async page => {
  const base='http://localhost:9001',results=[];
  const check=(ok,label)=>{if(!ok)throw Error(label);results.push('PASS '+label);};
  const mode=(await(await page.request.get(base+'/api/app-distribution')).json()).distribution;
  // Local production-build QA only: its unchanged CSP excludes emulator hosts.
  const c=await page.context().browser().newContext({bypassCSP:true,viewport:{width:390,height:844}}),p=await c.newPage();
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await p.goto(base+'/login');
    await p.locator('#email:visible').fill('qa-pro-owner.storesep12@phase2.test');
    await p.locator('#password:visible').fill('LocalOnly-store-QA-2026!');
    await p.getByRole('button',{name:'Sign In',exact:true}).click();
    await p.getByRole('heading',{name:'Dashboard',level:1,exact:true}).waitFor({timeout:30000});
    await p.goto(base+'/files');
    await p.getByRole('heading',{name:'Store Review stripe',exact:true}).waitFor({timeout:30000});
    for(const id of ['stripe','website','backslash']){
      const card=p.getByRole('heading',{name:'Store Review '+id,exact:true}).locator('..').locator('..').locator('..');
      check(await card.getByRole('button',{name:'Open Link',exact:true}).count()===(mode==='store'?0:1),mode+' persisted '+id+' link policy');
    }
    const pdf=p.getByRole('heading',{name:'Store Review Download.pdf',exact:true}).locator('..').locator('..').locator('..');
    const pending=p.waitForEvent('download');
    await pdf.getByRole('button',{name:'Download',exact:true}).click();
    const download=await pending;
    check(download.suggestedFilename()==='Store Review Download.pdf',mode+' authenticated Library download retained');
    check(await download.failure()===null,mode+' Library download completed');
    if(mode==='store'){
      await p.getByRole('button',{name:'Add Link',exact:true}).click();
      const dialog=p.getByRole('dialog');
      await dialog.getByPlaceholder('e.g. Team Training Video').fill('Store Review Rejected New Link');
      await dialog.getByPlaceholder('https://...').fill('https://buy.stripe.com/test');
      await dialog.getByRole('button',{name:'Save Link',exact:true}).click();
      await p.getByText('Use a reviewed team resource or a local app destination.',{exact:true}).waitFor();
      check(await dialog.isVisible(),'store disallowed new Library link rejected before save');
      await p.keyboard.press('Escape');
      await p.reload();
      await p.getByRole('heading',{name:'Store Review stripe',exact:true}).waitFor();
      check(await p.getByRole('heading',{name:'Store Review Rejected New Link',exact:true}).count()===0,'store rejected Library link not persisted');
    }
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),mode+' Library mobile fit');
    check(errors.length===0,mode+' Library no uncaught errors: '+errors.join(';'));
    return results;
  }finally{await c.close();}
}
