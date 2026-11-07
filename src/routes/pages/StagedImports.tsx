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
  currencyCode: string;
  fields: string[];
  rows: Row[];
  quality: {records_read: number; accepted: number; rejected: number; excluded: number; totals_before: Totals; totals_after: Totals};
  issues: {severity: string; code: string; message: string; evidence: {rowNumber: number | null}}[];
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
    </>}
  </section>;
}
