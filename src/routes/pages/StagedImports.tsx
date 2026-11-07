import {useEffect, useRef, useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {DataTable} from '@/components/ui/DataTable';
import {Notice, useLanguage} from '@/components/WorkspaceUI';
import {sourceFieldLabels} from './SourcePreview';

type Values = Record<string, string | null>;
type Totals = Record<string, {amount: string; missing: number}>;
interface Batch {id: string; original_name: string; range_start: string; range_end: string}
interface Row {id: string; rowNumber: number; version: number; values: Values; originalValues: Values; disposition: string}
interface BatchDetails {
  editable: boolean;
  publishable: boolean;
  status: string;
  dataType: string;
  bankAccounts: {id: string; label: string; identifier_last_four: string | null}[];
  currencyCode: string;
  fields: string[];
  rows: Row[];
  quality: {id: string; records_read: number; accepted: number; rejected: number; excluded: number; totals_before: Totals; totals_after: Totals};
  issues: {severity: string; code: string; message: string; evidence: {rowNumber: number | null}}[];
}

function PublishImport({path, details, onPublished}: {path: string; details: BatchDetails; onPublished: () => void}) {
  const l = useLanguage();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState('');
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const trialBalance = details.dataType === 'trial_balance';
  const bank = details.dataType === 'bank_statement' || details.dataType === 'bank_ledger';
  async function publish() {
    setBusy(true);setError('');
    try {
      await backend(path, {qualityRunId: details.quality.id, confirmation: true, reason,
        balanceBasis: trialBalance ? 'period' : undefined,
        bank: bank ? {accountId, opening: opening.trim(), closing: closing.trim(), signPolicy:'cash_increase_positive'} : undefined});
      onPublished();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {setBusy(false);}
  }
  return <form className="stack" onSubmit={event=>{event.preventDefault();void publish();}}>
    <h5>{l('نشر مجموعة البيانات','Publish dataset')}</h5>
    {bank && <div className="form-grid">
      <label className="form-field">{l('الحساب البنكي','Bank account')}
        <select required disabled={busy} value={accountId} onChange={event=>{setAccountId(event.target.value);setConfirmed(false);}}>
          <option value="">{l('اختر الحساب','Choose account')}</option>
          {details.bankAccounts.map(account=><option key={account.id} value={account.id}>{account.label} · ••••{account.identifier_last_four}</option>)}
        </select>
      </label>
      <label className="form-field">{l('الرصيد قبل أول حركة في الفترة','Opening balance before the first movement')}
        <input required inputMode="decimal" maxLength={40} value={opening} disabled={busy}
          onChange={event=>{setOpening(event.target.value);setConfirmed(false);}}/>
      </label>
      <label className="form-field">{l('رصيد الإغلاق في نهاية الفترة','Closing balance at period end')}
        <input required inputMode="decimal" maxLength={40} value={closing} disabled={busy}
          onChange={event=>{setClosing(event.target.value);setConfirmed(false);}}/>
      </label>
    </div>}
    <label className="row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>
      {bank ? l('أؤكد اكتمال الحركات للفترة وأن زيادة النقد موجبة والنقص سالب.','I confirm the period movements are complete, with positive cash increases and negative cash decreases.') : trialBalance
        ? l('أؤكد اكتمال صفوف ميزان المراجعة للفترة المختارة.','I confirm these are the complete trial-balance rows for the selected period.')
        : l('أؤكد اكتمال قيود دفتر الأستاذ للفترة المختارة.','I confirm these are the complete general-ledger entries for the selected period.')}
    </label>
    <label className="form-field">{l('سبب النشر','Publication reason')}
      <input minLength={8} maxLength={500} required disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/>
    </label>
    {error && <Notice tone="danger">{error}</Notice>}
    <Button type="submit" disabled={busy || !confirmed || reason.trim().length < 8 || bank && (!accountId || !opening.trim() || !closing.trim())}>
      {l('نشر الإصدار وتثبيته','Publish and lock version')}
    </Button>
  </form>;
}

function RowCorrection({path, row, fields, onSaved}: {path: string; row: Row; fields: string[]; onSaved: () => void}) {
  const l = useLanguage();
  const [action, setAction] = useState('correct');
  const [field, setField] = useState(fields[0] ?? '');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef<{signature: string; id: string} | null>(null);
  async function save() {
    const decision = action === 'correct' ? {change: {field, value}} : {excluded: action === 'exclude'};
    const body = {rowId: row.id, expectedVersion: row.version, reason, ...decision};
    const signature = JSON.stringify(body);
    if (key.current?.signature !== signature) key.current = {signature, id: crypto.randomUUID()};
    setBusy(true); setError('');
    try {
      await backend(path, {...body, requestKey: key.current.id});
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={event => {event.preventDefault(); void save();}}>
    <h5>{l('مراجعة الصف','Review row')} {row.rowNumber}</h5>
    <label className="form-field">{l('الإجراء','Action')}
      <select value={action} disabled={busy} onChange={event => setAction(event.target.value)}>
        <option value="correct">{l('تصحيح حقل','Correct field')}</option>
        {row.disposition !== 'excluded' && <option value="exclude">{l('استبعاد الصف','Exclude row')}</option>}
        {row.disposition === 'excluded' && <option value="include">{l('إعادة إدراج الصف','Include row again')}</option>}
      </select>
    </label>
    {action === 'correct' && <>
      <label className="form-field">{l('الحقل','Field')}
        <select value={field} disabled={busy} onChange={event => {setField(event.target.value);setValue('');}}>
          {fields.map(name => <option key={name} value={name}>{sourceFieldLabels[name] ? l(...sourceFieldLabels[name]) : name}</option>)}
        </select>
      </label>
      <p>{l('القيمة الأصلية بعد الربط','Original mapped value')} <bdi>{row.originalValues[field] ?? '—'}</bdi></p>
      <label className="form-field">{l('القيمة المصححة بتنسيق المصدر','Corrected value in source format')}
        <input value={value} maxLength={500} disabled={busy} onChange={event => setValue(event.target.value)}/>
      </label>
    </>}
    <label className="form-field">{l('سبب التعديل','Reason for change')}
      <input required minLength={8} maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}/>
    </label>
    {error && <Notice tone="danger">{error}</Notice>}
    <Button type="submit" disabled={busy || reason.trim().length < 8}>{l('حفظ وإعادة التحقق','Save and validate again')}</Button>
  </form>;
}

export function StagedImports({path, selected, onSelect, revision}: {
  path: string; selected: string; onSelect: (id: string) => void; revision: number;
}) {
  const l = useLanguage();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [offset, setOffset] = useState(0);
  const [details, setDetails] = useState<BatchDetails | null>(null);
  const [selectedRow, setSelectedRow] = useState('');
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const fieldLabel = (field: string) => sourceFieldLabels[field] ? l(...sourceFieldLabels[field]) : field;
  useEffect(() => {
    let live = true;
    backend<Batch[]>(path).then(values => {if (live) setBatches(values);})
      .catch(error => {if (live) setError(error.message);});
    return () => {live = false;};
  }, [path, revision]);
  useEffect(() => {setOffset(0);setSelectedRow('');}, [selected]);
  useEffect(() => {
    setDetails(null);setError('');
    if (!selected) return;
    let live = true;
    backend<BatchDetails>(path + '/' + selected + '?offset=' + offset)
      .then(value => {if (live) setDetails(value);})
      .catch(error => {if (live) setError(error.message);});
    return () => {live = false;};
  }, [path, selected, offset, reload, revision]);
  const row = details?.rows.find(item => item.id === selectedRow);
  const quality = details?.quality;
  return <section className="stack" aria-label={l('دفعات مراجعة الاستيراد','Import review batches')}>
    <h4>{l('دفعات مراجعة الاستيراد','Import review batches')}</h4>
    <label className="form-field">{l('اختر دفعة','Choose batch')}
      <select value={selected} onChange={event => onSelect(event.target.value)}>
        <option value="">{l('اختر دفعة','Choose batch')}</option>
        {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.original_name} · {batch.range_start} – {batch.range_end}</option>)}
      </select>
    </label>
    {error && <Notice tone="danger">{error}</Notice>}
    {selected && !details && !error && <p role="status">{l('جارٍ تحميل الدفعة…','Loading batch…')}</p>}
    {details && quality && <>
      {details.status === 'published' && <p role="status">{l('نُشرت مجموعة البيانات وثُبّت الإصدار.','The dataset was published and the version was locked.')}</p>}
      <p>{l('الصفوف المقروءة','Rows read')} {quality.records_read} · {l('المقبولة للمراجعة','Accepted for review')} {quality.accepted} · {l('المرفوضة','Rejected')} {quality.rejected} · {l('المستبعدة','Excluded')} {quality.excluded}</p>
      <DataTable label={l('إجماليات التحقق','Validation totals')} rows={Object.keys(quality.totals_before)} rowKey={field=>field}
        columns={[{key:'field',header:l('الحقل','Field'),render:field=>fieldLabel(field)},
          {key:'before',header:l('قبل المراجعة','Before review'),render:field=><bdi>{quality.totals_before[field].amount} {details.currencyCode} · {l('قيم مفقودة','Missing')} {quality.totals_before[field].missing}</bdi>},
          {key:'after',header:l('الصفوف المقبولة','Accepted rows'),render:field=><bdi>{quality.totals_after[field].amount} {details.currencyCode}</bdi>}]}/>
      {details.issues.length > 0 && <details>
        <summary>{l('نتائج التحقق (حتى 100 نتيجة)','Validation results (up to 100)')}</summary>
        <ul>{details.issues.map((issue,index)=><li key={index}>
          {issue.evidence.rowNumber && <>{l('الصف','Row')} {issue.evidence.rowNumber} · </>}
          {issue.severity==='blocking'?l('مانع','Blocking'):l('تحذير','Warning')} · {issue.message}
        </li>)}</ul>
      </details>}
      <DataTable label={l('صفوف الدفعة','Batch rows')} rows={details.rows} rowKey={row=>row.id}
        columns={[{key:'row',header:l('الصف','Row'),render:row=>row.rowNumber},
          ...details.fields.map(field=>({key:field,header:fieldLabel(field),render:(row:Row)=>row.values[field]??'—'})),
          {key:'state',header:l('حالة الصف','Row status'),render:row=>row.disposition==='excluded'?l('مستبعد','Excluded'):row.disposition==='rejected'?l('يحتاج مراجعة','Needs review'):l('مقبول للمراجعة','Accepted for review')},
          {key:'edit',header:l('مراجعة','Review'),render:row=>details.editable&&<Button variant="ghost" onClick={()=>setSelectedRow(row.id)}>{l('مراجعة الصف','Review row')}</Button>}]}/>
      <div className="row">
        <Button disabled={offset===0} onClick={()=>{setSelectedRow('');setOffset(value=>Math.max(0,value-25));}}>{l('السابق','Previous')}</Button>
        <Button disabled={offset+25>=quality.records_read} onClick={()=>{setSelectedRow('');setOffset(value=>value+25);}}>{l('التالي','Next')}</Button>
      </div>
      {row && details.editable && <RowCorrection key={row.id+':'+row.version} path={path+'/'+selected+'/corrections'}
        row={row} fields={details.fields} onSaved={()=>{setSelectedRow('');setReload(value=>value+1);}}/>}
      {details.publishable && <PublishImport key={quality.id} path={path+'/'+selected+'/publish'} details={details}
        onPublished={()=>{setSelectedRow('');setReload(value=>value+1);}}/>}
      {details.editable && details.dataType.startsWith('bank_') && !details.bankAccounts.length &&
        <Notice>{l('أضف حسابًا بنكيًا بعملة الفترة قبل نشر الدفعة.','Add a bank account in the period currency before publishing this batch.')}</Notice>}
      {details.editable && details.dataType.startsWith('bank_') && quality.records_read > 1000 &&
        <Notice>{l('الحد الحالي للنشر البنكي هو 1000 حركة لكل جهة.','Bank publication currently supports up to 1000 movements per side.')}</Notice>}
    </>}
  </section>;
}
