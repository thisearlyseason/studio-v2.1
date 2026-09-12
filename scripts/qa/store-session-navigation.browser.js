// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression.
async page => {
  const base='http://localhost:9001',results=[];
  const mode=(await(await page.request.get(base+'/api/app-distribution')).json()).distribution;
  if(mode!=='store')throw Error('Requires isolated store mode');
  const check=(ok,label)=>{if(!ok)throw Error(label);results.push('PASS '+label);};
  for(const [id,email] of [['school','native-school_ad@store-qa.test'],['league','native-league_creator@store-qa.test'],['paid','qa-pro-owner.storesep12@phase2.test']]){
    const c=await page.context().browser().newContext({viewport:{width:1440,height:900}}),p=await c.newPage();
    try{
      await p.goto(base+'/login?returnTo=%2Fpricing');
      await p.evaluate(()=>sessionStorage.setItem('squad_return_path','/dashboard/billing'));
      await p.locator('#email').fill(email);
      await p.locator('#password').fill('LocalOnly-store-QA-2026!');
      await p.getByRole('button',{name:'Sign In',exact:true}).click();
      await p.getByRole('heading',{name:'Dashboard',exact:true,level:1}).waitFor({timeout:30000});
      await p.getByRole('heading',{name:'Next Actions',exact:true}).waitFor();
      check((await p.evaluate(()=>location.pathname))==='/dashboard',id+' hydrated login rejects stale billing return');
      await p.reload();
      await p.getByRole('heading',{name:'Dashboard',exact:true,level:1}).waitFor({timeout:30000});
      await p.getByRole('heading',{name:'Next Actions',exact:true}).waitFor();
      check((await p.evaluate(()=>location.pathname))==='/dashboard',id+' hydrated reload keeps safe dashboard');
      if(id==='paid'){
        check(await p.getByText(/CRIMSON-PRO-STORESEP12/).count()>0,'existing paid user retains intended team');
        check(await p.getByText('Active',{exact:true}).count()>0,'existing paid user retains active portal access');
      }
      await p.goto(base+'/settings');
      await p.getByRole('heading',{name:'Global Settings',exact:true,level:1}).waitFor({timeout:30000});
      check(await p.getByRole('link',{name:/Manage Subscription|Upgrade|Checkout/i}).count()===0,id+' settings has no purchase link');
      for(const size of [{width:1440,height:900},{width:390,height:844}]){
        await p.setViewportSize(size);
        check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' settings fits '+size.width);
      }
      await p.getByRole('button',{name:'Sign Out',exact:true}).click();
      await p.waitForURL(u=>u.pathname==='/login',{timeout:30000});
      check(true,id+' logout still works');
    }finally{await c.close();}
  }
  return results;
}
