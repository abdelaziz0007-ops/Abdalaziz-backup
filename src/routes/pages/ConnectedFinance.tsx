import { useEffect,useRef,useState } from 'react';
import { backend } from '@/lib/backend-client';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Notice,Panel,useLanguage } from '@/components/WorkspaceUI';
import { FinancialComparison } from './FinancialComparison';

interface Period {id:string;start_date:string;end_date:string;status:string}
interface ReportSummary {id:string;output_type:string;version:number;status:string;currency_code:string;period_id:string}
interface Dataset {id:string;period_id:string;currency_code:string;version:number;status:string;account_count:number}
interface SourceValues {accountCode:string;name:string;classification:string;signedDebitBalance:string}
interface Source {id:string;row_number:number;original_values:SourceValues|null;effective_values?:SourceValues|null;contribution:string;original_name:string;sha256:string;scan_status:string}
interface FinancialSignal {ruleVersion:string;ruleCode:string;metricId:string;observedValue:string;threshold:string;unit:string;triggered:boolean}
interface Report extends ReportSummary {start_date:string;end_date:string;comparable:boolean;lines:{id:string;code:string;value:string;value_state:string}[];metrics:{id:string;name:string;unit:string;expression:string;value:string|null;unavailable_reason:string|null;input_references?:{totals?:Record<string,string>}}[];signals:FinancialSignal[];validations:{code:string;passed:boolean;message:string}[]}
const explanations:Record<string,{text:[string,string];inputs:string[]}>={
  negative_gross_margin:{text:['تكلفة الإيرادات تتجاوز الإيرادات المسجّلة.','Cost of revenue exceeds recorded revenue.'],inputs:['revenue','cost']},
  negative_net_margin:{text:['نتيجة الفترة خسارة صافية.','The period recorded a net loss.'],inputs:['revenue','net_profit']},
  current_ratio_below_one:{text:['الأصول المتداولة أقل من الالتزامات المتداولة بحسب النسبة المعروضة.','Current assets are lower than current liabilities, based on the displayed ratio.'],inputs:['current_assets','current_liabilities']},
};
const labels:Record<string,[string,string]>={income_statement:['قائمة الدخل','Income statement'],financial_position:['المركز المالي','Financial position'],analysis:['التحليل المالي','Financial analysis'],revenue:['الإيرادات','Revenue'],cost:['تكلفة الإيرادات','Cost of revenue'],gross_profit:['مجمل الربح','Gross profit'],operating_expenses:['المصروفات التشغيلية','Operating expenses'],tax:['الضريبة','Tax'],net_profit:['صافي الربح','Net profit'],assets:['الأصول','Assets'],liabilities:['الالتزامات','Liabilities'],equity:['حقوق الملكية شاملة نتيجة الفترة','Equity including period earnings'],current_assets:['الأصول المتداولة','Current assets'],current_liabilities:['الالتزامات المتداولة','Current liabilities'],working_capital:['رأس المال العامل','Working capital']};
const sample='accountCode,name,classification,signedDebitBalance\n1000,Cash,asset.current,1000\n3000,Capital,equity,-1000\n';
export const financialLabels=labels;
export function ConnectedFinance({tenant,entity,periods,onSaved}:{tenant:string;entity:string;periods:Period[];onSaved:()=>void}){
  const l=useLanguage(),label=(key:string)=>labels[key]?l(...labels[key]):key;
  const [period,setPeriod]=useState(''),[csv,setCsv]=useState(''),[name,setName]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reports,setReports]=useState<ReportSummary[]>([]),[selected,setSelected]=useState(''),[report,setReport]=useState<Report|null>(null),[sources,setSources]=useState<Source[]>([]),[sourceTitle,setSourceTitle]=useState(''),[revision,setRevision]=useState(0);
  const [datasets,setDatasets]=useState<Dataset[]>([]),[datasetId,setDatasetId]=useState(''),[basisConfirmed,setBasisConfirmed]=useState(false);
  const generation=useRef(0),fileGeneration=useRef(0),selectionGeneration=useRef(0),sourceGeneration=useRef(0);
  const base=`/tenants/${tenant}/entities/${entity}`;
  useEffect(()=>{generation.current++;fileGeneration.current++;selectionGeneration.current++;sourceGeneration.current++;setCsv('');setName('');setConfirmed(false);setError('');setMessage('');setReports([]);setSelected('');setReport(null);setSources([]);setPeriod('');setDatasets([]);setDatasetId('');setBasisConfirmed(false);setBusy(false);},[tenant,entity]);
  useEffect(()=>{setPeriod(old=>periods.some(p=>p.id===old)?old:periods.find(p=>p.status==='open')?.id??'');},[periods]);
  useEffect(()=>{let active=true;backend<ReportSummary[]>(base+'/reports').then(values=>{if(active)setReports(values);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[base,revision]);
  useEffect(()=>{
    let active=true;
    backend<Dataset[]>(base+'/datasets?status=published').then(values=>{
      if(active)setDatasets(values.filter(dataset=>dataset.status==='published'));
    }).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[base,revision,periods]);
  useEffect(()=>{const token=++selectionGeneration.current;sourceGeneration.current++;setReport(null);setSources([]);if(!selected)return;backend<Report>(base+'/reports/'+selected).then(value=>{if(token===selectionGeneration.current)setReport(value);}).catch(e=>{if(token===selectionGeneration.current)setError(e.message);});},[base,selected,revision]);
  async function upload(file:File|undefined){const token=++fileGeneration.current;setCsv('');setName('');setConfirmed(false);setError('');if(!file)return;if(file.size>512*1024||!file.name.toLowerCase().endsWith('.csv')){setError(l('اختر ملف CSV لا يتجاوز 512 كيلوبايت.','Choose a CSV file up to 512 KiB.'));return;}try{const value=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(token!==fileGeneration.current)return;setCsv(value);setName(file.name);}catch{if(token===fileGeneration.current)setError(l('تعذرت قراءة الملف بترميز UTF-8.','The file must use UTF-8 encoding.'));}}
  async function save(){const token=generation.current;setBusy(true);setError('');setMessage('');try{const value=await backend<{datasetId:string;reused:boolean;outputs:{id:string;output_type:string}[]}>(base+'/imports/trial-balance',{periodId:period,fileName:name,csv,basis:'period',confirmation:confirmed});if(token!==generation.current)return;setSelected(value.outputs.find(o=>o.output_type==='income_statement')?.id??'');setRevision(v=>v+1);setMessage(value.reused?l('هذا المصدر محفوظ سابقًا لهذه الفترة؛ لم تُنشأ نسخة مكررة.','This source is already saved for this period; no duplicate was created.'):l('حُفظ المصدر ومجموعة البيانات وثلاث مسودات نتائج.','Source, dataset and three draft outputs saved.'));onSaved();}catch(e){if(token===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(token===generation.current)setBusy(false);}}
  async function generateReports(){
    const token=generation.current;
    setBusy(true);setError('');setMessage('');
    try{
      const value=await backend<{reused:boolean;outputs:{id:string;output_type:string}[]}>(
        base+'/datasets/'+datasetId+'/reports',{confirmation:basisConfirmed});
      if(token!==generation.current)return;
      setSelected(value.outputs.find(output=>output.output_type==='income_statement')?.id??'');
      setRevision(previous=>previous+1);
      setMessage(value.reused?l('عُرضت النتائج المحفوظة لهذا الميزان.','Loaded the existing outputs for this trial balance.')
        :l('حُفظت مسودات قائمة الدخل والمركز المالي والتحليل للمراجعة المستقلة.','Income statement, financial position and analysis drafts are ready for independent review.'));
      onSaved();
    }catch(e){if(token===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(token===generation.current)setBusy(false);}
  }
  async function showSources(lineId:string,title:string){const token=++sourceGeneration.current;setSources([]);setSourceTitle(title);try{const values=await backend<Source[]>(base+`/reports/${selected}/lines/${lineId}/sources`);if(token===sourceGeneration.current)setSources(values);}catch(e){if(token===sourceGeneration.current)setError(e instanceof Error?e.message:String(e));}}
  function template(){const url=URL.createObjectURL(new Blob([sample],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='trial-balance-template.csv';a.click();URL.revokeObjectURL(url);}
  const available=datasets.filter(dataset=>periods.some(p=>p.id===dataset.period_id&&p.status==='open'));
  return <div className="stack">
    <Panel title={l('التقارير من ميزان مراجعة منشور','Reports from a published trial balance')}>
      {error&&<p role="alert" className="notice danger">{error}</p>}{message&&<p role="status" className="notice success">{message}</p>}
      <p>{l('اختر إصدارًا منشورًا لإنشاء قائمة الدخل والمركز المالي والتحليل للفترة. يتطلب الإنشاء تحققًا حديثًا بخطوتين.','Select a published version to create period income, financial position and analysis drafts. Generation requires recent two-step verification.')}</p>
      <label className="form-field">{l('ميزان المراجعة المنشور','Published trial balance')}
        <select value={datasetId} disabled={busy||!available.length} onChange={e=>{setDatasetId(e.target.value);setBasisConfirmed(false);}}>
          <option value="">{available.length?l('اختر إصدار الميزان','Select a trial balance version'):l('لا يوجد ميزان منشور لفترة مفتوحة','No published trial balance for an open period')}</option>
          {available.map(dataset=>{
            const selectedPeriod=periods.find(p=>p.id===dataset.period_id);
            return <option key={dataset.id} value={dataset.id}>{selectedPeriod?.start_date} — {selectedPeriod?.end_date} · v{dataset.version} · {dataset.currency_code} · {dataset.account_count} {l('حساب','accounts')}</option>;
          })}
        </select>
      </label>
      <label className="row"><input type="checkbox" checked={basisConfirmed} disabled={busy||!datasetId} onChange={e=>setBasisConfirmed(e.target.checked)}/>
        {l('أؤكد أن الدخل والمصروفات تخص هذه الفترة وأن حقوق الملكية لا تشمل نتيجة الفترة.','I confirm that income and expenses cover this period and equity excludes these period earnings.')}
      </label>
      <Button variant="primary" disabled={busy||!basisConfirmed||!available.some(dataset=>dataset.id===datasetId)} onClick={()=>void generateReports()}>{l('إنشاء مسودات التقارير','Generate draft reports')}</Button>
    </Panel>
    <Panel title={l('الاستيراد المباشر للمسودات','Direct draft import')}>
      <Notice tone="warning">{l('تبقى مصادر هذا المسار في الحجر إلى حين فحصها ومراجعة اكتمالها.','Sources in this workflow remain quarantined pending scanning and completeness review.')}</Notice>
      <div className="form-grid"><label className="form-field">{l('فترة الاستيراد','Import period')}<select value={period} disabled={busy} onChange={e=>{setPeriod(e.target.value);setConfirmed(false);}}><option value="">{l('اختر فترة مفتوحة','Select an open period')}</option>{periods.filter(p=>p.status==='open').map(p=><option key={p.id} value={p.id}>{p.start_date} — {p.end_date}</option>)}</select></label><label className="form-field">{l('ميزان المراجعة CSV','Trial balance CSV')}<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/></label></div>
      <p>{l('حتى 1000 حساب. الرصيد بإشارة المدين: المدين موجب والدائن سالب. يجب أن يتوازن المجموع، وأن تطابق الكسور دقة عملة المنشأة.','Up to 1000 accounts. Debit balances are positive and credits negative. The total must balance and decimals must match the entity currency.')}</p>
      <p dir="ltr" style={{overflowWrap:'anywhere'}}>asset.current · asset.noncurrent · asset.contra · liability.current · liability.noncurrent · equity · income · expense.cost · expense.operating · expense.tax</p>
      <label className="row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{l('أؤكد تصنيف الحسابات، وأن أرصدة الدخل والمصروف تخص الفترة المختارة فقط، ولا تتضمن حقوق الملكية نتيجة الفترة مرة أخرى.','I confirm the classifications, that income and expenses cover only the selected period, and that equity excludes those period earnings to avoid double counting.')}</label>
      <div className="row"><Button onClick={template}>{l('تنزيل القالب','Download template')}</Button><Button variant="primary" disabled={busy||!period||!csv||!confirmed} onClick={()=>void save()}>{busy?l('جارٍ الحفظ والحساب…','Saving and calculating…'):l('حفظ وحساب المسودات','Save and calculate drafts')}</Button></div>
    </Panel>
    <Panel title={l('النتائج المحفوظة','Saved outputs')}><label className="form-field">{l('اختر إصدارًا محفوظًا','Select a saved version')}<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{l('اختر نتيجة','Select output')}</option>{reports.map(r=><option key={r.id} value={r.id}>{label(r.output_type)} · {periods.find(p=>p.id===r.period_id)?.start_date} · v{r.version} · {r.currency_code} · {r.status}</option>)}</select></label>
      {report&&<div className="stack"><h3>{label(report.output_type)} · {report.status==='approved_locked'?l('معتمد ومقفل','Approved and locked'):report.status==='draft'?l('مسودة','Draft'):report.status} · <bdi>{report.currency_code} | {report.start_date} — {report.end_date}</bdi></h3>
        {report.status!=='approved_locked'&&<Notice tone="warning">{l('يظل الإصدار قيد المراجعة حتى اعتماده بشكل مستقل. راجع تفاصيل التحقق أدناه.','This version requires independent approval. See the validation details below.')}</Notice>}
        {report.lines.length>0&&<DataTable label={l('بنود القوائم','Statement lines')} rows={report.lines} rowKey={r=>r.id} columns={[{key:'name',header:l('البند','Line'),render:r=>label(r.code)},{key:'value',header:report.currency_code,render:r=><bdi>{r.value}</bdi>},{key:'source',header:l('الدليل','Evidence'),render:r=><Button onClick={()=>void showSources(r.id,label(r.code))}>{l('صفوف المصدر','Source rows')}</Button>}]}/>}
        {report.metrics.length>0&&<DataTable label={l('المؤشرات المحسوبة','Calculated metrics')} rows={report.metrics} rowKey={r=>r.id} columns={[{key:'name',header:l('المؤشر','Metric'),render:r=><span id={`metric-${r.id}`} tabIndex={-1}>{r.name}</span>},{key:'value',header:l('القيمة','Value'),render:r=><bdi>{r.value===null?l('غير متاح','Unavailable'):r.value+(r.unit==='percent'?'%':'')}</bdi>},{key:'formula',header:l('المعادلة والحدود','Formula and limits'),render:r=><><bdi>{r.expression}</bdi>{r.unavailable_reason&&<p>{r.unavailable_reason}</p>}</>}]}/>}
        {report.output_type==='analysis'&&<section className="stack">
          <h4>{l('نتائج قواعد التحليل','Analysis rule results')}</h4>
          <p>{l('تقارن القواعد المؤشرات المحفوظة بحدودها الحسابية. يشير التنبيه إلى نتيجة تستحق المراجعة، وتحديد سببها يتطلب فحصًا مستقلًا.','Rules compare saved metrics against arithmetic thresholds. A flag identifies a point for review. Establishing its cause requires further investigation.')}</p>
          {report.signals.length===0&&<p>{l('لا تتوفر مؤشرات كافية لتقييم هذه القواعد.','The metrics needed to evaluate these rules are unavailable.')}</p>}
          <ul className="stack">{report.signals.map(signal=>{
            const metric=report.metrics.find(item=>item.id===signal.metricId);
            const suffix=signal.unit==='percent'?'%':'';
            const explanation=explanations[signal.ruleCode];
            const totals=metric?.input_references?.totals;
            return <li key={signal.ruleCode}>
              <Button onClick={()=>document.getElementById(`metric-${signal.metricId}`)?.focus()}>{metric?.name??signal.ruleCode}</Button>
              <p><bdi>{signal.observedValue}{suffix}</bdi> · {l('شرط التنبيه أقل من','Alert threshold below')} <bdi>{signal.threshold}{suffix}</bdi></p>
              <p>{signal.triggered?l(...(explanation?.text??['تحقق شرط التنبيه.','The alert condition was met.'])):l('لم يتحقق شرط التنبيه.','The alert condition was not met.')}</p>
              {totals&&explanation&&<dl>{explanation.inputs.filter(key=>totals[key]!==undefined).map(key=>
                <div key={key}><dt>{label(key)}</dt><dd><bdi>{totals[key]} {report.currency_code}</bdi></dd></div>,
              )}</dl>}
              <small><bdi>{signal.ruleVersion} · {signal.ruleCode}</bdi></small>
            </li>;
          })}</ul>
        </section>}
        <details><summary>{l('تفاصيل التحقق','Validation details')}</summary><ul>{report.validations.map(v=><li key={v.code}>{v.passed?'✓':'!'} <bdi>{v.code}: {v.message}</bdi></li>)}</ul></details>
      </div>}
    </Panel>
    {report?.comparable&&<FinancialComparison key={report.id+':'+revision} base={base} reportId={report.id} label={label}/>}
    {sources.length>0&&<Panel title={`${l('مصادر البند','Line sources')}: ${sourceTitle}`}><DataTable label={l('أدلة المصدر','Source evidence')} rows={sources} rowKey={r=>r.id} columns={[{key:'row',header:l('الصف','Row'),render:r=>r.row_number},{key:'account',header:l('الحساب','Account'),render:r=>{const account=r.effective_values??r.original_values;return account?`${account.accountCode} · ${account.name}`:'—';}},{key:'amount',header:l('الرصيد الأصلي','Original balance'),render:r=><bdi>{r.original_values?.signedDebitBalance??'—'}</bdi>},{key:'effective',header:l('الرصيد بعد التصحيح','Corrected balance'),render:r=><bdi>{r.effective_values?.signedDebitBalance??'—'}</bdi>},{key:'contribution',header:l('المساهمة في البند','Line contribution'),render:r=><bdi>{r.contribution}</bdi>},{key:'source',header:l('المصدر','Source'),render:r=><span style={{overflowWrap:'anywhere'}}>{r.original_name}<br/><bdi>{r.sha256}</bdi><br/>{r.scan_status==='clean'?l('اجتاز الفحص','Scan passed'):r.scan_status==='quarantined'?l('في الحجر','Quarantined'):r.scan_status}</span>}]}/></Panel>}
  </div>;
}
