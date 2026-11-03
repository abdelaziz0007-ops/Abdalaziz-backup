import {it,expect} from 'vitest';
import {allocationPlan} from './allocation-plan.mjs';
const movement=(id,amount,reference='ref')=>({id,signed_amount:amount,reference_hash:reference});
const pair=(bankTransactionId,bookTransactionId,amount)=>({bankTransactionId,bookTransactionId,amount});
it('preserves residual for partial payments and groups one-to-many exactly',()=>{
 expect(allocationPlan([pair('b','k','30')],[movement('b','100')],[movement('k','60')],[],2).kind).toBe('partial');
 expect(allocationPlan([pair('b','k1','40'),pair('b','k2','60')],[movement('b','100')],[movement('k1','40'),movement('k2','60')],[],2).kind).toBe('one_to_many');
 expect(allocationPlan([pair('b1','k','40'),pair('b2','k','60')],[movement('b1','100'),movement('b2','60')],[movement('k','100')],[],2).kind).toBe('many_to_one');
});
it('bounds requested totals against active allocations at currency precision',()=>{
 const b=[movement('b','-1.001')],k=[movement('k','-1.001')],active=[{bank_transaction_id:'b',book_transaction_id:'k',amount:'0.500'}];
 expect(allocationPlan([pair('b','k','0.501')],b,k,active,3).pairs[0].amount).toBe('0.501');
 expect(()=>allocationPlan([pair('b','k','0.502')],b,k,active,3)).toThrow(/capacity/);
 expect(()=>allocationPlan([pair('b','k','0.0001')],b,k,[],3)).toThrow(/precision/);
});
it('rejects opposite signs, duplicate pairs, absent source and many-to-many',()=>{
 expect(()=>allocationPlan([pair('b','k','1')],[movement('b','1')],[movement('k','-1')],[],2)).toThrow(/same sign/);
 expect(()=>allocationPlan([pair('b','k','1'),pair('b','k','1')],[movement('b','2')],[movement('k','2')],[],2)).toThrow(/Duplicate/);
 expect(()=>allocationPlan([pair('missing','k','1')],[],[movement('k','1')],[],2)).toThrow(/belong/);
 expect(()=>allocationPlan([pair('b1','k1','1'),pair('b2','k2','1')],[movement('b1','1'),movement('b2','1')],[movement('k1','1'),movement('k2','1')],[],2)).toThrow(/Many-to-many/);
});
it('exposes reference conflicts without treating missing references as proven conflicts',()=>{
 expect(allocationPlan([pair('b','k','1')],[movement('b','1','a')],[movement('k','1','b')],[],2).referenceConflict).toBe(true);
 expect(allocationPlan([pair('b','k','1')],[movement('b','1',null)],[movement('k','1','b')],[],2).referenceConflict).toBe(false);
});
