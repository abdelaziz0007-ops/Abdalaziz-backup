import source from '../../fake-data.json';
import { calculateFinance, ratio, type TrialRow } from './finance';
import { addStr, subStr, sumStr, dec, formatDec, percentageVariance } from '@/lib/decimal';
import type { AccountingPeriod } from './types';

export interface PeriodDataset { entityId:string; period:string; rows:TrialRow[]; revision:number; sourceFile:string; importedAt:string }
export type LocalDatasets=Record<string,PeriodDataset>;
export const periodKey=(entity:string,month:string)=>`PER-${entity}-${month}`;
export function makePeriod(dataset:PeriodDataset):AccountingPeriod {
 const date=new Date(dataset.period+'-15T00:00:00Z');
 return {id:periodKey(dataset.entityId,dataset.period),entityId:dataset.entityId,label:{ar:new Intl.DateTimeFormat('ar',{month:'long',year:'numeric',timeZone:'UTC'}).format(date),en:new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(date)},startDate:dataset.period+'-01',endDate:new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10),status:'draft'};
}
export function multiply(value:string,factor:string):string {
 const a=dec(value,'USD').units,b=dec(factor,'USD').units,n=a*b,absolute=n<0n?-n:n;
 return formatDec({units:(n<0n?-1n:1n)*((absolute+50n)/100n),scale:2},2);
}
export function percentOf(value:string,percent:string){return subStr(changeBy(value,percent),value,'USD');}
/** Percentage changes retain four-decimal factors so 0.5% is not rounded to 1%. */
export function changeBy(value:string,percent:string){const a=dec(value,'USD').units,p=dec(percent,'USD').units;const numerator=a*(10000n+p),absolute=numerator<0n?-numerator:numerator;return formatDec({units:(numerator<0n?-1n:1n)*((absolute+5000n)/10000n),scale:2},2);}
export function averageReturn(profit:string,current:string,previous:string){return ratio(addStr(profit,profit,'USD'),addStr(current,previous,'USD'),true);}
export const statementFields=[['netRevenue','صافي الإيرادات','Net revenue'],['costOfRevenue','تكلفة الإيرادات','Cost of revenue'],['grossProfit','مجمل الربح','Gross profit'],['operatingExpenses','المصروفات التشغيلية','Operating expenses'],['taxExpense','مصروف الضريبة','Tax expense'],['netProfit','صافي الربح','Net profit']] as const;
export function comparisonRows(current:ReturnType<typeof calculateFinance>,previous:Partial<ReturnType<typeof calculateFinance>>|null){return statementFields.map(([key,ar,en])=>({key,ar,en,current:current[key],previous:previous?.[key]??null,variance:previous?.[key]!=null?subStr(current[key],previous[key]!,'USD'):null,variancePct:previous?.[key]!=null?percentageVariance(current[key],previous[key]!,'USD'):null,commonSize:ratio(current[key],current.netRevenue,true)}));}
export type MetricValue={id:string;ar:string;en:string;group:'profitability'|'liquidity'|'leverage'|'efficiency';value:string|null;unit:string;formula:string;reason:string};
export function roleBalance(rows:TrialRow[],role:string):string|null {const selected=rows.filter(r=>r.role===role&&r.classification===(role==='payables'?'liability.current':'asset.current'));return selected.length?sumStr(selected.map(r=>role==='payables'?subStr('0',r.signedDebitBalance,'USD'):r.signedDebitBalance),'USD'):null;}
export interface Supplemental { creditSales?:string;creditPurchases?:string }
export function metricsFor(rows:TrialRow[],previous:TrialRow[]|null,supplemental:Supplemental={},days=31):MetricValue[]{
 const v=calculateFinance(rows),p=previous?calculateFinance(previous):null,cash=roleBalance(rows,'cash'),stock=roleBalance(rows,'inventory');
 const opProfit=subStr(v.grossProfit,v.operatingExpenses,'USD');
 const metrics:MetricValue[]=[];
 const add=(id:string,ar:string,en:string,group:MetricValue['group'],value:string|null,unit:string,formula:string,reason='مدخلات غير مكتملة أو المقام صفر / Missing inputs or zero denominator')=>metrics.push({id,ar,en,group,value,unit,formula,reason});
 add('netMargin','هامش صافي الربح','Net margin','profitability',v.netMargin,'%','Net profit / Revenue × 100');
 add('grossMargin','هامش مجمل الربح','Gross margin','profitability',v.grossMargin,'%','Gross profit / Revenue × 100');
 add('operatingMargin','هامش الربح التشغيلي','Operating margin','profitability',ratio(opProfit,v.netRevenue,true),'%','(Gross profit − Operating expenses) / Revenue × 100');
 add('roa','العائد على متوسط الأصول','Return on average assets','profitability',p?averageReturn(v.netProfit,v.totalAssets,p.totalAssets):null,'%','Net profit / Average assets × 100','يتطلب أصول افتتاحية فعلية / Actual opening assets required');
 add('roe','العائد على متوسط حقوق الملكية','Return on average equity','profitability',p?averageReturn(v.netProfit,v.totalEquity,p.totalEquity):null,'%','Net profit / Average equity × 100','يتطلب حقوق ملكية افتتاحية / Opening equity required');
 add('current','النسبة الجارية','Current ratio','liquidity',v.currentRatio,'×','Current assets / Current liabilities');
 add('quick','النسبة السريعة المبسطة','Quick ratio, simplified','liquidity',stock===null?null:ratio(subStr(v.currentAssets,stock,'USD'),v.currentLiabilities),'×','(Current assets − Inventory) / Current liabilities','يلزم تحديد حسابات المخزون صراحة؛ تشمل بقية الأصول المتداولة / Explicit inventory role required; includes other current assets');
 add('cash','نسبة النقدية','Cash ratio','liquidity',cash===null?null:ratio(cash,v.currentLiabilities),'×','Cash / Current liabilities','يلزم تعريف حسابات النقدية / Explicit cash role required');
 add('working','رأس المال العامل','Working capital','liquidity',v.workingCapital,'USD','Current assets − Current liabilities');
 add('liabilitiesAssets','الالتزامات إلى الأصول','Liabilities / assets','leverage',ratio(v.totalLiabilities,v.totalAssets,true),'%','Total liabilities / Total assets × 100');
 add('liabilitiesEquity','الالتزامات إلى حقوق الملكية','Liabilities / equity','leverage',ratio(v.totalLiabilities,v.totalEquity),'×','Total liabilities / Total equity');
 add('equityAssets','حقوق الملكية إلى الأصول','Equity / assets','leverage',ratio(v.totalEquity,v.totalAssets,true),'%','Equity / Assets × 100');
 add('assetTurnover','دوران متوسط الأصول للفترة','Period average-asset turnover','efficiency',p?ratio(addStr(v.netRevenue,v.netRevenue,'USD'),addStr(v.totalAssets,p.totalAssets,'USD')):null,'×','Revenue / Average assets (not annualized)','يلزم رصيد أصول افتتاحي؛ النتيجة للفترة وليست سنوية / Opening assets required; period result, not annualized');
 const cycle=(role:string,flow:string|undefined)=>{const a=roleBalance(rows,role),b=previous?roleBalance(previous,role):null;if(a===null||b===null||flow===undefined||dec(flow,'USD').units<=0n)return null;return ratio(multiply(addStr(a,b,'USD'),String(days)),addStr(flow,flow,'USD'));};
 const dso=cycle('receivables',supplemental.creditSales),dio=cycle('inventory',v.costOfRevenue),dpo=cycle('payables',supplemental.creditPurchases);
 add('dso','أيام التحصيل','DSO','efficiency',dso,'days','Average receivables / Credit sales × Period days','يلزم متوسط الذمم والمبيعات الآجلة للفترة / Average receivables and period credit sales required');
 add('dio','أيام التخزين','DIO','efficiency',dio,'days','Average inventory / Cost of revenue × Period days','يلزم رصيد مخزون افتتاحي وتعريف حساباته / Opening inventory and explicit roles required');
 add('dpo','أيام السداد','DPO','efficiency',dpo,'days','Average payables / Credit purchases × Period days','يلزم متوسط الدائنين والمشتريات الآجلة / Average payables and credit purchases required');
 add('ccc','دورة تحويل النقد','Cash conversion cycle','efficiency',dso!==null&&dio!==null&&dpo!==null?subStr(addStr(dso,dio,'USD'),dpo,'USD'):null,'days','DSO + DIO − DPO','يتطلب توفر DSO وDIO وDPO / DSO, DIO and DPO required');
 return metrics;
}
export interface BudgetLine { period:string;accountCode:string;amount:string }
export function budgetFinance(rows:TrialRow[],budget:BudgetLine[],period:string){const selected=budget.filter(r=>r.period===period);if(!selected.length)return null;const codes=new Set(rows.map(r=>r.accountCode));if(selected.some(r=>!codes.has(r.accountCode)))throw new Error('Budget contains unknown account codes');const missing=rows.filter(r=>['income','expense.cost','expense.operating','expense.tax'].includes(r.classification)&&!selected.some(b=>b.accountCode===r.accountCode));if(missing.length)throw new Error('Budget must include every income and expense account: '+missing.map(r=>r.accountCode).join(', '));return calculateFinance(rows.map(r=>({...r,signedDebitBalance:selected.find(b=>b.accountCode===r.accountCode)?.amount??r.signedDebitBalance})));}
export interface Assumptions { revenuePct:string;costPct:string;opexPct:string;collectionDays:string }
export function modelScenario(rows:TrialRow[],a:Assumptions,days=31){const v=calculateFinance(rows);for(const key of ['revenuePct','costPct','opexPct'] as const)if(Number(a[key]) < -100 || Number(a[key])>1000)throw new Error('Change must be between -100% and 1000%');if(Number(a.collectionDays)<0||Number(a.collectionDays)>365)throw new Error('Collection delay must be 0–365 days');const revenue=changeBy(v.netRevenue,a.revenuePct),cost=changeBy(v.costOfRevenue,a.costPct),opex=changeBy(v.operatingExpenses,a.opexPct);const profit=subStr(subStr(subStr(revenue,cost,'USD'),opex,'USD'),v.taxExpense,'USD');const delayedCash=multiply(ratio(revenue,String(days))??'0.00',a.collectionDays);return {revenue,cost,opex,tax:v.taxExpense,profit,profitChange:subStr(profit,v.netProfit,'USD'),netMargin:ratio(profit,revenue,true),delayedCash};}
export interface TradeItem { id:string;kind:'receivable'|'payable';party:string;invoiceDate:string;dueDate:string;amount:string;paid:string }
export function aging(items:TradeItem[],asOf:string){const cutoff=Date.parse(asOf+'T00:00:00Z');if(!Number.isFinite(cutoff))throw new Error('Invalid aging cutoff');return items.filter(i=>i.invoiceDate<=asOf).map(item=>{const outstanding=subStr(item.amount,item.paid,'USD');const days=Math.max(0,Math.floor((cutoff-Date.parse(item.dueDate+'T00:00:00Z'))/86400000));const bucket=item.dueDate>=asOf?'current':days<=30?'1–30':days<=60?'31–60':days<=90?'61–90':'90+';return {...item,outstanding,days,bucket};});}
export function periodDays(month:string){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m,0)).getUTCDate();}
export const baselineComparative=source.financialReports.comparative;
