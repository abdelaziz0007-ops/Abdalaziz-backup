import {it,expect} from 'vitest';
import {createServer} from 'node:net';
import {scanSource,scannerHealth} from './clamav-client.mjs';
const now=Date.parse('2026-11-04T00:00:00Z');
async function fixture(version,reply,run){
 const streams=[];const server=createServer(socket=>{let data=Buffer.alloc(0);socket.on('data',chunk=>{data=Buffer.concat([data,chunk]);if(data.subarray(0,9).toString()==='zVERSION\0'){socket.end(version+'\0');return;}if(data.subarray(0,10).toString()!=='zINSTREAM\0')return;let offset=10;const parts=[];while(data.length>=offset+4){const size=data.readUInt32BE(offset);offset+=4;if(size===0){streams.push(Buffer.concat(parts));socket.end(reply+'\0');return;}if(data.length<offset+size)return;parts.push(data.subarray(offset,offset+size));offset+=size;}});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run({CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:String(server.address().port)},streams);}finally{await new Promise(resolve=>server.close(resolve));}
}
// Protocol fixtures only: these tests never mark a database source clean or claim live AV acceptance.
it('streams exact length-prefixed chunks and distinguishes clean/infected protocol responses',async()=>{
 const bytes=Buffer.alloc(70001,65),version='ClamAV 1.4.3/99999/Tue Nov 03 23:00:00 2026';
 await fixture(version,'stream: OK',async(env,streams)=>{expect((await scanSource(bytes,env,now)).status).toBe('clean');expect(streams[0]).toEqual(bytes);});
 await fixture(version,'stream: Example-Signature FOUND',async env=>{expect((await scanSource(bytes,env,now)).status).toBe('infected');});
});
it('fails closed for missing configuration, public destinations and stale/unavailable signatures',async()=>{
 await expect(scanSource(Buffer.from('x'),{},now)).rejects.toMatchObject({code:'SCANNER_NOT_CONFIGURED'});
 await expect(scanSource(Buffer.from('x'),{CLAMAV_HOST:'example.com'},now)).rejects.toMatchObject({code:'SCANNER_REQUIRES_LOCAL_PRIVATE_TRANSPORT'});
 for(const version of ['ClamAV 1.4.3/99999/Sun Nov 01 00:00:00 2026','COMMAND UNAVAILABLE'])await fixture(version,'stream: OK',async env=>{await expect(scanSource(Buffer.from('x'),env,now)).rejects.toMatchObject({code:version==='COMMAND UNAVAILABLE'?'SCANNER_VERSION_UNAVAILABLE':'SCANNER_SIGNATURES_STALE'});});
});
it('rejects daemon errors and size-limit responses instead of interpreting them as clean',async()=>{
 for(const response of ['INSTREAM size limit exceeded. ERROR','stream: Cannot scan ERROR'])await fixture('ClamAV 1.4.3/99999/Tue Nov 03 23:00:00 2026',response,async env=>{await expect(scanSource(Buffer.from('x'),env,now)).rejects.toMatchObject({code:response.startsWith('INSTREAM')?'SCANNER_SIZE_LIMIT':'SCANNER_SCAN_FAILED'});});
});

it('checks daemon and signatures without transmitting file data',async()=>{
 await fixture('ClamAV 1.4.3/99999/Tue Nov 03 23:00:00 2026','stream: OK',async(env,streams)=>{
  expect((await scannerHealth(env,now)).signatureDate).toBe(new Date('Tue Nov 03 23:00:00 2026').toISOString());
  expect(streams).toEqual([]);
 });
});
