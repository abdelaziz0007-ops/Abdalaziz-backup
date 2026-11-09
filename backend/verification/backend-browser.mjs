import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const linked=JSON.parse(await readFile('.neon','utf8'));assert(linked.branch.startsWith('codex-backend-'),'Browser fixtures require an isolated backend test branch');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),base=process.env.TEST_BASE_URL||'http://localhost:5190';
const passed=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#/workspace');await page.waitForURL('**/#/auth/sign-in');passed.push('A signed-out browser is redirected from the real workspace to sign in');
 await page.goto(base+'/#/auth/sign-up');
 const email='ui-'+randomUUID()+'@example.invalid',password='Mizan!'+randomBytes(20).toString('hex');
 await page.getByLabel('الاسم',{exact:true}).fill('اختبار واجهة اصطناعي');await page.getByLabel('البريد الإلكتروني',{exact:true}).fill(email);await page.getByLabel('كلمة المرور',{exact:true}).fill(password);await page.getByRole('button',{name:'إنشاء الحساب',exact:true}).click();
 await page.getByLabel('كلمة المرور لتأكيد الإعداد',{exact:true}).fill(password);await page.getByRole('button',{name:'إعداد تطبيق المصادقة',exact:true}).click();
 const field=page.getByLabel('رابط الإعداد اليدوي — سري',{exact:true});await field.waitFor();const uri=await field.inputValue();const secret=base32.decode(new URL(uri).searchParams.get('secret'));
 const code=await createOTP(secret,{digits:6,period:30}).totp();await page.getByLabel('رمز تطبيق المصادقة',{exact:true}).fill(code);await page.getByRole('button',{name:'تحقق ومتابعة',exact:true}).click();
 await page.getByLabel('اسم مساحة العمل',{exact:true}).waitFor();passed.push('Browser signup and QR/TOTP enrollment lead to a real MFA-verified session');
 await page.getByLabel('اسم مساحة العمل',{exact:true}).fill('مساحة اختبار محفوظة');await page.getByRole('checkbox',{name:/أوافق على منحي إدارة المنشآت/}).check();await page.getByRole('button',{name:'إنشاء المساحة',exact:true}).click();
 await page.getByLabel('اسم المنشأة',{exact:true}).fill('شركة اختبار محفوظة');await page.getByLabel('رمز المنشأة',{exact:true}).fill('0007');await page.getByLabel('الإطار المحاسبي',{exact:true}).fill('سياسة اختبار اصطناعية');await page.getByRole('checkbox',{name:/امنحني صلاحية إعداد وعرض/}).check();await page.getByRole('button',{name:'حفظ المنشأة',exact:true}).click();
 await page.getByLabel('بداية الفترة',{exact:true}).fill('2026-10-01');await page.getByLabel('نهاية الفترة',{exact:true}).fill('2026-10-31');await page.getByRole('button',{name:'إنشاء الفترة',exact:true}).click();
 await page.getByRole('table',{name:'الفترات المحفوظة'}).getByText('2026-10-01',{exact:true}).waitFor();passed.push('Arabic forms create a real workspace, scoped entity and accounting period');
 await page.reload();await page.getByRole('table',{name:'الفترات المحفوظة'}).getByText('2026-10-01',{exact:true}).waitFor();assert((await page.locator('body').innerText()).includes('0007'));
 passed.push('Reload restores the authenticated session and persisted period from the backend');await page.screenshot({path:'verification/backend-workspace-ar.png',fullPage:true});
 for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);const box=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(box.scroll<=box.width+1,'Workspace overflow at '+width);}
 passed.push('Real workspace fits five phone, tablet and desktop widths');
 await page.getByRole('button',{name:'تسجيل الخروج',exact:true}).click();await page.waitForURL('**/#/auth/sign-in');await page.goto(base+'/#/workspace');await page.waitForURL('**/#/auth/sign-in');passed.push('Sign out prevents protected workspace access');
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile('verification/backend-browser.json',JSON.stringify({branch:linked.branch,passed,errors,fixtures:'Synthetic accounts and organizations only on disposable test branch'},null,2)+'\n');console.log('Backend browser: '+passed.length+' end-to-end checks passed');
}catch(e){console.error('Backend browser failed:',e.message);process.exitCode=1;}
finally{await browser.close();}
