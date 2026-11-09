import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {backend,BackendError} from './backend-client';
beforeEach(()=>{vi.stubGlobal('document',{documentElement:{lang:'en'}});vi.stubGlobal('window',new EventTarget());});
afterEach(()=>vi.unstubAllGlobals());
it('returns scoped API data and includes same-origin credentials',async()=>{
 const transport=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{saved:true}}),{status:200}));vi.stubGlobal('fetch',transport);
 expect(await backend('/resource',{})).toEqual({saved:true});expect(transport.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'same-origin'});
});
it('notifies the workspace about expired sessions without replaying the write',async()=>{
 const events:unknown[]=[];window.addEventListener('mizan:backend-error',e=>events.push((e as CustomEvent).detail));
 const transport=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'AUTHENTICATION_REQUIRED',message:'expired'},requestId:'trace'}),{status:401}));vi.stubGlobal('fetch',transport);
 await expect(backend('/resource',{})).rejects.toMatchObject({code:'AUTHENTICATION_REQUIRED',status:401,requestId:'trace'});expect(events).toHaveLength(1);expect(transport).toHaveBeenCalledTimes(1);
});
it('handles HTML outages and malformed successful JSON without crashing parsing code',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>unavailable</html>',{status:503})));await expect(backend('/resource')).rejects.toBeInstanceOf(BackendError);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('not json',{status:200})));await expect(backend('/resource')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('reports network failure and timeout distinctly',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));await expect(backend('/resource')).rejects.toMatchObject({code:'NETWORK_ERROR'});
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('timeout','TimeoutError')));await expect(backend('/resource')).rejects.toMatchObject({code:'REQUEST_TIMEOUT'});
});
