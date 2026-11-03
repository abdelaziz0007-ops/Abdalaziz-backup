import {bankAmount} from './bank-core.mjs';
import {money,FinancialInputError} from './financial-core.mjs';
export function allocationPlan(pairs,bank,books,active,precision){
 const fail=message=>{throw new FinancialInputError(message);};
 const b=new Map(bank.map(r=>[r.id,r])),k=new Map(books.map(r=>[r.id,r]));
 const banks=new Map(),ledgers=new Map(),seen=new Set();let conflict=false;
 const abs=n=>n<0n?-n:n;
 const plan=pairs.map(p=>{
  const key=p.bankTransactionId+':'+p.bookTransactionId;if(seen.has(key))fail('Duplicate allocation pair');seen.add(key);
  const bank=b.get(p.bankTransactionId),book=k.get(p.bookTransactionId);if(!bank||!book)fail('All movements must belong to the selected bank, datasets and cutoff');
  const bu=bankAmount(bank.signed_amount,precision),ku=bankAmount(book.signed_amount,precision),amount=bankAmount(p.amount,precision);
  if(amount<=0n||bu===0n||ku===0n||(bu>0n)!==(ku>0n))fail('Allocation must be positive between movements of the same sign');
  conflict ||= Boolean(bank.reference_hash&&book.reference_hash&&bank.reference_hash!==book.reference_hash);
  banks.set(bank.id,(banks.get(bank.id)??0n)+amount);ledgers.set(book.id,(ledgers.get(book.id)??0n)+amount);
  return {...p,amount:money(amount,precision)};
 });
 if(banks.size>1&&ledgers.size>1)fail('Many-to-many groups are not supported; use explicit one-sided partial groups');
 for(const [side,requested,source] of [['bank',banks,b],['books',ledgers,k]])for(const [id,total] of requested){
  const used=active.filter(a=>a[side==='bank'?'bank_transaction_id':'book_transaction_id']===id).reduce((n,a)=>n+bankAmount(a.amount,precision),0n);
  if(total>abs(bankAmount(source.get(id).signed_amount,precision))-used){const error=new FinancialInputError('Requested allocations exceed remaining movement capacity');error.status=409;error.code='ALLOCATION_CAPACITY_CONFLICT';throw error;}
 }
 let kind=banks.size>1?'many_to_one':ledgers.size>1?'one_to_many':'partial';
 if(banks.size===1&&ledgers.size===1&&banks.values().next().value===abs(bankAmount(b.get(banks.keys().next().value).signed_amount,precision))&&ledgers.values().next().value===abs(bankAmount(k.get(ledgers.keys().next().value).signed_amount,precision)))kind='one_to_one';
 return {pairs:plan,bankIds:[...banks.keys()],bookIds:[...ledgers.keys()],kind,referenceConflict:conflict};
}
