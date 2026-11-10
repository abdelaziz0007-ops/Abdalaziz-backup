import {describe,it,expect,vi,afterEach} from 'vitest';
import {createReadiness,createShutdown} from './service-lifecycle.mjs';
const response=()=>({set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
afterEach(()=>vi.useRealTimers());
describe('public readiness',()=>{
 it('requires both database roles and hides failure details',async()=>{
  for(const pools of [[null,null],[{query:()=>Promise.resolve()},null],[{query:()=>Promise.resolve()},{query:()=>Promise.reject(Error('secret connection string'))}]]){
   const res=response();await createReadiness({pools})({},res);expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({status:'unavailable'});
  }
 });
 it('checks both roles, disables caching by proxies and shares concurrent probes',async()=>{
  let resolve;const query=vi.fn(()=>new Promise(r=>{resolve=r;}));const other=vi.fn().mockResolvedValue({});
  const handler=createReadiness({pools:[{query},{query:other}]});const a=response(),b=response();
  const first=handler({},a),second=handler({},b);await Promise.resolve();resolve({});await Promise.all([first,second]);
  expect(query).toHaveBeenCalledTimes(1);expect(other).toHaveBeenCalledTimes(1);expect(a.status).toHaveBeenCalledWith(200);expect(b.set).toHaveBeenCalledWith('Cache-Control','no-store');
 });
 it('bounds response time without starting more probes while a connection is pending',async()=>{
  vi.useFakeTimers();let resolve;const query=vi.fn(()=>new Promise(r=>{resolve=r;}));const handler=createReadiness({pools:[{query},{query:vi.fn().mockResolvedValue({})}],timeoutMs:10});
  const a=response();const first=handler({},a);await vi.advanceTimersByTimeAsync(10);await first;expect(a.status).toHaveBeenCalledWith(503);
  const b=response();const second=handler({},b);await vi.advanceTimersByTimeAsync(10);await second;expect(query).toHaveBeenCalledTimes(1);resolve({});
 });
 it('withdraws cached readiness during shutdown',async()=>{
  let draining=false;const handler=createReadiness({pools:[{query:vi.fn().mockResolvedValue({})},{query:vi.fn().mockResolvedValue({})}],isDraining:()=>draining});
  await handler({},response());draining=true;const res=response();await handler({},res);expect(res.status).toHaveBeenCalledWith(503);
 });
});
describe('graceful shutdown',()=>{
 it('waits for responses before cleanup and handles repeated signals once',async()=>{
  let drained;const cleanup=vi.fn().mockResolvedValue(),exit=vi.fn(),markDraining=vi.fn();const server={close:vi.fn(cb=>{drained=cb;})};
  const close=createShutdown({server,cleanup,exit,markDraining});const a=close();expect(close()).toBe(a);expect(markDraining).toHaveBeenCalledTimes(1);expect(cleanup).not.toHaveBeenCalled();drained();await a;expect(cleanup).toHaveBeenCalledTimes(1);expect(exit).toHaveBeenCalledWith(0);
 });
 it('forces a bounded failed stop if responses never drain',async()=>{
  vi.useFakeTimers();const exit=vi.fn(),server={close:vi.fn(),closeAllConnections:vi.fn()};createShutdown({server,cleanup:vi.fn(),exit,markDraining:vi.fn(),timeoutMs:20})();await vi.advanceTimersByTimeAsync(20);expect(server.closeAllConnections).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledWith(1);
 });
 it('reports dependency cleanup failure',async()=>{
  const exit=vi.fn();await createShutdown({server:{close:cb=>cb()},cleanup:()=>Promise.reject(Error('failure')),exit,markDraining:()=>{}})();expect(exit).toHaveBeenCalledWith(1);
 });
});
