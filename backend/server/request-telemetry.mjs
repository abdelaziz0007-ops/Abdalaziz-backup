import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

// Only server-owned route templates and generated IDs enter these records.
export function requestTelemetry({emit=record=>console.log(JSON.stringify(record)),now=()=>performance.now(),id=()=>randomUUID()}={}){
 return (req,res,next)=>{
  req.requestId=id();res.setHeader('X-Request-ID',req.requestId);
  const start=now();let recorded=false;
  function record(aborted){
   if(recorded)return;recorded=true;
   const status=aborted?499:res.statusCode;
   const route=typeof req.route?.path==='string'?req.route.path:'unmatched';
   const method=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER';
   const value={event:'http.request',requestId:req.requestId,method,route,status,durationMs:Math.max(0,Math.round((now()-start)*100)/100),outcome:aborted?'aborted':status>=500?'server_error':status===403?'access_denied':status>=400?'client_error':'ok'};
   try{emit(value);}catch{/* Logging failure must not change an accounting response. */}
  }
  res.once('finish',()=>record(false));
  res.once('close',()=>record(!res.writableFinished));
  next();
 };
}
