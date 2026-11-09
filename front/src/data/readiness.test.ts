import { describe,it,expect } from 'vitest';
import { deriveReadiness } from './readiness';
import { defaultRows } from './finance';
import { fixtures } from './repository';
import { buildEvidence } from './evidence';
const input=()=>({rows:structuredClone(defaultRows),quality:structuredClone(fixtures.quality),reconciliation:structuredClone(fixtures.reconciliation),reports:structuredClone(fixtures.reports),periodId:fixtures.reconciliation.periodId,reviewedFingerprint:null});
describe('period readiness evidence',()=>{
 it('does not call balanced draft outputs approved or the period complete',()=>{const r=deriveReadiness(input());expect(r.recDifference).toBe('0.00');expect(r.completed).toBe(4);expect(r.reviewDone).toBe(false);expect(r.tasks.some(t=>t.id==='drafts')).toBe(true);expect(r.next?.id).toBe('review');});
 it('prioritizes actual residuals and invalid quality counts',()=>{const data=input();data.reconciliation.closingBalance='99750.00';data.quality.counts.rejected=1;const r=deriveReadiness(data);expect(r.blocking.map(t=>t.id)).toContain('difference');expect(r.blocking.map(t=>t.id)).toContain('quality');expect(r.recDifference).toBe('-250.00');expect(r.next?.severity).toBe('blocking');});
 it('does not use an October reconciliation or reports for September',()=>{const data=input();data.periodId='PER-ENT-ATLAS-2026-09';const r=deriveReadiness(data);expect(r.recDifference).toBeNull();expect(r.steps.find(s=>s.id==='outputs')?.state).toBe('action');expect(r.reviewDone).toBe(false);});
 it('keeps missing quality unavailable and detects unmapped accounts',()=>{const data={...input(),quality:null};data.rows[0].classification='unmapped';const r=deriveReadiness(data);expect(r.unmapped).toBe(1);expect(r.steps.find(s=>s.id==='quality')?.state).toBe('unavailable');expect(r.blocking.map(t=>t.id)).toContain('mapping');});
 it('does not complete the period when only the reconciliation is approved',()=>{const data=input();data.reconciliation.status='approvedLocked';const r=deriveReadiness(data);expect(r.reviewDone).toBe(false);expect(r.steps.find(s=>s.id==='review')?.state).toBe('action');});
});
describe('shared number evidence',()=>{
 it('selects only accounts involved in each total',()=>{const assets=buildEvidence('assets',defaultRows)!;expect(assets.value).toBe('332200.00');expect(assets.rows.every(r=>r.classification.startsWith('asset.'))).toBe(true);const equity=buildEvidence('equity',defaultRows)!;expect(equity.value).toBe('189200.00');expect(equity.rows.some(r=>r.classification.startsWith('liability.'))).toBe(false);expect(buildEvidence('net',defaultRows)?.value).toBe('16.80');});
 it('keeps unavailable comparative account detail empty',()=>{expect(buildEvidence('netRevenue',defaultRows,true)).toMatchObject({value:'120000.00',rows:[]});expect(buildEvidence('liquidity',defaultRows,true)).toMatchObject({value:null,rows:[]});});
 it('isolates an individual equity account and includes current profit only once',()=>{expect(buildEvidence('3000',defaultRows)?.rows.map(r=>r.accountCode)).toEqual(['3000']);expect(buildEvidence('3000',defaultRows)?.value).toBe('120000.00');expect(buildEvidence('equity',defaultRows)?.rows.filter(r=>r.accountCode==='4000')).toHaveLength(1);});
});
