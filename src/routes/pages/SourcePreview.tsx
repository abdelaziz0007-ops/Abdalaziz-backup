import {useState} from 'react';
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
  completeSourcePreview: boolean;
  issues: {rowNumber: number; field?: string; code: string; severity: string; message: string}[];
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

export function SourcePreview({path, name, csv, periods}: {path: string; name: string; csv: boolean; periods: Period[]}) {
  const l = useLanguage();
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [mapped, setMapped] = useState<{preview: MappingPreview; currencyCode: string} | null>(null);
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
  const sheet = workbook?.sheets.find(item => item.name === sheetName);
  const header = sheet?.rows.find(row => row.rowNumber === headerRow);
  const fields = [...required[dataType], ...optional[dataType]];
  const label = (field: string) => labels[field] ? l(...labels[field]) : field;

  function showError(reason: unknown) {
    if (reason instanceof BackendError && reason.code === 'PREVIEW_RUNTIME_UNAVAILABLE') {
      setError(l('خدمة المعاينة المعزولة غير متاحة حاليًا.', 'The isolated preview service is currently unavailable.'));
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
  async function mapRows() {
    setBusy(true); setError(''); setMapped(null);
    try {
      const columns = Object.fromEntries(Object.entries(mapping).filter(([, column]) => column > 0));
      setMapped(await backend(path, {delimiter, previewRows, mapping: {
        periodId, sheetName, headerRow, dataType, mapping: columns,
        decimalSeparator, thousandsSeparator: thousandsSeparator || null, dateFormat,
      }}));
    } catch (reason) { showError(reason); } finally { setBusy(false); }
  }

  return <section className="stack" aria-label={l('معاينة المصدر','Source preview')}>
    <h4>{l('معاينة المصدر', 'Source preview')} · {name}</h4>
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
          <label className="form-field">{l('الفترة المالية','Accounting period')}
            <select required value={periodId} onChange={event => setPeriodId(event.target.value)}>
              <option value="">{l('اختر الفترة','Choose period')}</option>
              {periods.map(period => <option key={period.id} value={period.id}>{period.start_date} – {period.end_date} (v{period.version})</option>)}
            </select>
          </label>
          <label className="form-field">{l('نوع البيانات','Data type')}
            <select value={dataType} onChange={event => {setDataType(event.target.value as keyof typeof required); setMapping({});}}>
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
          ...fields.filter(field=>mapping[field]).map(field=>({key:field,header:label(field),render:(row:MappedRow)=>row.values[field]??'—'}))]}/>
      {mapped.preview.issues.length > 0 && <ul>{mapped.preview.issues.map((issue, index) => <li key={index}>
        {l('الصف','Row')} {issue.rowNumber} · {issue.field && <>{label(issue.field)} · </>}
        {issue.severity==='blocking'?l('خطأ','Error'):l('تحذير','Warning')} · {issue.message}
      </li>)}</ul>}
    </div>}
  </section>;
}
