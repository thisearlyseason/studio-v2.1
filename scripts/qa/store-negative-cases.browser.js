// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression.
async page => {
  const base='http://localhost:9001', authBase='http://127.0.0.1:9099';
  if((await(await page.request.get(base+'/api/app-distribution')).json()).distribution!=='store')throw Error('Requires isolated store mode');
  const results=[], password='LocalOnly-store-QA-2026!', runId=Date.now();
  const check=(ok,label)=>{if(!ok)throw Error(label);results.push('PASS '+label);};
  async function accountForm(p,email,role='self',joinCode=''){
    await p.goto(base+'/signup');
    await p.getByRole('radio',{name:role==='self'?/^Adult Athlete/:/^Parent \/ Guardian/}).click();
    await p.getByRole('button',{name:'Continue',exact:true}).click();
    if(joinCode)await p.getByPlaceholder('8–20 CHAR CODE').fill(joinCode);
    await p.getByRole('button',{name:joinCode?'Continue with Team Code':'Continue',exact:true}).click();
    await p.locator('#signup-name').fill('Store Negative QA');
    await p.locator('#signup-email').fill(email);
    await p.locator('#signup-password').fill(password);
    await p.locator('#signup-password-confirmation').fill(password);
  }
  async function verify(p,email){
    const codes=(await(await p.request.get(authBase+'/emulator/v1/projects/demo-squad-store-foundation/oobCodes')).json()).oobCodes;
    const oob=codes.filter(x=>x.email===email&&x.requestType==='VERIFY_EMAIL').at(-1);
    check(Boolean(oob?.oobCode),email+' local verification generated');
    check((await p.request.post(authBase+'/identitytoolkit.googleapis.com/v1/accounts:update?key=store-emulator-api-key',{data:{oobCode:oob.oobCode}})).status()===200,email+' verification redeemed');
    await p.getByRole('button',{name:"I've Verified My Email"}).click();
  }
  for(const scenario of ['duplicate','network','valid-athlete','valid-parent','invalid-code']){
    const c=await page.context().browser().newContext({viewport:{width:390,height:844}}),p=await c.newPage();
    try{
      const email=scenario==='duplicate'?'native-self@store-qa.test':'native-'+scenario+'-'+runId+'@store-qa.test';
      const code=scenario.startsWith('valid-')?'STOREJOIN26':scenario==='invalid-code'?'NO_SUCH_SQUAD':'';
      await accountForm(p,email,scenario==='valid-parent'?'child':'self',code);
      if(scenario==='network')await p.route('**/api/email/verify-email',r=>r.abort('failed'));
      await p.getByRole('button',{name:/Create (?:Free )?Account/i}).click();
      if(scenario==='duplicate'){
        await p.getByText('Email Already in Use',{exact:true}).waitFor();
        check(await p.locator('#signup-email').isVisible(),'duplicate account stays on recoverable form');
      }else if(scenario==='network'){
        await p.getByText('Signup Error',{exact:true}).waitFor();
        const login=await p.request.post(authBase+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=store-emulator-api-key',{data:{email,password,returnSecureToken:true}});
        check(login.status()===400,'verification network failure rolls back new auth identity');
        check(await p.getByRole('button',{name:/Create (?:Free )?Account/i}).isEnabled(),'failed signup can be retried');
      }else{
        await p.waitForURL(u=>u.pathname==='/verify-email');
        await verify(p,email);
        if(scenario==='invalid-code'){
          await p.getByText('Account Setup Needs Attention',{exact:true}).waitFor();
          check(p.url().includes('/verify-email'),'invalid join code fails visibly without false enrollment');
        }else if(scenario==='valid-parent'){
          await p.getByRole('dialog').waitFor({timeout:30000});
          const route=await p.evaluate(()=>({path:location.pathname,returnTo:new URLSearchParams(location.search).get('returnTo')}));
          check(route.path==='/family'&&route.returnTo==='/teams/join?code=STOREJOIN26','parent valid code preserved through verification and linking route');
        }else{
          await p.getByRole('heading',{name:'Dashboard',exact:true,level:1}).waitFor({timeout:30000});
          check(await p.getByText(/BLUEBIRD-B-STORESEP12/).count()>0,'valid athlete code actually enrolls in intended team');
          await p.reload();
          await p.getByRole('heading',{name:'Dashboard',exact:true,level:1}).waitFor({timeout:30000});
          check(await p.getByText(/BLUEBIRD-B-STORESEP12/).count()>0,'joined team persists after reload');
        }
      }
    }catch(error){throw Error(scenario+': '+error.message+'; completed '+JSON.stringify(results)+'; URL '+p.url()+'; body '+(await p.locator('body').innerText()).slice(0,2000));}finally{await c.close();}
  }
  return results;
}
