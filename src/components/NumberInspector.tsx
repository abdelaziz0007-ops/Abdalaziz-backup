import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildEvidence } from '@/data/evidence';
import { useWorkbench } from '@/state/WorkbenchProvider';
import { usePreferences } from '@/state/PreferencesProvider';
import { useDemo } from '@/state/DemoProvider';
import { useFormat } from '@/lib/hooks';
import { Icon, Money, Notice, useLanguage } from './WorkspaceUI';
import { DataTable } from './ui/DataTable';

/** Non-modal evidence region: page remains operable and focus is not trapped. */
export function NumberInspector({ metric, comparative = false, onClose }: { metric: string; comparative?: boolean; onClose: () => void }) {
  const w = useWorkbench(), d = useDemo(), { locale } = usePreferences(), l = useLanguage(), f = useFormat();
  const closeRef = useRef<HTMLButtonElement>(null), callback = useRef(onClose);
  const returnFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modal,setModal] = useState(()=>window.matchMedia('(max-width: 767px)').matches);
  callback.current = onClose;
  useEffect(()=>{const query=window.matchMedia('(max-width: 767px)');const changed=()=>setModal(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);
  useEffect(()=>{const dialog=dialogRef.current;if(modal)dialog?.showModal();closeRef.current?.focus();return()=>dialog?.close();},[modal]);
  useEffect(() => {
    const previous = returnFocus.current;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); callback.current(); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus(); };
  }, []);
  const evidence = buildEvidence(metric,w.rows,comparative);
  const mayInspect = !!d.selectedEntityId && d.currentPersona?.scopedEntityIds.includes(d.selectedEntityId) && (d.currentPersona.permissions.includes('reports.view') || d.currentPersona.permissions.includes('dashboard.view'));
  if (!evidence || !mayInspect) return null;
  const content = <aside className="number-inspector" role="region" aria-labelledby="number-inspector-title" data-testid="number-inspector">
    <header className="inspector-header"><div><p className="eyebrow">{l('تفاصيل الرقم','NUMBER DETAILS')}</p><h2 id="number-inspector-title">{l(...evidence.title)}</h2></div><button ref={closeRef} className="icon-button" onClick={onClose} aria-label={l('إغلاق تفاصيل الرقم','Close number details')}><Icon name="close"/></button></header>
    <div className="inspector-body">
      <div className="inspector-value"><span>{l('القيمة المعروضة','Displayed value')}</span><strong><bdi>{evidence.value === null ? l('غير متاح','Unavailable') : evidence.unit === 'USD' ? f.amount(evidence.value,'USD') : evidence.value}</bdi> <small>{evidence.unit}</small></strong></div>
      <section className="evidence-section"><h3>{l('كيف حُسب الرقم؟','How is it calculated?')}</h3><p>{l(...evidence.formula)}</p>{evidence.value===null&&<Notice tone="warning">{l('مدخلات الحساب غير متوفرة أو المقام صفر؛ لا نعرض قيمة بديلة.','Inputs are missing or the denominator is zero; no substitute value is shown.')}</Notice>}</section>
      <dl className="metadata inspector-metadata"><div><dt>{l('الفترة','Period')}</dt><dd>{comparative?'2026-09':d.selectedPeriodId?.split('ENT-ATLAS-').at(-1)}</dd></div><div><dt>{l('إصدار المصدر والتصنيف','Source & mapping version')}</dt><dd>{comparative?l('لقطة المقارنة المرفقة','Bundled comparison snapshot'):`v${w.revision}`}</dd></div><div><dt>{l('أساس العرض','Presentation basis')}</dt><dd>{l('قبل القيود المقترحة','Before proposed entries')}</dd></div></dl>
      <section className="evidence-section"><h3>{l('الحسابات والأدلة المصدرية','Source accounts & evidence')}</h3>{comparative?<Notice>{l('المرفق يتضمن إجماليات سبتمبر فقط؛ لا تتوفر صفوف حساباته. لا تُستخدم حسابات أكتوبر كدليل بديل.','Only September aggregates were supplied; account rows are unavailable. October accounts are not used as substitute evidence.')}</Notice>:<><p className="small muted">{l('مدين موجب، دائن سالب. انقر على الحساب لفتح صف المصدر.','Debits are positive, credits negative. Open an account to inspect its source row.')}</p><DataTable label={l('مدخلات الرقم','Number inputs')} rows={evidence.rows} rowKey={row=>row.accountCode} columns={[{key:'account',header:l('الحساب / المصدر','Account / source'),render:row=><div><Link to={`/app/sources/${row.accountCode}`}><bdi>{row.accountCode}</bdi> · {row.name[locale]}</Link><small className="source-location">{row.sourceFile} · {row.sourceSheet}:{row.sourceRow}</small></div>},{key:'balance',header:l('الرصيد USD','Balance USD'),numeric:true,render:row=><Money value={row.signedDebitBalance}/>}]} /></>}</section>
      <Notice>{l('هذه لقطة من المصدر الحالي. التعديلات البنكية المقترحة لا تغيّر هذه الأرصدة ولا تعني اعتماد القائمة.','This is the current source snapshot. Proposed bank adjustments do not change these balances or approve the statement.')}</Notice>
    </div>
  </aside>;
  return modal ? <dialog ref={dialogRef} className="inspector-dialog" aria-labelledby="number-inspector-title" onCancel={event=>{event.preventDefault();onClose();}}>{content}</dialog> : content;
}
