import {it,expect} from 'vitest';
import {reconciliationStatement as statement} from './reconciliation-statement.mjs';
const rec={cutoff_date:'2026-01-31',bank_closing_balance:'100',book_closing_balance:'120'},empty={bank:[],books:[]};
const item=(signed_amount,effect_side,status='outstanding')=>({signed_amount,effect_side,status,origin_date:'2026-01-01'});
it('matches the SRS 9.6 accounting reference without implicitly posting the fee',()=>{
 const result=statement({...rec,bank_closing_balance:'100000',book_closing_balance:'102200'},[item('5000','bank'),item('-3000','bank'),item('-200','books')],empty,[],2);
 expect(result.adjusted_bank_balance).toBe('102000.00');expect(result.adjusted_book_balance).toBe('102000.00');expect(result.residual_difference).toBe('0.00');expect(result.approval_status).toMatch(/Draft/);
});
it('adds signed adjustments to their explicit side and excludes cleared/excluded items',()=>{
 const result=statement(rec,[item('30','bank'),item('-10','bank'),item('999','books','cleared'),item('999','bank','excluded'),item('9','none')],empty,[],2);
 expect(result.adjusted_bank_balance).toBe('120.00');expect(result.residual_difference).toBe('0.00');expect(result.items[0].age_days).toBe(30);expect(result.items[2].affects_balance).toBe(false);expect(result.precision.value).toBeNull();
});
it('uses absolute amounts for coverage and separates partials from fully matched counts',()=>{
 const result=statement(rec,[],{bank:[{id:'b',signed_amount:'-100'},{id:'c',signed_amount:'100'}],books:[{id:'k',signed_amount:'-100'}]},[{bank_transaction_id:'b',book_transaction_id:'k',amount:'40'},{bank_transaction_id:'b',book_transaction_id:'k',amount:'60',reversed_at:'2026-01-01'}],2);
 expect(result.coverage.bank).toMatchObject({total_count:2,fully_matched_count:0,partially_matched_count:1,total_absolute_amount:'200.00',allocated_absolute_amount:'40.00',allocated_amount_percent:'20.00'});expect(result.coverage.books.allocated_amount_percent).toBe('40.00');
});
it('keeps large balances exact and represents empty coverage denominators as unavailable',()=>{
 const result=statement({...rec,bank_closing_balance:'9007199254740993.001',book_closing_balance:'9007199254740993.002'},[],empty,[],3);
 expect(result.residual_difference).toBe('-0.001');expect(result.coverage.bank.allocated_amount_percent).toBeNull();expect(result.coverage.bank.fully_matched_count_percent).toBeNull();
});
it('rounds coverage percentages to two decimals with half-even ties',()=>{
 const row={bank:[{id:'b',signed_amount:'32'}],books:[]};
 expect(statement(rec,[],row,[{bank_transaction_id:'b',amount:'1'}],2).coverage.bank.allocated_amount_percent).toBe('3.12');
 expect(statement(rec,[],row,[{bank_transaction_id:'b',amount:'3'}],2).coverage.bank.allocated_amount_percent).toBe('9.38');
});
it('rejects future-origin items and inconsistent capacity rather than clamping misleading coverage',()=>{
 expect(()=>statement(rec,[{...item('1','bank'),origin_date:'2026-02-01'}],empty,[],2)).toThrow();
 expect(()=>statement(rec,[],{bank:[{id:'b',signed_amount:'1'}],books:[]},[{bank_transaction_id:'b',amount:'2'}],2)).toThrow(/capacity/);
});
