import {useEffect, useRef, useState} from 'react';
import {backend, BackendError} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {DataTable} from '@/components/ui/DataTable';
import {Notice, useLanguage} from '@/components/WorkspaceUI';

interface Period {id: string; start_date: string; end_date: string; version: number}
interface RawRow {rowNumber: number; cells: {text: string}[]}
interface Sheet {name: string; rowCount: number; columnCount: number; rows: RawRow[]}
interface Workbook {sheets: Sheet[]; dateSystem: string | null}
interface MappedRow {rowNumber: number; valid: boolean; values: Record<string, string | null>}
interface MappingPreview {
  rows: MappedRow[];
  requiredHeaders: {field: string}[];
  completeSourcePreview: boolean;
  issues: {rowNumber: number; field?: string; code: string; severity: string; message: string}[];
}
interface Template {id: string; name: string; version: number; source_format: string; data_type: string}
interface MappedResponse {
  preview: MappingPreview;
  currencyCode: string;
  savedTemplate: Pick<Template, 'id' | 'name' | 'version'> | null;
}
const required = {
  trial_balance: ['accountCode', 'accountName', 'closingBalance'],
  general_ledger: ['journalReference', 'lineReference', 'accountCode', 'postingDate', 'debit', 'credit'],
  bank_statement: ['rowId', 'postingDate', 'signedAmount'],
  bank_ledger: ['rowId', 'postingDate', 'signedAmount'],
} as const;
const optional = {
  trial_balance: ['classification', 'openingBalance', 'debitMovement', 'creditMovement'],
  general_ledger: ['description'],
  bank_statement: ['reference', 'description', 'runningBalance'],
  bank_ledger: ['reference', 'description', 'runningBalance'],
} as const;
const labels: Record<string, [string, string]> = {
  accountCode: ['رمز الحساب', 'Account code'], accountName: ['اسم الحساب', 'Account name'],
  closingBalance: ['الرصيد الختامي', 'Closing balance'], openingBalance: ['الرصيد الافتتاحي', 'Opening balance'],
  classification: ['التصنيف', 'Classification'], debitMovement: ['الحركة المدينة', 'Debit movement'],
  creditMovement: ['الحركة الدائنة', 'Credit movement'], journalReference: ['مرجع القيد', 'Journal reference'],
  lineReference: ['مرجع السطر', 'Line reference'], postingDate: ['تاريخ القيد', 'Posting date'],
  debit: ['مدين', 'Debit'], credit: ['دائن', 'Credit'], description: ['الوصف', 'Description'],
  rowId: ['معرّف الحركة', 'Transaction ID'], signedAmount: ['المبلغ بإشارته', 'Signed amount'],
  reference: ['المرجع', 'Reference'], runningBalance: ['الرصيد بعد الحركة', 'Running balance'],
};

