const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://localhost:5180';
(async()=>{
  const fixture=JSON.parse(fs.readFileSync('fake-data.json','utf8'));
  const lines=['period,accountCode,name,classification,signedDebitBalance,role'];
  for(const month of ['2026-10','2026-11'])for(const r of fixture.trialBalance){
    const amount=month==='2026-11'?({'1000':'104200.00','4000':'-130000.00'}[r.accountCode]??r.signedDebitBalance):r.signedDebitBalance;
    lines.push([month,r.accountCode,r.name.en,r.classification,amount,{'1000':'cash','1100':'receivables','1200':'inventory','2000':'payables'}[r.accountCode]??''].map(value=>'"'+String(value).replaceAll('"','""')+'"').join(','));
  }
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const savedIds=[],passed=[],errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.evaluate(()=>localStorage.clear());
    await page.goto(base+'/#/app/analysis?view=inputs');
    await page.waitForFunction(()=>document.querySelector('#ctx-period-d')?.value==='PER-ENT-ATLAS-2026-10');
    await page.locator('input[type=file]').first().setInputFiles({name:'neon-synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(lines.join('\n'))});
    await page.getByRole('button',{name:'نشر الفترات وربط المخرجات',exact:true}).waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('main').innerText());throw e;});
    await page.getByRole('button',{name:'نشر الفترات وربط المخرجات',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#ctx-period-d')?.value==='PER-ENT-ATLAS-2026-11');
    await page.goto(base+'/#/app/reports/executive');
    await page.getByLabel('ملاحظات الإدارة — للحفظ الدائم استخدم الحفظ والاسترجاع').fill('Neon synthetic persistence verification');
    await page.getByRole('button',{name:'الحفظ والاسترجاع',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Postgres متصل'}).waitFor();
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/snapshots')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'حفظ نسخة جديدة',exact:true}).click();
    const response=await saved;assert.equal(response.status(),201);savedIds.push((await response.json()).id);
    await page.getByRole('status').filter({hasText:'حُفظت نسخة جديدة'}).waitFor();passed.push('Browser publishes two periods and saves a real Postgres snapshot with management notes');
    await page.reload();
    await page.waitForTimeout(900);
    assert.equal(await page.getByLabel('ملاحظات الإدارة — للحفظ الدائم استخدم الحفظ والاسترجاع').inputValue(),'');
    await page.getByRole('button',{name:'الحفظ والاسترجاع',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Postgres متصل'}).waitFor();
    await page.getByRole('button',{name:'استرجاع',exact:true}).first().click();
    await page.waitForFunction(()=>document.querySelector('#ctx-period-d')?.value==='PER-ENT-ATLAS-2026-11');
    if(await page.getByRole('dialog').isVisible())await page.getByRole('dialog').getByRole('button',{name:/إغلاق|Close/}).click();
    assert.equal(await page.getByLabel('ملاحظات الإدارة — للحفظ الدائم استخدم الحفظ والاسترجاع').inputValue(),'Neon synthetic persistence verification');
    assert((await page.locator('main').innerText()).includes('130,000.00'));
    passed.push('Reload clears memory; restore recovers November, both source periods, exact revenue and notes from Postgres');
    await page.screenshot({path:'verification/neon-restored.png',fullPage:true});
    const status=await page.request.get(base+'/api/storage/status');const token=(await status.json()).csrf;
    const csrfHeaders={'X-Mizan-CSRF':token};
    const wrong=await page.request.get(base+'/api/snapshots/'+savedIds[0]+'?entityId=ENT-CEDAR&scenario=baseline',{headers:csrfHeaders});assert.equal(wrong.status(),404);
    const cross=await page.request.post(base+'/api/snapshots',{headers:{...csrfHeaders,Origin:'https://example.com'},data:{}});assert.equal(cross.status(),403);
    const invalid=await page.request.post(base+'/api/snapshots',{headers:csrfHeaders,data:{version:1}});assert.equal(invalid.status(),400);
    const unauthorized=await fetch(base+'/api/snapshots?entityId=ENT-ATLAS&scenario=baseline');assert.equal(unauthorized.status,403);
    passed.push('API rejects missing session, foreign origin, invalid payload and a snapshot requested under another entity');
    for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(120);const size=await page.evaluate(()=>[innerWidth,document.documentElement.scrollWidth]);assert(size[1]<=size[0]+1,'Page overflows at '+width);}
    passed.push('Storage control and restored report fit mobile, tablet and desktop');
    assert.equal(errors.length,0,errors.join('\n'));
  }finally{
    await browser.close();
    // Remove only the synthetic rows created by this exact test run.
    if(savedIds.length){const {loadEnv}=await import('vite');const {database}=await import('../server/database.mjs');const env=loadEnv('development',process.cwd(),'');const pool=database(env.DATABASE_URL);try{await pool.query('DELETE FROM mizan.financial_snapshots WHERE id = ANY($1::uuid[])',[savedIds]);}finally{await pool.end();}}
  }
  fs.writeFileSync('verification/neon-e2e.json',JSON.stringify({service:'Postgres',branch:'production',passed,errors,syntheticSnapshotsRemoved:true},null,2));
  console.log('Neon E2E: '+passed.length+' checks passed; browser → local API → Postgres → reload → restore; synthetic snapshots removed');
})().catch(e=>{console.error(e.message);process.exit(1);});
