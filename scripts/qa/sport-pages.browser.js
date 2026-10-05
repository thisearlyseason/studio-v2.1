// Evaluate with playwright-cli run-code against the local app. Provider responses are explicitly simulated below.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- CLI-invoked function expression.
async page => {
  const origin = await page.evaluate(() => location.origin);
  const slugs = ['soccer','basketball','baseball','rugby','football','cornhole','gymnastics','pickleball','tennis','golf','swimming','esports','ultimate-frisbee','disc-golf','hockey','slo-pitch','softball','volleyball','field-lacrosse','box-lacrosse'];
  const results = [];
  const matchingSheets = ['baseball','slo-pitch','hockey','soccer','cornhole','box-lacrosse','field-lacrosse','basketball','volleyball','pickleball','tennis','football','golf'];
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:844});
    for (const slug of ['', ...slugs]) {
      const path = `/sports${slug ? `/${slug}` : ''}`;
      const response = await page.goto(origin + path);
      if (response.status() !== 200) throw new Error(`${path}: ${response.status()}`);
      const footer = page.getByRole('contentinfo');
      await footer.getByRole('link',{name:'Explore Sports',exact:true}).waitFor({timeout:5000});
      await page.getByRole('textbox',{name:'Email address',exact:true}).waitFor();
      await page.getByRole('heading',{name:/score ?sheets/i}).first().waitFor();
      if (await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`${path} overflows at ${width}`);
      if (matchingSheets.includes(slug)) {
        await page.getByRole('link',{name:'Landscape PDF',exact:true}).waitFor();
        await page.getByRole('link',{name:'Portrait PDF',exact:true}).waitFor();
      }
      // Next's streamed response can briefly contain a hidden copy of the section.
      const pdfs = await page.locator('a[download][href$=".pdf"]:visible').evaluateAll(links => links.map(link=>link.getAttribute('href')));
      if (pdfs.length !== (matchingSheets.includes(slug) ? 2 : 0)) throw new Error(`${slug}: incorrect orientation links ${JSON.stringify(pdfs)}`);
      if (matchingSheets.includes(slug) && (!pdfs.includes(`/downloads/score-sheets/the-squad-${slug}.pdf`) || !pdfs.includes(`/downloads/score-sheets/the-squad-${slug}-portrait.pdf`))) throw new Error(`${slug}: wrong scoring format`);
      if (width === 1440) for (const pdf of pdfs) {
        const download = await page.request.get(origin+pdf);
        if (!download.ok() || !(await download.body()).toString('ascii',0,5).startsWith('%PDF-')) throw new Error(`Invalid PDF ${pdf}`);
      }
      results.push({path,width,result:'PASS'});
    }
  }
  await page.goto(origin+'/sports/hockey');
  await page.getByRole('contentinfo').getByRole('link',{name:'Explore Sports',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/sports');
  await page.locator('a[href="/sports/hockey"]').first().click();
  await page.waitForURL(url=>url.pathname==='/sports/hockey');
  for (const orientation of ['Portrait', 'Landscape']) {
    const pending = page.waitForEvent('download');
    await page.getByRole('link',{name:`${orientation} PDF`,exact:true}).click();
    const download = await pending;
    if (await download.failure()) throw new Error('Browser download failed');
    if (!download.suggestedFilename().endsWith('.pdf')) throw new Error('Download lost PDF filename');
  }
  await page.getByRole('link',{name:'Read the scoring guide',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/sports-hub/resources/score-sheet-hockey');
  await page.getByRole('heading',{name:'Print-ready score sheet',exact:true}).waitFor();
  await page.goto(origin+'/sports/hockey');
  let requests = 0;
  const handler = async route => {
    requests++;
    const body = route.request().postDataJSON();
    if (body.email !== 'qa-sports@example.invalid') throw new Error('Newsletter email was lost');
    await route.fulfill({status:requests===1?503:200,contentType:'application/json',body:JSON.stringify(requests===1?{error:'Please try again later.'}:{success:true})});
  };
  await page.route('**/api/sports-hub/newsletter',handler);
  try {
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill('invalid');
    await page.getByRole('button',{name:'Subscribe',exact:true}).click();
    if(requests) throw new Error('Invalid email was submitted');
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill('qa-sports@example.invalid');
    await page.getByRole('button',{name:'Subscribe',exact:true}).click();
    await page.getByText('Please try again later.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Subscribe',exact:true}).click();
    await page.getByText("You're in! Welcome to The Squad.",{exact:true}).waitFor();
  } finally { await page.unroute('**/api/sports-hub/newsletter',handler); }
  return {pages:results,newsletterUI:'PASS (simulated provider responses; no live email sent)'};
}
