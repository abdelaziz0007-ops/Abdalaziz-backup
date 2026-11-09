import { createHash } from 'node:crypto';
import { parseDecimal,formatDec } from '../shared/decimal.ts';

export const hash=value=>createHash('sha256').update(value).digest('hex');
export class FinancialInputError extends Error { constructor(message){super(message);this.status=422;this.code='FINANCIAL_INPUT_INVALID';} }
export const classifications=['asset.current','asset.noncurrent','asset.contra','liability.current','liability.noncurrent','equity','income','expense.cost','expense.operating','expense.tax'];
export const header='accountCode,name,classification,signedDebitBalance';
export const money=(units,scale)=>formatDec({units,scale},scale);

// Deliberately bounded CSV grammar: quoted fields and escaped quotes, no embedded newlines.
// This validates structure and numbers; it is NOT an antivirus scan.
export function parseTrialBalance(csv,precision){
  const fail=message=>{throw new FinancialInputError(message);};
  if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>512*1024)fail('CSV must be at most 512 KiB');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(csv))fail('CSV contains unsupported characters');
  const lines=csv.replace(/^\ufeff/,'').replace(/\r\n/g,'\n').split('\n');
  if(lines.at(-1)==='')lines.pop();
  if(lines.length<3||lines.length>1001)fail('Provide between 2 and 1000 accounts');
  function fields(line){
    const result=[];let value='',quoted=false,closed=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(quoted){if(ch==='"'){if(line[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=ch;}
      else if(ch===','){result.push(value);value='';closed=false;}
      else if(ch==='"'&&!value&&!closed)quoted=true;
      else{if(closed||ch==='"'||ch==='\r')fail('Malformed CSV quoting');value+=ch;}
    }
    if(quoted)fail('Multiline CSV fields are not supported');result.push(value);return result;
  }
  if(fields(lines[0]).join(',')!==header)fail('Use the supplied four-column CSV template');
  const codes=new Set(),rows=lines.slice(1).map((line,index)=>{
    const cells=fields(line);if(cells.length!==4)fail(`Row ${index+2}: expected four columns`);
    const [code,name,classification,amount]=cells.map(v=>v.trim());
    if(!/^[\p{L}\p{N}][\p{L}\p{N}._/-]{0,49}$/u.test(code)||codes.has(code))fail(`Row ${index+2}: invalid or duplicate account code`);
    if(!name||name.length>200||/^[=+@-]/u.test(name)||!classifications.includes(classification))fail(`Row ${index+2}: invalid name or classification`);
    let units;try{if(amount.length>40)throw Error();units=parseDecimal(amount,precision).units;}catch{fail(`Row ${index+2}: invalid amount or currency precision`);}
    if(units<=-(10n**BigInt(22+precision))||units>=10n**BigInt(22+precision))fail(`Row ${index+2}: amount exceeds supported range`);
    codes.add(code);return {code,name,classification,amount:money(units,precision),rowNumber:index+2,units};
  });
  if(rows.reduce((sum,row)=>sum+row.units,0n)!==0n)fail('Trial balance is not balanced: signed debits and credits must sum to zero');
  return rows;
}

function ratio(n,d,multiplier=1n){
  if(d<=0n)return null;
  const scaled=n*multiplier*100n;let q=scaled/d;const r=scaled%d,abs=r<0n?-r:r;
  if(abs*2n>d||abs*2n===d&&q%2n!==0n)q+=scaled<0n?-1n:1n;
  return money(q,2);
}
export function calculateFinancials(rows,precision){
  const sum=prefix=>rows.filter(r=>r.classification.startsWith(prefix)).reduce((v,r)=>v+r.units,0n);
  const revenue=-sum('income'),cost=sum('expense.cost'),operating=sum('expense.operating'),tax=sum('expense.tax');
  const profit=revenue-cost-operating-tax,assets=sum('asset.'),liabilities=-sum('liability.'),equity=-sum('equity')+profit;
  const currentAssets=sum('asset.current'),currentLiabilities=-sum('liability.current');
  const values={revenue,cost,gross_profit:revenue-cost,operating_expenses:operating,tax,net_profit:profit,assets,liabilities,equity,current_assets:currentAssets,current_liabilities:currentLiabilities,working_capital:currentAssets-currentLiabilities};
  for(const value of Object.values(values))if(value<=-(10n**BigInt(22+precision))||value>=10n**BigInt(22+precision))throw new FinancialInputError('Calculated total exceeds supported range');
  return {values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,money(v,precision)])),metrics:[
    {code:'gross_margin',name:'Gross margin',expression:'(revenue - cost) / revenue * 100',unit:'percent',value:ratio(revenue-cost,revenue,100n)},
    {code:'net_margin',name:'Net margin',expression:'net_profit / revenue * 100',unit:'percent',value:ratio(profit,revenue,100n)},
    {code:'current_ratio',name:'Current ratio',expression:'current_assets / current_liabilities',unit:'ratio',value:ratio(currentAssets,currentLiabilities)},
    {code:'debt_to_assets',name:'Liabilities to assets',expression:'liabilities / assets * 100',unit:'percent',value:ratio(liabilities,assets,100n)},
    {code:'return_on_assets',name:'Return on average assets',expression:'net_profit / average_assets * 100',unit:'percent',value:null,reason:'Opening assets and an approved averaging basis are unavailable'},
  ],balanced:assets===liabilities+equity};
}

// Coefficients make every displayed total reproducible from original signed source rows.
export function coefficient(line,kind){
  const revenue=kind==='income'?-1:0,cost=kind==='expense.cost'?1:0,operating=kind==='expense.operating'?1:0,tax=kind==='expense.tax'?1:0;
  const profit=revenue-cost-operating-tax;
  return {revenue,cost,gross_profit:revenue-cost,operating_expenses:operating,tax,net_profit:profit,assets:kind.startsWith('asset.')?1:0,liabilities:kind.startsWith('liability.')?-1:0,equity:(kind==='equity'?-1:0)+profit,current_assets:kind==='asset.current'?1:0,current_liabilities:kind==='liability.current'?-1:0,working_capital:(kind==='asset.current'?1:0)+(kind==='liability.current'?1:0)}[line]??0;
}
