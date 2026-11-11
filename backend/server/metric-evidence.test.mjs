import {describe,it,expect,vi} from 'vitest';
import {metricEvidence,mountMetricEvidenceRoutes} from './metric-evidence.mjs';
const metric={id:'metric',name:'Gross margin',formula_code:'classified-tb-draft-v1:gross_margin',formula_version:1,expression:'(revenue - cost) / revenue * 100',value:'80.00',value_state:'available',unit:'percent',input_references:{totals:{revenue:'100.00',cost:'20.00'}}};
const row=(id,classification,balance,extra={})=>({balance_row_id:id,account_id:id,account_code:'000'+id,source_row_id:'source-'+id,row_number:Number(id),sha256:'a'.repeat(64),scan_status:'clean',weight:'1.000000',classification,closing_balance:balance,...extra});
const rows=()=>[row('1','income','-100.000000'),row('2','expense.cost','20.000000')];
describe('frozen metric evidence',()=>{
 it('reproduces saved inputs using signed contribution coefficients and exact amounts',()=>{
  const e=metricEvidence(metric,rows(),2);expect(e.complete).toBe(true);expect(e.components.map(c=>c.recomputedTotal)).toEqual(['100.00','20.00']);expect(e.components[0].rows[0].accountCode).toBe('0001');expect(e.transactionDetailAvailable).toBe(false);
 });
 it('flags inconsistent saved totals without changing them',()=>{
  const e=metricEvidence({...metric,input_references:{totals:{revenue:'90.00',cost:'20.00'}}},rows(),2);expect(e.complete).toBe(false);expect(e.components[0]).toMatchObject({savedTotal:'90.00',recomputedTotal:'100.00',matchesSavedTotal:false});
 });
 it.each(['quarantined','infected','rejected'])('withholds source row values when %s',scan_status=>{
  const e=metricEvidence(metric,[row('1','income','-100',{scan_status}),rows()[1]],2);expect(e.complete).toBe(false);expect(e.withheldRows).toBe(1);expect(e.components[0].rows).toEqual([]);expect(e.components[0].recomputedTotal).toBe(null);
 });
 it('withholds deleted source evidence',()=>{expect(metricEvidence(metric,[row('1','income','-100',{deleted_at:'2026-11-11'}),rows()[1]],2).withheldRows).toBe(1);});
 it('does not mislabel unsupported formula versions as verified',()=>{
  for(const patch of [{formula_version:2},{expression:'revenue / cost'},{formula_code:'unknown:gross_margin'}])expect(metricEvidence({...metric,...patch},rows(),2).available).toBe(false);
 });
 it('rejects unknown mappings, splits and duplicate joins',()=>{
  expect(metricEvidence(metric,[row('1','unknown','1')],2).available).toBe(false);expect(metricEvidence(metric,[row('1','income','-100',{weight:'0.5'})],2).available).toBe(false);expect(metricEvidence(metric,[...rows(),rows()[0]],2).reason).toBe('ambiguous_mapping');
 });
 it('preserves amounts beyond binary floating-point precision',()=>{
  const e=metricEvidence({...metric,input_references:{totals:{revenue:'9007199254740993.123',cost:'0.001'}}},[row('1','income','-9007199254740993.123000'),row('2','expense.cost','0.001000')],3);
  expect(e.complete).toBe(true);expect(e.components[0].recomputedTotal).toBe('9007199254740993.123');
 });
 it('rejects hidden nonzero precision rather than truncating',()=>expect(()=>metricEvidence(metric,[row('1','income','-100.001'),rows()[1]],2)).toThrow());
 it('marks missing totals unverified and preserves an explicit zero',()=>{
  const e=metricEvidence({...metric,input_references:{totals:{cost:'0'}}},[row('1','income','0'),row('2','expense.cost','0')],2);expect(e.components[0].matchesSavedTotal).toBe(null);expect(e.components[1].matchesSavedTotal).toBe(true);
 });
 it('fails oversized evidence',()=>expect(()=>metricEvidence(metric,Array(5001).fill(rows()[0]),2)).toThrow('METRIC_EVIDENCE_LIMIT'));
});
it('requires report viewing scope and a consistent snapshot before reading source evidence',async()=>{
 let handler;const scoped=vi.fn().mockResolvedValue({}),result=vi.fn(),next=vi.fn();mountMetricEvidenceRoutes({get:(_p,f)=>{handler=f;}},{scoped,result,HttpError:Error});
 const id='00000000-0000-4000-8000-000000000000',req={params:{tenantId:id,entityId:id,reportId:id,metricId:id}};
 await handler(req,{},next);expect(next).not.toHaveBeenCalled();expect(scoped.mock.calls[0][3]).toBe('reports.view');expect(scoped.mock.calls[0][5]).toEqual({snapshot:true});
});
