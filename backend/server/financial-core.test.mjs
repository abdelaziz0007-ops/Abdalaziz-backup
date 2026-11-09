import { describe,it,expect } from 'vitest';
import { calculateFinancials,coefficient,header,parseTrialBalance } from './financial-core.mjs';
import { financialSignals } from './financial-signals.mjs';
const csv=rows=>header+'\n'+rows.join('\n')+'\n';
describe('Server financial input and calculations',()=>{
  it('calculates signed balances and includes current earnings in equity exactly once',()=>{
    const rows=parseTrialBalance(csv(['100,Cash,asset.current,1000.00','200,Payable,liability.current,-200.00','300,Capital,equity,-500.00','400,Revenue,income,-500.00','500,Cost,expense.cost,200.00']),2),result=calculateFinancials(rows,2);
    expect(result.values).toMatchObject({revenue:'500.00',net_profit:'300.00',assets:'1000.00',liabilities:'200.00',equity:'800.00'});expect(result.balanced).toBe(true);
    expect(result.metrics.find(m=>m.code==='net_margin').value).toBe('60.00');
    for(const [line,value] of Object.entries(result.values)){const total=rows.reduce((sum,r)=>sum+r.units*BigInt(coefficient(line,r.classification)),0n);expect(total).toBe(BigInt(value.replace('.','')));}
  });
  it('honors zero and three-decimal currencies without binary rounding',()=>{
    expect(parseTrialBalance(csv(['100,Cash,asset.current,100','300,Capital,equity,-100']),0)[0].amount).toBe('100');
    const rows=parseTrialBalance(csv(['100,Cash,asset.current,0.001','300,Capital,equity,-0.001']),3);expect(calculateFinancials(rows,3).values.assets).toBe('0.001');
    expect(()=>parseTrialBalance(csv(['100,Cash,asset.current,0.01','300,Capital,equity,-0.01']),0)).toThrow(/precision/);
  });
  it('does not manufacture metrics from missing or nonpositive denominators',()=>{
    const result=calculateFinancials(parseTrialBalance(csv(['100,Cash,asset.current,1','300,Capital,equity,-1']),2),2);
    expect(result.metrics.every(m=>m.value===null||m.code==='debt_to_assets')).toBe(true);
  });
  it('uses the saved metric and a strict threshold without flagging unavailable metrics',()=>{
    const metric=(code,value)=>({id:code,formula_code:'classified-tb-draft-v1:'+code,value,
      value_state:value===null?'missing':'available',unit:code==='current_ratio'?'ratio':'percent'});
    const findings=financialSignals([metric('gross_margin','-0.01'),metric('current_ratio','1.00000000'),metric('net_margin',null)]);
    expect(findings).toMatchObject([
      {metricId:'gross_margin',observedValue:'-0.01',threshold:'0.00',triggered:true},
      {metricId:'current_ratio',observedValue:'1.00000000',threshold:'1.00',triggered:false},
    ]);
  });
  it('rejects unbalanced, duplicate, malicious, out-of-range and ambiguous inputs',()=>{
    for(const input of [csv(['100,Cash,asset.current,2','300,Capital,equity,-1']),csv(['100,Cash,asset.current,1','100,Capital,equity,-1']),csv(['100,=SUM(A1),asset.current,1','300,Capital,equity,-1']),csv(['100,Cash,asset.current,1e2','300,Capital,equity,-100']),csv(['100,Cash,asset.current,10000000000000000000000','300,Capital,equity,-10000000000000000000000']),csv(['100,"Unclosed,asset.current,1','300,Capital,equity,-1'])])expect(()=>parseTrialBalance(input,2)).toThrow();
  });
  it('preserves a quoted comma and rejects embedded newlines instead of shifting source rows',()=>{
    expect(parseTrialBalance(csv(['100,"Cash, bank",asset.current,1','300,Capital,equity,-1']),2)[0].name).toBe('Cash, bank');
    expect(()=>parseTrialBalance(csv(['100,"Cash\nbank",asset.current,1','300,Capital,equity,-1']),2)).toThrow();
  });
});
