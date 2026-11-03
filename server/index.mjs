import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { database } from './database.mjs';
import { snapshotSchema } from './snapshot-schema.mjs';
import { createIdentity } from './auth.mjs';
import { toNodeHandler } from 'better-auth/node';
import { backendRouter } from './backend.mjs';

// Postgres credentials are loaded only here, never into VITE_* or client code.
const env=loadEnv('development',process.cwd(),'');
for (const [key,value] of Object.entries(env)) if (process.env[key]===undefined) process.env[key]=value;
const port=Number(process.env.PORT || 5174);
const profile=process.env.APP_PROFILE||'development';
if(!['development','production'].includes(profile))throw new Error('Unsupported APP_PROFILE');
if(profile==='production'&&process.env.LOCAL_DEMO_ARCHIVE==='1')throw new Error('The single-operator demonstration archive cannot run in production');
const legacyArchive=profile==='development'&&process.env.LOCAL_DEMO_ARCHIVE==='1';
const pool=legacyArchive&&process.env.DATABASE_URL ? database() : null;
pool?.on('error',()=>console.error('Postgres idle connection error'));
const session=randomBytes(32).toString('hex');
const app=express();
app.disable('x-powered-by');
// Single-operator local server. Never expose demo personas as real authorization.
app.use((req,res,next)=>{
  if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(req.headers.host)) return res.status(403).json({error:'Local host required'});
  const origin=req.headers.origin;
  if (origin && origin!==`http://${req.headers.host}`) return res.status(403).json({error:'Cross-origin request denied'});
  next();
});
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
const backendReady=Boolean(process.env.APP_DATABASE_URL&&process.env.AUTH_DATABASE_URL&&process.env.BETTER_AUTH_SECRET&&process.env.APP_DATA_REGION);
if(backendReady){
  const target=value=>{try{const url=new URL(value);return url.hostname.replace('-pooler','')+url.pathname;}catch{throw new Error('Invalid backend database URL configuration');}};
  const expected=target(process.env.APP_DATABASE_URL);
  if(target(process.env.AUTH_DATABASE_URL)!==expected||process.env.DATABASE_URL&&target(process.env.DATABASE_URL)!==expected)throw new Error('Backend database branches differ; run npm run backend:setup after switching Neon branch');
}
const appPool=backendReady?database(process.env.APP_DATABASE_URL):null;
const identityPool=backendReady?database(process.env.AUTH_DATABASE_URL):null;
appPool?.on('error',()=>console.error('Application database connection error'));
identityPool?.on('error',()=>console.error('Identity database connection error'));
if(backendReady){
  const origin=process.env.APP_ORIGIN||`http://localhost:${port}`;
  const auth=createIdentity(identityPool,origin,process.env.BETTER_AUTH_SECRET);
  app.all('/api/auth/*splat',(req,res,next)=>{
    if(['/api/auth/request-password-reset','/api/auth/send-verification-email'].includes(req.path))return res.status(503).json({error:'Email delivery is not configured; no message was sent'});
    return toNodeHandler(auth)(req,res,next);
  });
  app.use('/api/v1',backendRouter({pool:appPool,auth,dataRegion:process.env.APP_DATA_REGION}));
}else{
  app.use(['/api/auth','/api/v1'],(_req,res)=>res.status(503).json({error:{code:'BACKEND_NOT_CONFIGURED',message:'Run npm run backend:setup'}}));
}
app.use(['/api/storage/status','/api/snapshots'],(_req,res,next)=>{
  if(!legacyArchive)return res.status(503).json({error:'Single-operator demonstration archive is disabled; use the authenticated workspace'});
  next();
});
app.get('/api/storage/status',async(_req,res)=>{
  if (!pool) return res.status(503).json({error:'Run neon deploy to configure Postgres'});
  try {
    await pool.query('SELECT 1 FROM mizan.financial_snapshots LIMIT 1');
    res.cookie('mizan_local_session',session,{httpOnly:true,sameSite:'strict',path:'/api'});
    res.json({connected:true,csrf:session,mode:'local-single-operator',service:'Postgres'});
  } catch { res.status(503).json({error:'Postgres unavailable or migration required; run npm run db:migrate'}); }
});
app.use('/api',(req,res,next)=>{
  const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).includes(`mizan_local_session=${session}`);
  if (!cookie || req.headers['x-mizan-csrf']!==session) return res.status(403).json({error:'Open storage status to start a local session'});
  if (!pool) return res.status(503).json({error:'Postgres not configured'});
  next();
});
app.use('/api',express.json({limit:'10mb'}));
app.get('/api/snapshots',async(req,res,next)=>{
  try { const result=await pool.query('SELECT id, period, created_at FROM mizan.financial_snapshots WHERE entity_id=$1 AND scenario=$2 ORDER BY created_at DESC LIMIT 30',[String(req.query.entityId||''),String(req.query.scenario||'')]);res.json(result.rows); } catch(e){next(e);}
});
app.post('/api/snapshots',async(req,res,next)=>{
  const parsed=snapshotSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid financial snapshot',details:parsed.error.issues.map(i=>i.message).slice(0,4)});
  try {
    const data=parsed.data,id=randomUUID();
    const result=await pool.query('INSERT INTO mizan.financial_snapshots (id,entity_id,period,scenario,payload) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id,created_at',[id,data.entityId,data.period,data.scenario,JSON.stringify(data)]);
    res.status(201).json(result.rows[0]);
  } catch(e){next(e);}
});
app.get('/api/snapshots/:id',async(req,res,next)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(400).json({error:'Invalid snapshot ID'});
  try {
    const result=await pool.query('SELECT payload FROM mizan.financial_snapshots WHERE id=$1 AND entity_id=$2 AND scenario=$3',[req.params.id,String(req.query.entityId||''),String(req.query.scenario||'')]);
    if(!result.rows.length)return res.status(404).json({error:'Snapshot not found in this scope'});
    res.json(result.rows[0].payload);
  }catch(e){next(e);}
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown API route'}));
app.use((error,_req,res,_next)=>{
  const kind=/timeout/i.test(error.message??'')?'timeout':/connect|terminated/i.test(error.message??'')?'connection':'internal';
  console.error('API request failed',{code:error.code||error.type||'internal',kind,name:error.name});
  res.status(error.type==='entity.too.large'?413:500).json({error:'Request failed; check server logs'});
});
let vite;
if(process.argv.includes('--dev')){
  const {createServer}=await import('vite');
  vite=await createServer({server:{middlewareMode:true,hmr:{port:port+1}}});
  app.use(vite.middlewares);
}else{
  app.use(express.static(resolve('dist')));
  app.use((_req,res)=>res.sendFile(resolve('dist/index.html')));
}
const server=app.listen(port,'127.0.0.1',()=>console.log(`Mizan ${vite?'development':'built app'}: http://localhost:${port} (local only); ${appPool?'Authenticated backend configured':pool?'Demonstration archive configured':'Database not configured'}`));
async function close(){server.close();await vite?.close();await Promise.all([pool?.end(),appPool?.end(),identityPool?.end()]);process.exit(0);}
process.on('SIGTERM',close);process.on('SIGINT',close);
