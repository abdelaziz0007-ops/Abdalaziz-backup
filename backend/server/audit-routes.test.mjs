import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {auditCsv,collectAuditExport,encodeAuditCursor,decodeAuditCursor,mountAuditRoutes} from './audit-routes.mjs';
const row=(n)=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),cursor_time:'2026-11-10T12:00:00.123456Z',created_at:new Date('2026-11-10T12:00:00.123Z'),action:'review.approve',redacted_metadata:{secret:'not exported'}});
describe('audit export',()=>{
 it('preserves microseconds and excludes metadata while neutralizing spreadsheet formulas',()=>{
  const csv=auditCsv([{...row(1),action:' =HYPERLINK("x")',object_type:'تدقيق'}]);expect(csv).toContain('12:00:00.123456Z');expect(csv).toContain("\"' =HYPERLINK");expect(csv).toContain('تدقيق');expect(csv).not.toContain('not exported');expect(csv.charCodeAt(0)).toBe(0xfeff);
 });
 it('pages through equal timestamps without duplicates and hashes exact bytes including BOM',async()=>{
  const all=Array.from({length:7},(_,i)=>row(7-i)),seen=[];
  const read=async(limit,cursor)=>{seen.push(cursor);return all.filter(r=>!cursor||r.id<cursor.id).slice(0,limit);};
  const file=await collectAuditExport(read,{batch:2,maxRows:7});expect(file.count).toBe(7);expect(seen[1]).toEqual({time:all[1].cursor_time,id:all[1].id});expect(file.csv.split('\r\n')).toHaveLength(9);expect(file.sha256).toBe(createHash('sha256').update(file.csv).digest('hex'));expect(file.byteSize).toBe(Buffer.byteLength(file.csv));
 });
 it('rejects too many events instead of returning a partial file',async()=>{
  let call=0;await expect(collectAuditExport(async()=>call++===0?[row(3),row(2)]:[row(1)],{batch:2,maxRows:2})).rejects.toThrow('AUDIT_EXPORT_LIMIT');
 });
 it('rejects oversized output and a non-advancing cursor',async()=>{
  await expect(collectAuditExport(async()=>[row(1)],{maxBytes:100})).rejects.toThrow('AUDIT_EXPORT_LIMIT');
  await expect(collectAuditExport(async()=>[row(1)],{batch:1})).rejects.toThrow('AUDIT_CURSOR_STALLED');
 });
 it('supports empty results with a header and digest',async()=>{const f=await collectAuditExport(async()=>[]);expect(f.count).toBe(0);expect(f.csv).toBe(auditCsv([]));});
});
describe('audit cursor',()=>{
 it('roundtrips full database precision',()=>expect(decodeAuditCursor(encodeAuditCursor(row(1)))).toEqual({time:row(1).cursor_time,id:row(1).id}));
 it.each(['', 'x'.repeat(241), 'not/json',Buffer.from(JSON.stringify({time:'2026-11-10T12:00:00.123456Z',id:row(1).id,tenant:'override'})).toString('base64url')])('rejects invalid or injected cursor %s',value=>expect(()=>decodeAuditCursor(value)).toThrow());
});
describe('audit route authority',()=>{
 function setup(scoped){const routes={};mountAuditRoutes({get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f},{scoped,audit:vi.fn(),result:vi.fn(),HttpError:class extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}});return routes;}
 it('requires existing workspace administration and fresh snapshot for export',async()=>{
  const scoped=vi.fn().mockResolvedValue({}),routes=setup(scoped),req={params:{tenantId:'tenant'},body:{}};
  await routes['POST /tenants/:tenantId/audit/export'](req,{},e=>{throw e;});
  expect(scoped.mock.calls[0][3]).toBe('members.manage');expect(scoped.mock.calls[0][5]).toEqual({fresh:true,snapshot:true});
 });
 it('rejects malformed cursor before querying any scope',async()=>{
  const scoped=vi.fn(),next=vi.fn();await setup(scoped)['GET /tenants/:tenantId/audit/page']({params:{tenantId:'tenant'},query:{cursor:'bad!'}},{},next);expect(scoped).not.toHaveBeenCalled();expect(next.mock.calls[0][0].code).toBe('INVALID_CURSOR');
 });
});

it('rejects a slow export before returning or auditing a partial file',async()=>{let now=0;await expect(collectAuditExport(async()=>{now=16;return [];},{maxDurationMs:15,now:()=>now})).rejects.toThrow('AUDIT_EXPORT_LIMIT');});