export function SourcePreview({path, templatesPath, name, csv, periods}: {
  path: string; templatesPath: string; name: string; csv: boolean; periods: Period[];
}) {
  const l = useLanguage();
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [mapped, setMapped] = useState<MappedResponse | null>(null);
  const [delimiter, setDelimiter] = useState(',');
  const [previewRows, setPreviewRows] = useState(50);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [periodId, setPeriodId] = useState('');
  const [dataType, setDataType] = useState<keyof typeof required>('trial_balance');
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [decimalSeparator, setDecimal] = useState('.');
  const [thousandsSeparator, setThousands] = useState('');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [predecessorId, setPredecessorId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateRevision, setTemplateRevision] = useState(0);
  const saveKey = useRef<{signature: string; id: string} | null>(null);
  const sheet = workbook?.sheets.find(item => item.name === sheetName);
  const header = sheet?.rows.find(row => row.rowNumber === headerRow);
  const fields = [...required[dataType], ...optional[dataType]];
  const label = (field: string) => labels[field] ? l(...labels[field]) : field;
  const matchingTemplates = templates.filter(template => template.source_format === (csv ? 'csv' : 'xlsx'));
  useEffect(() => {
    let live = true;
    backend<Template[]>(templatesPath).then(values => {
      if (live) setTemplates(values);
    }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { live = false; };
  }, [templatesPath, templateRevision]);

  function showError(reason: unknown) {
    if (reason instanceof BackendError && reason.code === 'PREVIEW_RUNTIME_UNAVAILABLE') {
      setError(l('خدمة المعاينة المعزولة غير متاحة حاليًا.', 'The isolated preview service is currently unavailable.'));
      return;
    }
    if (reason instanceof BackendError && reason.code === 'TEMPLATE_COLUMN_DRIFT') {
      setError(l('تغيّرت أعمدة المصدر. اقرأ الصفوف وراجع الربط قبل حفظ إصدار جديد.', 'Source columns changed. Read the rows and review the mapping before saving a new version.'));
      return;
    }
    if (reason instanceof BackendError && reason.code === 'TEMPLATE_VERSION_CHANGED') {
      setTemplateRevision(value => value + 1);
      setPredecessorId('');
      setError(l('ظهر إصدار أحدث. اختر الإصدار السابق مرة أخرى قبل الحفظ.', 'A newer version exists. Select the previous version again before saving.'));
      return;
    }
    setError(reason instanceof Error ? reason.message : String(reason));
  }
  async function load() {
    setBusy(true); setError(''); setWorkbook(null); setMapped(null); setMapping({});
    try {
      const {preview} = await backend<{preview: Workbook}>(path, {delimiter, previewRows});
      setWorkbook(preview);
      setSheetName(preview.sheets[0]?.name ?? '');
      setHeaderRow(preview.sheets[0]?.rows.find(row => row.rowNumber <= 100)?.rowNumber ?? 1);
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function mapRows(save = false) {
    setBusy(true); setError('');
    if (!save) setMapped(null);
    try {
      const columns = Object.fromEntries(Object.entries(mapping).filter(([, column]) => column > 0));
      const request = {delimiter, previewRows, mapping: {
        periodId, sheetName, headerRow, dataType, mapping: columns,
        decimalSeparator, thousandsSeparator: thousandsSeparator || null, dateFormat,
      }};
      let saveTemplate;
      if (save) {
        const draft = {name: templateName.trim(), predecessorId: predecessorId || null};
        const signature = JSON.stringify([request, draft]);
        if (saveKey.current?.signature !== signature) saveKey.current = {signature, id: crypto.randomUUID()};
        saveTemplate = {...draft, requestKey: saveKey.current.id};
      }
      const response = await backend<MappedResponse>(path, {...request, saveTemplate});
      setMapped(response);
      if (response.savedTemplate) {
        saveKey.current = null;
        setTemplateRevision(value => value + 1);
        setTemplateId(response.savedTemplate.id);
        setPredecessorId('');
        setTemplateName('');
      }
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }
  async function applyTemplate() {
    setBusy(true); setError(''); setMapped(null); setWorkbook(null);
    try {
      setMapped(await backend<MappedResponse>(path, {previewRows, template: {id: templateId, periodId}}));
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }

  return <section className="stack" aria-label={l('معاينة المصدر','Source preview')}>
    <h4>{l('معاينة المصدر', 'Source preview')} · {name}</h4>
    <label className="form-field">{l('الفترة المالية للربط','Accounting period for mapping')}
      <select value={periodId} disabled={busy} onChange={event => {setPeriodId(event.target.value); setMapped(null);}}>
        <option value="">{l('اختر الفترة','Choose period')}</option>
        {periods.map(period => <option key={period.id} value={period.id}>{period.start_date} – {period.end_date} (v{period.version})</option>)}
      </select>
    </label>
    {matchingTemplates.length > 0 && <form className="stack" onSubmit={event => {event.preventDefault(); void applyTemplate();}}>
      <label className="form-field">{l('قالب ربط محفوظ','Saved mapping template')}
        <select value={templateId} disabled={busy} onChange={event => {setTemplateId(event.target.value); setMapped(null);}}>
          <option value="">{l('اختر قالبًا','Choose template')}</option>
          {matchingTemplates.map(template => <option key={template.id} value={template.id}>{template.name} (v{template.version})</option>)}
        </select>
      </label>
      <Button type="submit" disabled={busy || !periodId || !templateId}>{l('معاينة بالقالب','Preview with template')}</Button>
    </form>}
    <form className="stack" onSubmit={event => {event.preventDefault(); void load();}}>
      <div className="form-grid">
        {csv && <label className="form-field">{l('فاصل الأعمدة','Column delimiter')}
          <select value={delimiter} disabled={busy} onChange={event => {setDelimiter(event.target.value); setWorkbook(null); setMapped(null);}}>
            <option value=",">{l('فاصلة','Comma')}</option><option value=";">{l('فاصلة منقوطة','Semicolon')}</option>
            <option value={'\t'}>{l('جدولة','Tab')}</option>
          </select>
        </label>}
        <label className="form-field">{l('صفوف المعاينة لكل ورقة','Preview rows per worksheet')}
          <select value={previewRows} disabled={busy} onChange={event => {setPreviewRows(Number(event.target.value)); setWorkbook(null); setMapped(null);}}>
            {[25,50,100,120].map(count => <option key={count}>{count}</option>)}
          </select>
        </label>
      </div>
      <Button type="submit" disabled={busy}>{l('قراءة صفوف المصدر','Read source rows')}</Button>
    </form>
    {busy && <p role="status">{l('تجري المعالجة المعزولة…','Running isolated preview…')}</p>}
    {error && <Notice tone="danger">{error}</Notice>}
    {workbook && sheet && <>
      <label className="form-field">{l('ورقة العمل','Worksheet')}
        <select value={sheetName} disabled={busy} onChange={event => {
          const name = event.target.value;
          setSheetName(name); setMapping({}); setMapped(null);
          setHeaderRow(workbook.sheets.find(item => item.name === name)?.rows.find(row => row.rowNumber <= 100)?.rowNumber ?? 1);
        }}>{workbook.sheets.map(item => <option key={item.name}>{item.name}</option>)}</select>
      </label>
      <p>{l('الصفوف المعروضة من إجمالي صفوف الورقة','Rows shown out of all worksheet rows')} <bdi>{sheet.rows.length} / {sheet.rowCount}</bdi></p>
      <DataTable label={l('صفوف المصدر الأصلية','Original source rows')} rows={sheet.rows} rowKey={row => String(row.rowNumber)}
        columns={[{key:'row', header:l('الصف','Row'), render: row => row.rowNumber},
          ...Array.from({length: sheet.columnCount}, (_, index) => ({
            key:String(index), header:String(index + 1), render:(row:RawRow) => row.cells[index]?.text ?? '',
          }))]}/>
      <form className="stack" onChange={() => setMapped(null)} onSubmit={event => {event.preventDefault(); void mapRows();}}>
        <fieldset disabled={busy} className="form-grid">
          <label className="form-field">{l('صف العناوين','Header row')}
            <select value={headerRow} onChange={event => {setHeaderRow(Number(event.target.value)); setMapping({});}}>
              {sheet.rows.filter(row => row.rowNumber <= 100).map(row => <option key={row.rowNumber}>{row.rowNumber}</option>)}
            </select>
          </label>
          <label className="form-field">{l('نوع البيانات','Data type')}
            <select value={dataType} onChange={event => {setDataType(event.target.value as keyof typeof required); setMapping({}); setPredecessorId('');}}>
              <option value="trial_balance">{l('ميزان المراجعة','Trial balance')}</option>
              <option value="general_ledger">{l('دفتر الأستاذ','General ledger')}</option>
              <option value="bank_statement">{l('كشف البنك','Bank statement')}</option>
              <option value="bank_ledger">{l('دفتر البنك','Bank ledger')}</option>
            </select>
          </label>
          <label className="form-field">{l('الفاصل العشري','Decimal separator')}
            <select value={decimalSeparator} onChange={event => {setDecimal(event.target.value); if(thousandsSeparator === event.target.value) setThousands('');}}>
              <option value=".">.</option><option value=",">,</option>
            </select>
          </label>
          <label className="form-field">{l('فاصل الآلاف','Thousands separator')}
            <select value={thousandsSeparator} onChange={event => setThousands(event.target.value)}>
              <option value="">{l('بلا فاصل','None')}</option>
              {['.', ','].filter(value => value !== decimalSeparator).map(value => <option key={value}>{value}</option>)}
              <option value=" ">{l('مسافة','Space')}</option>
            </select>
          </label>
          {dataType !== 'trial_balance' && <label className="form-field">{l('تنسيق التاريخ','Date format')}
            <select value={dateFormat} onChange={event => setDateFormat(event.target.value)}>
              {['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'].map(value => <option key={value}>{value}</option>)}
              {workbook.dateSystem && <option value="excel_serial">{l('رقم تاريخ Excel','Excel date serial')}</option>}
            </select>
          </label>}
          {fields.map(field => <label className="form-field" key={field}>{label(field)}
            <select value={mapping[field] ?? 0} required={(required[dataType] as readonly string[]).includes(field)}
              onChange={event => setMapping(current => ({...current, [field]: Number(event.target.value)}))}>
              <option value={0}>{l('اختر العمود','Choose column')}</option>
              {header?.cells.map((cell, index) => cell.text.trim() && <option key={index} value={index+1}>{index+1} · {cell.text.slice(0,120)}</option>)}
            </select>
          </label>)}
        </fieldset>
        <Button type="submit" disabled={busy || !periodId || !header || required[dataType].some(field => !mapping[field])}>
          {l('معاينة الأعمدة بعد الربط','Preview mapped columns')}
        </Button>
      </form>
    </>}
    {mapped && <div className="stack">
      <p>{l('معاينة للقراءة فقط','Read-only preview')} · <bdi>{mapped.currencyCode}</bdi>
        {!mapped.preview.completeSourcePreview && <> · {l('عينة من المصدر','Sample of source rows')}</>}</p>
      <DataTable label={l('الصفوف بعد ربط الأعمدة','Mapped rows')} rows={mapped.preview.rows} rowKey={row => String(row.rowNumber)}
        columns={[{key:'row',header:l('الصف','Row'),render:row=>row.rowNumber},
          {key:'status',header:l('النتيجة','Result'),render:row=>row.valid?l('صالح في المعاينة','Valid in preview'):l('يحتاج تصحيحًا','Needs correction')},
          ...mapped.preview.requiredHeaders.map(({field})=>({key:field,header:label(field),render:(row:MappedRow)=>row.values[field]??'—'}))]}/>
      {mapped.preview.issues.length > 0 && <ul>{mapped.preview.issues.map((issue, index) => <li key={index}>
        {l('الصف','Row')} {issue.rowNumber} · {issue.field && <>{label(issue.field)} · </>}
        {issue.severity==='blocking'?l('خطأ','Error'):l('تحذير','Warning')} · {issue.message}
      </li>)}</ul>}
      {mapped.savedTemplate && <p role="status">{l('حُفظ القالب','Template saved')} · {mapped.savedTemplate.name} (v{mapped.savedTemplate.version})</p>}
      {workbook && <form className="stack" onSubmit={event => {event.preventDefault(); void mapRows(true);}}>
        <label className="form-field">{l('اسم القالب','Template name')}
          <input value={templateName} maxLength={120} required disabled={busy} onChange={event => setTemplateName(event.target.value)}/>
        </label>
        <label className="form-field">{l('القالب السابق','Previous template')}
          <select value={predecessorId} disabled={busy} onChange={event => {
            const previous = matchingTemplates.find(template => template.id === event.target.value);
            setPredecessorId(event.target.value);
            if (previous) setTemplateName(previous.name);
          }}>
            <option value="">{l('إنشاء قالب مستقل','Create a separate template')}</option>
            {matchingTemplates.filter(template => template.data_type === dataType).map(template =>
              <option key={template.id} value={template.id}>{template.name} (v{template.version})</option>)}
          </select>
        </label>
        <Button type="submit" disabled={busy || !templateName.trim()}>
          {predecessorId ? l('حفظ إصدار جديد','Save new version') : l('حفظ القالب','Save template')}
        </Button>
      </form>}
    </div>}
  </section>;
}
