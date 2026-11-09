import {createConnection} from 'node:net';
import {once} from 'node:events';
export class ScanError extends Error{constructor(code){super(code);this.code=code;}}
function configuration(env){
 const socket=env.CLAMAV_SOCKET,host=env.CLAMAV_HOST,port=Number(env.CLAMAV_PORT||3310);
 if(!socket&&!host)throw new ScanError('SCANNER_NOT_CONFIGURED');
 // Never send plaintext financial data to an arbitrary public TCP destination.
 if(host&&!['127.0.0.1','::1','localhost'].includes(host))throw new ScanError('SCANNER_REQUIRES_LOCAL_PRIVATE_TRANSPORT');
 if(!Number.isInteger(port)||port<1||port>65535)throw new ScanError('SCANNER_CONFIGURATION_INVALID');
 return socket?{path:socket}:{host,port};
}
async function exchange(command,plain,env){
 const target=configuration(env),socket=createConnection(target),timeout=Math.min(120000,Math.max(1000,Number(env.CLAMAV_TIMEOUT_MS)||60000));
 let response=Buffer.alloc(0),done=false;
 const received=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.destroy();reject(new ScanError('SCANNER_TIMEOUT'));},timeout);
  const settle=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value);};
  socket.on('data',chunk=>{response=Buffer.concat([response,chunk]);if(response.length>4096)return settle(new ScanError('SCANNER_INVALID_RESPONSE'));const end=response.indexOf(0);if(end>=0)settle(null,response.subarray(0,end).toString('utf8'));});
  socket.on('error',()=>settle(new ScanError('SCANNER_UNAVAILABLE')));socket.on('end',()=>{if(!done)settle(new ScanError('SCANNER_TRUNCATED_RESPONSE'));});
 });
 // Attach the response rejection handler immediately while writes await drain.
 received.catch(()=>{});
 try{
  if(!socket.readyState||socket.connecting)await Promise.race([once(socket,'connect'),received]);
  const write=async bytes=>{if(socket.destroyed)throw new ScanError('SCANNER_UNAVAILABLE');if(!socket.write(bytes))await Promise.race([once(socket,'drain'),received]);};
  await write(Buffer.from('z'+command+'\0'));
  if(plain){for(let offset=0;offset<plain.length;offset+=32768){const chunk=plain.subarray(offset,offset+32768),length=Buffer.alloc(4);length.writeUInt32BE(chunk.length);await write(length);await write(chunk);}await write(Buffer.alloc(4));}
  return await received;
 }catch(error){socket.destroy();throw error instanceof ScanError?error:new ScanError('SCANNER_UNAVAILABLE');}
}
export async function scanSource(plain,env=process.env,now=Date.now()){
 if(!Buffer.isBuffer(plain)||plain.length===0||plain.length>50*1024*1024)throw new ScanError('SCAN_SIZE_INVALID');
 const version=await exchange('VERSION',null,env),match=/^ClamAV ([0-9]+\.[0-9]+\.[0-9]+[^/\r\n]*)\/([0-9]+)\/(.+)$/.exec(version);
 if(!match)throw new ScanError('SCANNER_VERSION_UNAVAILABLE');
 const signatureDate=Date.parse(match[3]),hours=Number(env.CLAMAV_MAX_SIGNATURE_AGE_HOURS||24);
 if(!Number.isFinite(signatureDate)||!Number.isFinite(hours)||hours<1||hours>168||signatureDate>now+300000||now-signatureDate>hours*3600000)throw new ScanError('SCANNER_SIGNATURES_STALE');
 const response=await exchange('INSTREAM',plain,env);
 if(response==='stream: OK')return {status:'clean',scannerVersion:version,signatureDate:new Date(signatureDate).toISOString()};
 if(/^stream: .{1,256} FOUND$/.test(response))return {status:'infected',scannerVersion:version,signatureDate:new Date(signatureDate).toISOString()};
 throw new ScanError(/size limit/i.test(response)?'SCANNER_SIZE_LIMIT':'SCANNER_SCAN_FAILED');
}
