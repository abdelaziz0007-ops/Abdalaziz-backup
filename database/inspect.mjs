// Read schema metadata only, never customer rows or connection values.
import { writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { database } from '../server/database.mjs';
import { tables } from './schema.mjs';
const env=loadEnv('development',process.cwd(),''),pool=database(env.DATABASE_URL_UNPOOLED);
try{
 const names=tables.map(t=>t.name);
 const columns=(await pool.query(`SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_value
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='mizan' AND c.relname=ANY($1::text[]) ORDER BY c.relname,a.attnum`,[names])).rows;
 const constraints=(await pool.query(`SELECT c.relname AS table_name,x.conname AS name,pg_get_constraintdef(x.oid,true) AS definition
 FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mizan' AND c.relname=ANY($1::text[]) ORDER BY c.relname,x.conname`,[names])).rows;
 const triggers=(await pool.query(`SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='mizan' AND NOT t.tgisinternal AND c.relname=ANY($1::text[]) ORDER BY c.relname,t.tgname`,[names])).rows;
 const safe=value=>String(value??'—').replaceAll('|','\\|').replaceAll('\n',' ');
 const sections=names.map(name=>`## ${name}\n\n| Column | Type | Required | Default |\n|---|---|---|---|\n${columns.filter(r=>r.table_name===name).map(r=>`| ${r.column_name} | ${r.type} | ${r.required?'Yes':'No'} | \`${safe(r.default_value)}\` |`).join('\n')}\n\nConstraints:\n\n${constraints.filter(r=>r.table_name===name).map(r=>`- **${r.name}**: \`${safe(r.definition)}\``).join('\n')}\n\nTriggers:\n\n${triggers.filter(r=>r.table_name===name).map(r=>`- \`${safe(r.definition)}\``).join('\n')||'None.'}\n`);
 await writeFile(new URL('../docs/DATABASE-CATALOG.md',import.meta.url),'# Applied database catalog\n\nRead-only introspection of the '+names.length+' SRS business tables, including refinements from migrations 003–005. No customer records or credentials are included. See DATABASE-SRS.md for behavior, RLS and remaining service work.\n\n'+sections.join('\n'));
 console.log(`Database catalog: ${names.length} business tables, ${columns.length} columns, ${constraints.length} constraints, ${triggers.length} application triggers`);
}finally{await pool.end();}
