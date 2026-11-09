import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const linked=JSON.parse(await readFile('.neon','utf8'));assert.equal(linked.branch,'codex-backend-completion');
const fixture=JSON.parse(await readFile('work/scan-jobs-browser.json','utf8')),require=createRequire(import.meta.url),{chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext({storageState:fixture.storageState}),page=await context.newPage();await page.goto(fixture.base+'/#/workspace');const panel=page.getByRole('region',{name:'المصادر ومهام الفحص',exact:true});await panel.getByRole('table',{name:'المصادر المحفوظة وحالة الفحص'}).waitFor();await panel.getByRole('button',{name:'عرض المهمة',exact:true}).first().click();await panel.getByText('أُلغيت المهمة',{exact:false}).waitFor();
 for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Source panel overflow at '+width);}await panel.screenshot({path:'verification/scan-jobs-workspace-ar.png'});await page.reload();await page.getByRole('region',{name:'المصادر ومهام الفحص',exact:true}).getByRole('table',{name:'المصادر المحفوظة وحالة الفحص'}).getByText('source.csv',{exact:true}).first().waitFor();
 await writeFile('verification/scan-jobs-browser.json',JSON.stringify({branch:linked.branch,passed:['Real native MFA workspace displays stored quarantined sources and cancelled job state','Source/job panel remains within viewport at five widths and stored sources survive reload'],errors:[],liveScannerAcceptance:false},null,2)+'\n');console.log('Scan job browser: 2 groups passed; no live scanner success claimed');
}finally{await browser.close();}
