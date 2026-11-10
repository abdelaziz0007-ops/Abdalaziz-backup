// Public probes deliberately expose no database names, credentials or errors.
export function createReadiness({pools, isDraining=()=>false, timeoutMs=4000, cacheMs=1000}) {
 let pending, cached, expires=0;
 async function probe(){
  if(isDraining() || pools.length!==2 || pools.some(p=>!p))return false;
  if(Date.now()<expires)return cached;
  if(!pending){
   pending=Promise.all(pools.map(p=>Promise.resolve().then(()=>p.query({text:'SELECT 1',query_timeout:3000}))))
    .then(()=>true,()=>false).then(ok=>{cached=ok;expires=Date.now()+cacheMs;return ok;})
    .finally(()=>{pending=undefined;});
  }
  let timer;
  try{return await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);}
  finally{clearTimeout(timer);}
 }
 return async(_req,res)=>{
  const ready=await probe();
  res.set('Cache-Control','no-store').status(ready&&!isDraining()?200:503).json({status:ready&&!isDraining()?'ready':'unavailable'});
 };
}

// Stop accepting connections, drain active responses, then release dependencies.
export function createShutdown({server,cleanup,markDraining,exit,timeoutMs=25000}) {
 let stopping;
 return function shutdown(){
  if(stopping)return stopping;
  markDraining();
  const deadline=setTimeout(()=>{server.closeAllConnections?.();exit(1);},timeoutMs);
  stopping=(async()=>{
   try{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await cleanup();
    clearTimeout(deadline);exit(0);
   }catch{clearTimeout(deadline);exit(1);}
  })();
  return stopping;
 };
}
