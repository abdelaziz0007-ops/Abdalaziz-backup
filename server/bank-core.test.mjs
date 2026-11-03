import {it,expect} from 'vitest';
import {bankHeader,parseBankCsv,suggestBankMatches} from './bank-core.mjs';
const csv=lines=>bankHeader+'\n'+lines.join('\n')+(lines.length?'\n':'');
const parse=(lines,opening='100',closing='110',precision=2)=>parseBankCsv(csv(lines),precision,'2026-01-01','2026-01-31',opening,closing);
it('checks exact rollforward, individual balances and source dates',()=>{
 expect(parse(['a,2026-01-02,R1,Deposit,10,110'])[0].amount).toBe('10.00');
 for(const lines of [['a,2026-01-02,R1,Deposit,10,111'],['a,2026-02-30,R1,Deposit,10,110'],['a,2026-02-01,R1,Deposit,10,110'],['a,2026-01-02,R1,Deposit,0,110']])expect(()=>parse(lines)).toThrow();
 expect(()=>parse(['a,2026-01-02,R1,Deposit,11,111'])).toThrow(/closing balance/);
});
it('supports no activity and zero/three decimal currencies without fake rows',()=>{
 expect(parse([],'0','0',0)).toEqual([]);expect(parse(['a,2026-01-02,R1,Deposit,0.001,0.001'],'0','0.001',3)[0].units).toBe(1n);
 expect(()=>parse(['a,2026-01-02,R1,Deposit,0.1,0.1'],'0','0.1',0)).toThrow();
});
it('suggests exact same-sign reference/date/amount matches and preserves ambiguity',()=>{
 const rows=parse(['a,2026-01-02,R1,Deposit,10,110']),duplicate=[...rows,{...rows[0],id:'b'}];
 expect(suggestBankMatches(rows,rows)[0].ambiguous).toBe(false);
 expect(suggestBankMatches(duplicate,rows).every(s=>s.ambiguous)).toBe(true);
 expect(suggestBankMatches(rows,duplicate)[0].ambiguous).toBe(true);
 for(const changes of [{reference:''},{reference:'different'},{date:'2026-01-03'},{units:-10n}])expect(suggestBankMatches(rows,[{...rows[0],...changes}])).toEqual([]);
});
it('rejects duplicate identifiers, malformed quoting and formula-like fields',()=>{
 expect(()=>parse(['a,2026-01-02,R1,Deposit,5,105','a,2026-01-02,R1,Deposit,5,110'])).toThrow();
 expect(()=>parse(['a,2026-01-02,=R1,Deposit,10,110'])).toThrow();
 expect(parse(['a,2026-01-02,R1,"Deposit, bank",10,110'])[0].description).toBe('Deposit, bank');
});
it('bounds ambiguous candidates before persistence or object uploads',()=>{
 const row={date:'2026-01-02',reference:'DUP',units:1n};expect(()=>suggestBankMatches(Array(101).fill(row),Array(100).fill(row))).toThrow(/Too many ambiguous/);
});
