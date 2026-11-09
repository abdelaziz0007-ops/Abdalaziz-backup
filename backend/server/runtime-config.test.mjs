import {request} from 'node:http';
const fetch=(url,options={})=>new Promise((resolve,reject)=>{const req=request(url,options,res=>{res.resume();resolve({status:res.statusCode,headers:{get:key=>res.headers[key]}})});req.on('error',reject);req.end();});
import {describe,it,expect} from 'vitest';
import express from 'express';
import {runtimeConfig,requestBoundary} from './runtime-config.mjs';
describe('production boundary',()=>{
 it('refuses incomplete production and insecure origins',()=>{
  expect(()=>runtimeConfig({APP_PROFILE:'production',APP_ORIGIN:'http://localhost:5174'})).toThrow('HTTPS');
  expect(()=>runtimeConfig({APP_PROFILE:'production',APP_ORIGIN:'https://mizan.example'})).toThrow('Missing production configuration');
  expect(()=>runtimeConfig({APP_ORIGIN:'https://mizan.example/path'})).toThrow('origin');
  expect(()=>runtimeConfig({PORT:'invalid'})).toThrow('PORT');
 });
 it('accepts canonical HTTPS origin through a proxy but rejects forged hosts and cross-site writes',async()=>{
  const app=express();app.use(requestBoundary({production:true,origin:'https://mizan.example',port:5174}));app.all('/',(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
   let r=await fetch(base,{headers:{host:'mizan.example'}});expect(r.status).toBe(200);expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
   r=await fetch(base,{method:'POST',headers:{host:'mizan.example',origin:'https://mizan.example'}});expect(r.status).toBe(200);
   for(const headers of [{host:'evil.example'}, {host:'mizan.example',origin:'https://evil.example'}, {host:'mizan.example','x-forwarded-host':'mizan.example','x-forwarded-proto':'https'}]){
    r=await fetch(base,{method:'POST',headers});expect(r.status).toBe(403);
   }
  }finally{await new Promise(r=>server.close(r));}
 });
});
