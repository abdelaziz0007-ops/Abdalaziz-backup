import { loadEnv } from 'vite';
import { database, migrate } from './database.mjs';
for (const [key,value] of Object.entries(loadEnv('development',process.cwd(),''))) if(process.env[key]===undefined)process.env[key]=value;
const pool=database(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
try { await migrate(pool); console.log('Migration 001: financial snapshot schema ready'); }
finally { await pool.end(); }
