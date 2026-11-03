import { parseDecimal } from '../src/lib/decimal.ts';
import { FinancialInputError,money } from './financial-core.mjs';
export const bankHeader='rowId,postingDate,reference,description,signedAmount,runningBalance';
export function bankAmount(text,precision){
  try{if(typeof text!=='string'||text.length>40)throw Error();const n=parseDecimal(text,precision).units;if(n<=-(10n**BigInt(22+precision))||n>=10n**BigInt(22+precision))throw Error();return n;}catch{throw new FinancialInputError('Invalid bank amount or currency precision');}
}
export function parseBankCsv(csv,precision,start,cutoff,opening,closing){
  const fail=message=>{throw new FinancialInputError(message);};
  if(Buffer.byteLength(csv,'utf8')>262144||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(csv))fail('Bank CSV must be valid UTF-8 text up to 256 KiB');
  const lines=csv.replace(/^\ufeff/,'').replace(/\r\n/g,'\n').split('\n');if(lines.at(-1)==='')lines.pop();
  if(lines.shift()!==bankHeader||lines.length>1000)fail('Use the six-column bank CSV template with at most 1000 transactions');
  const ids=new Set();let balance=bankAmount(opening,precision),previous=start;
  const rows=lines.map((line,index)=>{
    const cells=[];let cell='',quoted=false,closed=false;
    for(let i=0;i<line.length;i++){const ch=line[i];if(quoted){if(ch==='"'){if(line[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;}else if(ch===','){cells.push(cell);cell='';closed=false;}else if(ch==='"'&&!cell&&!closed)quoted=true;else{if(closed||ch==='"'||ch==='\r')fail('Malformed CSV quoting');cell+=ch;}}
    if(quoted)fail('Multiline fields are not supported');cells.push(cell);if(cells.length!==6)fail(`Row ${index+2}: expected six columns`);
    const [id,date,reference,description,amount,running]=cells.map(v=>v.trim());
    if(!/^[\p{L}\p{N}._/-]{1,80}$/u.test(id)||ids.has(id))fail(`Row ${index+2}: invalid or duplicate row ID`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<start||date>cutoff||date<previous)fail(`Row ${index+2}: dates must be valid, ordered, and inside the selected range`);
    if(reference.length>200||description.length>500||/^[=+@]/u.test(reference)||/^[=+@]/u.test(description))fail(`Row ${index+2}: invalid reference or description`);
    const units=bankAmount(amount,precision);if(units===0n)fail(`Row ${index+2}: zero-value transactions are not supported`);
    balance+=units;bankAmount(money(balance,precision),precision);
    if(running&&bankAmount(running,precision)!==balance)fail(`Row ${index+2}: running balance does not reconcile`);
    ids.add(id);previous=date;return {id,date,reference,description,units,amount:money(units,precision),runningBalance:running?money(balance,precision):null,rowNumber:index+2};
  });
  if(balance!==bankAmount(closing,precision))fail('Opening balance plus transactions must equal the stated closing balance');
  return rows;
}
export function suggestBankMatches(bank,books){
  const key=r=>r.reference.trim()?JSON.stringify([r.date,r.units.toString(),r.reference.normalize('NFKC').trim().toUpperCase()]):null;
  const group=rows=>{const map=new Map();for(const row of rows){const k=key(row);if(k)map.set(k,[...(map.get(k)??[]),row]);}return map;};
  const b=group(bank),k=group(books),suggestions=[];
  let members=0;
  for(const [key,banks] of b){const candidates=k.get(key);if(candidates){members+=banks.length*(candidates.length+1);if(members>10000)throw new FinancialInputError('Too many ambiguous candidates; refine repeated source references');for(const row of banks)suggestions.push({bank:row,books:candidates,ambiguous:banks.length!==1||candidates.length!==1});}}
  return suggestions;
}
