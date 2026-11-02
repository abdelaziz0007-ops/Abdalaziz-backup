import { calculateFinance, classifications, type TrialRow } from './finance';
import { selectUnexplainedDifference, selectBankRollForwardValid } from './selectors';
import { reconciliationFingerprint } from './reconciliation';
import { dec, formatDec } from '@/lib/decimal';
import type { QualityReport, Reconciliation, ReportVersion } from './types';

export type StepState = 'complete' | 'action' | 'blocked' | 'unavailable';
export interface CloseStep { id: string; label: [string, string]; detail: [string, string]; state: StepState; to: string }
export interface CloseTask { id: string; title: [string, string]; detail: [string, string]; severity: 'blocking' | 'review' | 'info'; to: string; amount?: string; count?: number }
export interface ReadinessInput { rows: TrialRow[]; quality: QualityReport | null; reconciliation: Reconciliation | null; reports: ReportVersion[]; periodId: string; reviewedFingerprint: string | null }

/** Tracking evidence only. This model never approves outputs or locks periods. */
export function deriveReadiness(input: ReadinessInput) {
  const { rows, quality, reconciliation: rec, periodId } = input;
  const hasSource = rows.length > 0;
  const reports = input.reports.filter(report => report.periodId === periodId);
  const finance = calculateFinance(rows);
  const unmapped = rows.filter(row => !classifications.includes(row.classification)).length;
  const countsValid = !!quality && quality.counts.accepted + quality.counts.rejected + quality.counts.excluded === quality.counts.recordsRead;
  const qualityBlocked = !!quality && (quality.blocking.length > 0 || quality.counts.rejected > 0 || !countsValid);
  const unbalanced = hasSource && finance.trialResidual !== '0.00';
  const qualityReady = hasSource && !!quality && !qualityBlocked && !unbalanced;
  const relevantRec = rec?.periodId === periodId ? rec : null;
  const recDifference = relevantRec ? selectUnexplainedDifference(relevantRec) : null;
  const recComplete = !!relevantRec && relevantRec.completeBankDataset && relevantRec.completeBookDataset && selectBankRollForwardValid(relevantRec);
  const stale = !!relevantRec && !!input.reviewedFingerprint && input.reviewedFingerprint !== reconciliationFingerprint(relevantRec);
  const reconApproved = relevantRec?.status === 'approvedLocked';
  const reportsApproved = reports.length >= 2 && reports.every(report => report.status === 'approvedLocked');
  const reviewDone = reconApproved && reportsApproved;
  const recPath = relevantRec ? `/app/reconciliations/${relevantRec.id}/statement` : '/app/reconciliations';
  const tasks: CloseTask[] = [];
  if (!hasSource) tasks.push({ id: 'source', severity: 'blocking', title: ['أضف مصدر بيانات للفترة', 'Add a source for this period'], detail: ['لا تتوفر حسابات منشورة في هذا السياق.', 'No published accounts are available in this context.'], to: '/app/imports' });
  if (!quality) tasks.push({ id: 'quality-unavailable', severity: 'info', title: ['فحص الجودة غير متاح', 'Quality evidence unavailable'], detail: ['لا يمكن اعتبار الفحص مكتملًا دون نتيجته.', 'A missing quality result cannot count as a completed check.'], to: '/app/imports/quality' });
  if (qualityBlocked) tasks.push({ id: 'quality', severity: 'blocking', title: ['عالج مشكلات جودة البيانات', 'Resolve data quality blockers'], detail: ['توجد سجلات مرفوضة أو مشكلات مانعة أو عدّ غير متسق.', 'Rejected rows, blocking issues or inconsistent record counts remain.'], count: quality!.blocking.length || quality!.counts.rejected || 1, to: '/app/imports/quality' });
  if (unbalanced) tasks.push({ id: 'balance', severity: 'blocking', title: ['ميزان المراجعة غير متوازن', 'Trial balance does not balance'], detail: ['صحح المصدر؛ لا يُضاف بند موازنة تلقائي.', 'Correct the source; no automatic balancing entry is created.'], amount: finance.trialResidual, to: '/app/imports/quality' });
  if (unmapped) tasks.push({ id: 'mapping', severity: 'blocking', title: ['أكمل تصنيف الحسابات', 'Complete account mappings'], detail: ['هذه الحسابات لا تحمل تصنيفًا ماليًا صالحًا.', 'These accounts have no valid financial classification.'], count: unmapped, to: '/app/account-mapping' });
  if (!reports.length) tasks.push({ id: 'reports', severity: 'info', title: ['لا توجد قوائم للفترة المحددة', 'No statements for the selected period'], detail: ['تحقق من المصدر والفترة في مكتبة القوائم.', 'Check the source and period in the statements library.'], to: '/app/reports' });
  if (relevantRec && !recComplete) tasks.push({ id: 'recon-source', severity: 'blocking', title: ['تحقق من اكتمال مصادر التسوية', 'Check reconciliation sources'], detail: ['يلزم اكتمال البنك والدفاتر واتساق الرصيد البنكي.', 'Complete bank and book records and a valid bank roll-forward are required.'], to: recPath });
  if (recDifference !== null && recDifference !== '0.00') tasks.push({ id: 'difference', severity: 'blocking', title: ['فسّر فرق التسوية البنكية', 'Explain the reconciliation difference'], detail: ['الفرق مشتق من الرصيدين المعدلين، وليس حقلًا يدويًا.', 'The residual is derived from adjusted balances, not a manual field.'], amount: recDifference, to: recPath });
  if (stale && !reconApproved) tasks.push({ id: 'stale', severity: 'blocking', title: ['أعد مراجعة الإصدار الحالي', 'Review the current version again'], detail: ['تغيرت بصمة التسوية منذ الإرسال السابق.', 'The reconciliation fingerprint changed after submission.'], to: recPath });
  if (relevantRec) {
    const ambiguous = relevantRec.transactions.filter(tx => tx.matchState === 'ambiguous');
    if (ambiguous.length) {
      const magnitude = ambiguous.reduce((total, tx) => { const units = dec(tx.amount, tx.currency).units; return total + (units < 0n ? -units : units); }, 0n);
      tasks.push({ id: 'ambiguous', severity: 'review', title: ['راجع الحركات ذات المرشحين المتعددين', 'Review ambiguous transactions'], detail: ['القيمة تشمل سجلات الطرفين؛ ليست فرق تسوية أو نسبة دقة.', 'Value includes records on both sides; it is not a residual or accuracy score.'], count: ambiguous.length, amount: formatDec({ units: magnitude, scale: 2 }, 2), to: `/app/reconciliations/${relevantRec.id}/matching` });
    }
    const outstanding = relevantRec.outstandingItems.filter(item => item.status !== 'cleared');
    if (outstanding.length) tasks.push({ id: 'timing', severity: 'review', title: ['تابع البنود الزمنية المعلقة', 'Follow up outstanding timing items'], detail: ['تحتاج دليل تسوية لاحق؛ لا تمنع الاعتماد تلقائيًا.', 'Subsequent clearing evidence is needed; these do not automatically block approval.'], count: outstanding.length, to: '/app/reconciling-items' });
    if (!reconApproved) tasks.push({ id: 'review', severity: 'review', title: relevantRec.status === 'readyForReview' || relevantRec.status === 'underReview' ? ['التسوية بانتظار المراجع', 'Reconciliation awaits review'] : ['استكمل إعداد التسوية', 'Complete reconciliation preparation'], detail: ['الاعتماد يتطلب مراجعًا مستقلًا وفحص الإصدار الحالي.', 'Approval requires an independent reviewer and current-version checks.'], to: relevantRec.status === 'readyForReview' || relevantRec.status === 'underReview' ? `/app/reviews/${relevantRec.id}` : recPath });
  } else tasks.push({ id: 'recon-unavailable', severity: 'info', title: ['لا تتوفر تسوية لهذه الفترة', 'No reconciliation for this period'], detail: ['حالة التسوية غير معروفة؛ لا تُعرض كمنجزة.', 'Reconciliation status is unknown and is not treated as complete.'], to: '/app/reconciliations' });
  if (reports.length && !reportsApproved) tasks.push({ id: 'drafts', severity: 'info', title: ['القوائم ما زالت مسودات', 'Statements remain drafts'], detail: ['اعتماد التسوية لا يعتمد القوائم؛ اعتماد القوائم غير مفعّل في النسخة الحالية.', 'Reconciliation approval does not approve statements; statement approval is not active in this version.'], count: reports.filter(report => report.status !== 'approvedLocked').length, to: '/app/reports' });
  const steps: CloseStep[] = [
    { id: 'source', label: ['إدخال البيانات', 'Source data'], detail: hasSource ? [`${rows.length} حسابًا في المصدر`, `${rows.length} source accounts`] : ['مصدر البيانات مطلوب', 'A data source is required'], state: hasSource ? 'complete' : 'action', to: '/app/imports' },
    { id: 'quality', label: ['التحقق من الجودة', 'Validate quality'], detail: qualityReady ? ['لا توجد مشكلات مانعة', 'No blocking issues'] : ['تحقق من الجودة وتوازن المصدر', 'Check quality and source balance'], state: qualityBlocked || unbalanced ? 'blocked' : qualityReady ? 'complete' : 'unavailable', to: '/app/imports/quality' },
    { id: 'mapping', label: ['تصنيف الحسابات', 'Map accounts'], detail: unmapped ? [`${unmapped} حسابات تحتاج تصنيفًا`, `${unmapped} accounts need mapping`] : ['كل الحسابات تحمل تصنيفًا', 'All accounts have a classification'], state: !hasSource ? 'unavailable' : unmapped ? 'blocked' : 'complete', to: '/app/account-mapping' },
    { id: 'outputs', label: ['إعداد المخرجات', 'Prepare outputs'], detail: reports.length ? [`${reports.length} قوائم للفترة`, `${reports.length} period statements`] : ['لا توجد قوائم لهذه الفترة', 'No statements for this period'], state: qualityReady && !unmapped && reports.length >= 2 ? 'complete' : qualityBlocked || unbalanced || unmapped ? 'blocked' : 'action', to: '/app/reports' },
    { id: 'review', label: ['المراجعة والاعتماد', 'Review & approval'], detail: reviewDone ? ['المخرجات معتمدة', 'Outputs approved'] : reconApproved ? ['التسوية معتمدة؛ القوائم مستقلة', 'Reconciliation approved; statements are separate'] : ['المراجعة المستقلة لم تكتمل', 'Independent review is not complete'], state: recDifference !== null && recDifference !== '0.00' || qualityBlocked || stale && !reconApproved ? 'blocked' : reviewDone ? 'complete' : 'action', to: recPath },
  ];
  const blocking = tasks.filter(task => task.severity === 'blocking');
  const next = blocking[0] ?? tasks.find(task => task.id === 'review') ?? tasks[0] ?? null;
  return { steps, tasks, blocking, next, completed: steps.filter(step => step.state === 'complete').length, unmapped, recDifference, reviewDone };
}
