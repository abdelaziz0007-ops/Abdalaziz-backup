import { describe,it,expect } from 'vitest';
import { snapshotSchema } from './snapshot-schema.mjs';
const row=(accountCode,signedDebitBalance)=>({accountCode,signedDebitBalance,name:{ar:'اختبار',en:'Test'},classification:'equity',sourceFile:'test.csv',sourceSheet:'CSV',sourceRow:1});
const sample=()=>({version:1,entityId:'TEST',period:'2026-10',scenario:'baseline',datasets:[{entityId:'TEST',period:'2026-10',sourceFile:'test.csv',rows:[row('1','10.00'),row('2','-10.00')]}],planning:{budget:[],trade:[],tradeAsOf:'',assumptions:{revenuePct:'0',costPct:'0',opexPct:'0',collectionDays:'0'},supplemental:{},notes:'',owners:{}}});
describe('Postgres snapshot input boundary',()=>{
  it('accepts balanced decimal sources without floating point rounding',()=>expect(snapshotSchema.safeParse(sample()).success).toBe(true));
  it('rejects a one-cent difference',()=>{const s=sample();s.datasets[0].rows[1].signedDebitBalance='-9.99';expect(snapshotSchema.safeParse(s).success).toBe(false);});
  it('rejects duplicate accounts, cross-entity data and missing active period',()=>{for(const mutate of [s=>s.datasets[0].rows[1].accountCode='1',s=>s.datasets[0].entityId='OTHER',s=>s.period='2026-09']){const s=sample();mutate(s);expect(snapshotSchema.safeParse(s).success).toBe(false);}});
  it('rejects overpaid receivables and excess decimal precision',()=>{const s=sample();s.planning.trade=[{id:'AR',kind:'receivable',party:'Test',invoiceDate:'2026-10-01',dueDate:'2026-10-02',amount:'10',paid:'11'}];expect(snapshotSchema.safeParse(s).success).toBe(false);s.planning.trade=[];s.datasets[0].rows[0].signedDebitBalance='10.001';expect(snapshotSchema.safeParse(s).success).toBe(false);});
});
