// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression.
async page => {
  const base='http://localhost:9001', authBase='http://127.0.0.1:9099', project='demo-squad-store-foundation';
  const mode=(await(await page.request.get(base+'/api/app-distribution')).json()).distribution;
  if(mode!=='store')throw Error('Identity acceptance requires store build');
  const results=[];
  const check=(ok,label)=>{if(!ok)throw Error(label);results.push('PASS '+label);};
  const roles=[['self',/^Adult Athlete/,'/teams/join'],['child',/^Parent \/ Guardian/,'/family'],['coach',/^Coach \/ Team/,'/teams/new'],['school_ad',/^School \/ Athletic/,'/dashboard'],['league_creator',/^League \/ Tournament/,'/dashboard']];
  for(const [id,label,destination] of roles){
    const context=await page.context().browser().newContext({viewport:{width:390,height:844}});
    const p=await context.newPage();
    const errors=[], badResponses=[];
    p.on('pageerror', e=>errors.push(e.message));
    p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)badResponses.push({url:r.url().split('?')[0],status:r.status()});});
    try{
      await p.goto(base+'/signup');
      await p.getByRole('radio',{name:label}).click();
      await p.getByRole('button',{name:'Continue',exact:true}).click();
      if(id==='self'||id==='child')await p.getByRole('button',{name:'Continue',exact:true}).click();
      await p.locator('#signup-name').fill('Native QA '+id);
      await p.locator('#signup-email').fill('native-'+id+'@store-qa.test');
      await p.locator('#signup-password').fill('LocalOnly-store-QA-2026!');
      await p.locator('#signup-password-confirmation').fill('LocalOnly-store-QA-2026!');
      await p.getByRole('button',{name:/Create (?:Free )?Account/i}).click();
      await p.waitForURL(u=>u.pathname==='/verify-email',{timeout:30000});
      check(true,id+' actual account creation reaches verification gate');
      const login=await(await p.request.post(authBase+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=store-emulator-api-key',{data:{email:'native-'+id+'@store-qa.test',password:'LocalOnly-store-QA-2026!',returnSecureToken:true}})).json();
      const unverified=await p.request.post(base+'/api/auth/session',{headers:{Authorization:'Bearer '+login.idToken}});
      check(unverified.status()===403,id+' unverified session denied');
      const oob=(await(await p.request.get(authBase+'/emulator/v1/projects/'+project+'/oobCodes')).json()).oobCodes.filter(x=>x.email==='native-'+id+'@store-qa.test'&&x.requestType==='VERIFY_EMAIL').at(-1);
      check(Boolean(oob?.oobCode),id+' verification action generated in isolated mail sink');
      const verified=await p.request.post(authBase+'/identitytoolkit.googleapis.com/v1/accounts:update?key=store-emulator-api-key',{data:{oobCode:oob.oobCode}});
      check(verified.status()===200,id+' real emulator verification action redeemed');
      await p.getByRole('button',{name:"I've Verified My Email"}).click();
      await p.waitForURL(u=>u.pathname===destination,{timeout:30000});
      await p.reload();
      await p.waitForURL(u=>u.pathname===destination,{timeout:30000});
      check(true,id+' verified safe destination survives reload');
      check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' verified mobile destination fits');
      check(errors.length===0,id+' no page errors: '+JSON.stringify(errors));
      check(badResponses.length===0,id+' no unexpected app responses: '+JSON.stringify(badResponses));
    }finally{await context.close();}
  }
  return {mode,results};
}
