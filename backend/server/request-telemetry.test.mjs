import {describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {requestTelemetry} from './request-telemetry.mjs';
function response(){const r=new EventEmitter();r.statusCode=200;r.writableFinished=false;r.setHeader=vi.fn();return r;}
describe('request telemetry',()=>{
 it('shares a server-generated trace and emits no private request fields',()=>{
  const emit=vi.fn(),req={method:'POST',url:'/api/auth/reset-password?token=secret',headers:{authorization:'Bearer secret','x-request-id':'forged'},body:{password:'secret'},route:{path:'/api/auth/*splat'}},res=response(),next=vi.fn();
  let time=10;requestTelemetry({emit,now:()=>time,id:()=> 'server-id'})(req,res,next);time=25.75;res.writableFinished=true;res.emit('finish');res.emit('close');
  expect(next).toHaveBeenCalledOnce();expect(req.requestId).toBe('server-id');expect(emit).toHaveBeenCalledOnce();expect(emit.mock.calls[0][0]).toEqual({event:'http.request',requestId:'server-id',method:'POST',route:'/api/auth/*splat',status:200,durationMs:15.75,outcome:'ok'});expect(JSON.stringify(emit.mock.calls)).not.toContain('secret');
 });
 it('records incomplete connections once as aborted',()=>{
  const emit=vi.fn(),res=response();requestTelemetry({emit})({method:'GET'},res,()=>{});res.emit('close');res.emit('finish');expect(emit).toHaveBeenCalledOnce();expect(emit.mock.calls[0][0]).toMatchObject({status:499,route:'unmatched',outcome:'aborted'});
 });
 it.each([[403,'access_denied'],[401,'client_error'],[503,'server_error']])('classifies status %s without logging error details',(status,outcome)=>{
  const emit=vi.fn(),res=response();res.statusCode=status;requestTelemetry({emit})({method:'GET'},res,()=>{});res.emit('finish');expect(emit.mock.calls[0][0].outcome).toBe(outcome);
 });
 it('does not fail responses when log delivery fails',()=>{
  const res=response();requestTelemetry({emit:()=>{throw Error('sink offline');}})({method:'GET'},res,()=>{});expect(()=>res.emit('finish')).not.toThrow();
 });
});
