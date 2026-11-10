import {it,expect,vi} from 'vitest';
import express from 'express';
import {mountBankRoutes} from './bank-routes.mjs';
import {mountFinancialRoutes} from './financial-routes.mjs';
it.each([
 ['trial balance',mountFinancialRoutes,'imports/trial-balance'],
 ['bank pair',mountBankRoutes,'reconciliation-imports'],
])('retires %s direct parsing before scoped database or storage work',async(_label,mount,suffix)=>{
 const app=express(),router=express.Router(),scoped=vi.fn(()=>{throw Error('must not touch database');});
 mount(router,{scoped,audit:vi.fn(),result:vi.fn(),HttpError:Error});app.use(router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/tenants/t/entities/e/'+suffix,{method:'POST',headers:{'content-type':'application/json'},body:'{"csv":"unscanned contents"}'});
 expect(response.status).toBe(410);expect((await response.json()).error.code).toBe('SCANNED_IMPORT_REQUIRED');expect(scoped).not.toHaveBeenCalled();
 }finally{await new Promise(resolve=>server.close(resolve));}
});
