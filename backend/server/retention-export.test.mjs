import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {retentionSchemas} from './retention-routes.mjs';
import {encodePrivacyExport,exportSections,exportLimit} from './privacy-export.mjs';
const common={reason:'Approved retention review',requestKey:'14fce912-4de2-4b98-a534-c8ef45678615'};
const policy={...common,code:'source_files',category:'originals',retentionDays:365,triggerEvent:'created_at',legalBasis:'Explicit owner policy decision'};
describe('retention inputs',()=>{
 it.each([-1,0.5,36501,NaN])('rejects invalid retention days %s',retentionDays=>expect(retentionSchemas.policy.safeParse({...policy,retentionDays}).success).toBe(false));
 it('requires an explicit duration',()=>{const {retentionDays,...missing}=policy;expect(retentionSchemas.policy.safeParse(missing).success).toBe(false);});
 it('rejects caller supplied authorization identity',()=>expect(retentionSchemas.hold.safeParse({...common,authority:'Decision reference',reviewDueAt:'2027-01-01T00:00:00Z',authorized_by:common.requestKey}).success).toBe(false));
 it('requires a timezone on review dates',()=>expect(retentionSchemas.hold.safeParse({...common,authority:'Decision reference',reviewDueAt:'2027-01-01T00:00:00'}).success).toBe(false));
});
describe('privacy export integrity',()=>{
 const build=()=>({tenant:'tenant',entity:'entity',requestId:'request',generatedAt:'2026-11-10T00:00:00Z',sections:Object.fromEntries(exportSections.map(s=>[s.name,[]]))});
 it('preserves decimal strings, unicode and explicit partial coverage with exact digest',()=>{
  const input=build();input.sections.reportLines=[{value:'9007199254740993.01',name:'ميزان'}];
  const file=encodePrivacyExport(input),parsed=JSON.parse(file.bytes.toString());
  expect(parsed.sections.reportLines[0].value).toBe('9007199254740993.01');expect(parsed.sections.reportLines[0].name).toBe('ميزان');
  expect(parsed.coverage.complete).toBe(false);expect(parsed.coverage.excluded).toContain('original_files');
  expect(file.sha256).toBe(createHash('sha256').update(file.bytes).digest('hex'));
 });
 it('fails instead of silently truncating an oversized section',()=>{const input=build();input.sections.outputs=Array(exportLimit+1).fill({});expect(()=>encodePrivacyExport(input)).toThrow();});
 it('fails when a promised section is missing',()=>{const input=build();delete input.sections.metrics;expect(()=>encodePrivacyExport(input)).toThrow();});
});
