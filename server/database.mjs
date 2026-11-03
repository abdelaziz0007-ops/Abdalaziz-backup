import pg from 'pg';
import { readFile } from 'node:fs/promises';

export function database(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is missing; run neon deploy first');
  const url=new URL(connectionString);
  // Pin certificate and hostname verification instead of relying on changing pg defaults.
  url.searchParams.set('sslmode','verify-full');
  return new pg.Pool({connectionString:url.toString(), max:3, connectionTimeoutMillis:15000, idleTimeoutMillis:30000});
}
export async function migrate(pool) {
  await pool.query(await readFile(new URL('../migrations/001_financial_snapshots.sql',import.meta.url),'utf8'));
}
