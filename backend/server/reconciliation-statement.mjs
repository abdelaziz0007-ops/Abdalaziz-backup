import {bankAmount} from './bank-core.mjs';
import {money,FinancialInputError} from './financial-core.mjs';
const absolute=n=>n<0n?-n:n;
const percent=(n,d)=>{if(d===0n)return null;const scaled=n*10000n;let q=scaled/d;const remainder=scaled%d;if(remainder*2n>d||remainder*2n===d&&q%2n!==0n)q++;return money(q,2);};
// Amounts remain decimal strings throughout; count/amount coverage is not precision.
export function reconciliationStatement(rec,items,transactions,allocations,precision){
 const totals={bank:0n,books:0n};
 const details=items.map(item=>{
  const amount=bankAmount(item.signed_amount,precision);
  if(!['bank','books','none'].includes(item.effect_side)||!['outstanding','cleared','excluded'].includes(item.status))throw new FinancialInputError('Invalid reconciliation item state');
  if(item.status==='outstanding'&&item.effect_side!=='none')totals[item.effect_side]+=amount;
  const age=Math.round((Date.parse(rec.cutoff_date)-Date.parse(item.origin_date))/86400000);
  if(!Number.isFinite(age)||age<0)throw new FinancialInputError('Item origination must not be after cutoff');
  return {...item,signed_amount:money(amount,precision),age_days:age,affects_balance:item.status==='outstanding'&&item.effect_side!=='none'};
 });
 const bank=bankAmount(rec.bank_closing_balance,precision)+totals.bank,books=bankAmount(rec.book_closing_balance,precision)+totals.books;
 const coverage={};
 for(const side of ['bank','books']){
  let total=0n,matched=0n,fully=0,partially=0;const rows=transactions[side],seen=new Set();
  for(const row of rows){
   if(seen.has(row.id))throw new FinancialInputError('Duplicate coverage transaction');seen.add(row.id);
   const amount=absolute(bankAmount(row.signed_amount,precision));
   const used=allocations.filter(a=>!a.reversed_at&&a[side==='bank'?'bank_transaction_id':'book_transaction_id']===row.id).reduce((n,a)=>{const value=bankAmount(a.amount,precision);if(value<=0n)throw new FinancialInputError('Invalid coverage allocation');return n+value;},0n);
   if(used>amount)throw new FinancialInputError('Coverage allocation exceeds source capacity');
   total+=amount;matched+=used;if(used===amount&&amount>0n)fully++;else if(used>0n)partially++;
  }
  coverage[side]={total_count:rows.length,fully_matched_count:fully,partially_matched_count:partially,unmatched_count:rows.length-fully-partially,total_absolute_amount:money(total,precision),allocated_absolute_amount:money(matched,precision),unallocated_absolute_amount:money(total-matched,precision),fully_matched_count_percent:percent(BigInt(fully),BigInt(rows.length)),allocated_amount_percent:percent(matched,total)};
 }
 return {bank_adjustment:money(totals.bank,precision),book_adjustment:money(totals.books,precision),adjusted_bank_balance:money(bank,precision),adjusted_book_balance:money(books,precision),residual_difference:money(bank-books,precision),arithmetically_balanced:bank===books,items:details,coverage,precision:{value:null,reason:'Precision requires independent labeled ground truth; coverage is not precision'},approval_status:'Draft arithmetic only; source scanning, completeness, evidence and independent review remain required'};
}
