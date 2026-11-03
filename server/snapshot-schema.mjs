import { z } from 'zod';

const text = z.string().max(500);
const money = z.string().regex(/^-?\d{1,18}(\.\d{1,2})?$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.iso.date();
const row = z.object({
  accountCode: text.min(1), name: z.object({ ar: text, en: text }),
  classification: z.enum(['asset.current','asset.noncurrent','asset.contra','liability.current','liability.noncurrent','equity','income','expense.cost','expense.operating','expense.tax']),
  signedDebitBalance: money, sourceFile: text, sourceSheet: text,
  sourceRow: z.number().int().nonnegative(),
  role: z.enum(['cash','receivables','inventory','payables']).optional(),
});
const dataset = z.object({ entityId: text.min(1), period: month, rows: z.array(row).min(1).max(10000), sourceFile: text });
const amountUnits = value => { if(!/^-?\d{1,18}(\.\d{1,2})?$/.test(value))return 0n; const [whole, fraction = ''] = value.replace('-', '').split('.'); return BigInt(whole + fraction.padEnd(2, '0')) * (value.startsWith('-') ? -1n : 1n); };
export const snapshotSchema = z.object({
  version: z.literal(1), entityId: text.min(1), period: month,
  scenario: z.enum(['baseline','partialAllocation','blockedQuality','staleReviewVersion','unexplainedDifference250','lockedReconciliation','quotaReached','providerUnavailable','emptyEntity']),
  datasets: z.array(dataset).min(1).max(120),
  planning: z.object({
    budget: z.array(z.object({period:month,accountCode:text,amount:money})).max(10000),
    trade: z.array(z.object({id:text,kind:z.enum(['receivable','payable']),party:text,invoiceDate:date,dueDate:date,amount:money,paid:money})).max(10000),
    tradeAsOf: z.union([date,z.literal('')]),
    assumptions: z.object({revenuePct:money,costPct:money,opexPct:money,collectionDays:money}),
    supplemental: z.object({creditSales:money.optional(),creditPurchases:money.optional()}),
    notes: z.string().max(20000), owners:z.record(z.string().max(200),text),
  }),
}).superRefine((snapshot, ctx) => {
  const periods = new Set();
  for (const data of snapshot.datasets) {
    if (data.entityId !== snapshot.entityId || periods.has(data.period)) ctx.addIssue({code:'custom',message:'Dataset entity/period mismatch'});
    periods.add(data.period);
    if (new Set(data.rows.map(r=>r.accountCode)).size !== data.rows.length || data.rows.reduce((total,r)=>total+amountUnits(r.signedDebitBalance),0n)!==0n) ctx.addIssue({code:'custom',message:'Duplicate accounts or unbalanced trial balance'});
  }
  if (!periods.has(snapshot.period)) ctx.addIssue({code:'custom',message:'Active period is missing'});
  for (const item of snapshot.planning.trade) if (amountUnits(item.amount)<0n || amountUnits(item.paid)<0n || amountUnits(item.paid)>amountUnits(item.amount)) ctx.addIssue({code:'custom',message:'Invalid trade settlement'});
});
