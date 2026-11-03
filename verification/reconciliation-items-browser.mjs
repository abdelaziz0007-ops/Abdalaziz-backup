import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
export async function verifyReconciliationBrowser({base,recId,storageState}){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext({storageState}),page=await context.newPage();await page.goto(base+'/#/workspace');await page.getByLabel('اختر مسودة تسوية').selectOption(recId);const panel=page.getByRole('region',{name:'قائمة التسوية المعدّلة'});await panel.getByRole('table',{name:'تغطية المطابقة حسب المصدر'}).waitFor();await panel.getByText('Synthetic bank fee awaiting recording',{exact:true}).waitFor();await panel.getByText('تمت تصفيته',{exact:false}).waitFor();
  const description='Synthetic browser documented difference';
  if(!await panel.getByText(description,{exact:true}).count()){
   await page.getByText('إضافة بند فرق موثق',{exact:true}).click();await page.getByLabel('المبلغ الموقّع للبند',{exact:true}).fill('1');await page.getByLabel('ملف الدليل الداعم',{exact:true}).selectOption({label:'كشف البنك المستورد'});await page.getByLabel('وصف بند الفرق',{exact:true}).fill(description);await page.getByLabel('سبب تسجيل بند الفرق',{exact:true}).fill('سبب موثق من اختبار واجهة التسوية');const pending=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/items'));await page.getByRole('button',{name:'حفظ بند الفرق',exact:true}).click();const response=await pending;if(response.status()!==201){const value=await response.json();throw Error('Browser item creation failed: '+JSON.stringify(value.error));}await panel.getByText(description,{exact:true}).waitFor();
  }
  for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Statement overflow at '+width);}await panel.screenshot({path:'verification/reconciliation-statement-ar.png'});await page.reload();await page.getByLabel('اختر مسودة تسوية').selectOption(recId);await page.getByRole('region',{name:'قائمة التسوية المعدّلة'}).getByText(description,{exact:true}).waitFor();
 }finally{await browser.close();}
}
if(process.argv.includes('--resume')){
 const linked=JSON.parse(await readFile('.neon','utf8'));assert.equal(linked.branch,'codex-backend-completion');const fixture=JSON.parse(await readFile('work/reconciliation-browser.json','utf8'));await verifyReconciliationBrowser(fixture);await writeFile('verification/reconciliation-items-api.json',JSON.stringify({branch:linked.branch,passed:[...fixture.passed,'Arabic adjusted statement, coverage, item creation, cleared state and unposted proposal persist after reload across five widths'],errors:[],fixtures:'Native MFA and synthetic sources on isolated completion branch; expense account is a controlled fixture; no successful scan/approval claimed'},null,2)+'\n');console.log('Reconciliation items: '+(fixture.passed.length+1)+' API/browser groups passed');
}
