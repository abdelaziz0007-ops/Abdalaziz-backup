import pg from 'pg';
import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function database(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is missing; run neon deploy first');
  const url=new URL(connectionString);
  // Pin certificate and hostname verification instead of relying on changing pg defaults.
  url.searchParams.set('sslmode','verify-full');
  return new pg.Pool({connectionString:url.toString(), max:3, connectionTimeoutMillis:15000, idleTimeoutMillis:30000});
}
export async function migrate(pool) {
  const client=await pool.connect(),applied=[];
  try{
    await client.query("SELECT pg_advisory_lock(734921005)");
    await client.query('CREATE SCHEMA IF NOT EXISTS mizan');
    await client.query('CREATE TABLE IF NOT EXISTS mizan.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory=new URL('../migrations/',import.meta.url);
    for(const name of (await readdir(directory)).filter(n=>/^\d+_.+\.sql$/.test(n)).sort()){
      const source=await readFile(new URL(name,directory),'utf8'),checksum=createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex');
      const previous=await client.query('SELECT sha256 FROM mizan.schema_migrations WHERE name=$1',[name]);
      if(previous.rows.length){if(previous.rows[0].sha256!==checksum)throw new Error('Applied migration changed: '+name);continue;}
      await client.query('BEGIN');
      try{
        // Legacy migration 001 contains its own transaction delimiters.
        await client.query(source.replace(/^BEGIN;\s*$/gmi,'').replace(/^COMMIT;\s*$/gmi,''));
        await client.query('INSERT INTO mizan.schema_migrations(name,sha256) VALUES($1,$2)',[name,checksum]);
        await client.query('COMMIT');applied.push(name);
      }catch(error){await client.query('ROLLBACK');throw error;}
    }
    return applied;
  }finally{await client.query('SELECT pg_advisory_unlock(734921005)').catch(()=>{});client.release();}
}
