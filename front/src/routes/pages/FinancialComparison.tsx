import {useEffect,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {DataTable} from '@/components/ui/DataTable';
import {Notice,Panel,useLanguage} from '@/components/WorkspaceUI';

interface Version {id:string;version:number;status:string;start_date:string;end_date:string;currency_code:string}
interface Comparison {
  current:Version;
  baseline:Version;
  lines:{code:string;current:string|null;baseline:string|null;variance:string|null;percent:string|null;unavailableReason:string|null}[];
}

export function FinancialComparison({base,reportId,label}:{base:string;reportId:string;label:(code:string)=>string}){
  const l=useLanguage(),path=base+'/reports/'+reportId+'/comparisons';
  const [versions,setVersions]=useState<Version[]|null>(null),[selected,setSelected]=useState('');
  const [comparison,setComparison]=useState<Comparison|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    backend<Version[]>(path).then(data=>{if(active)setVersions(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[path]);
  useEffect(()=>{
    if(!selected)return;
    let active=true;
    backend<Comparison>(path+'?baselineId='+selected).then(data=>{if(active)setComparison(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[path,selected]);
  const versionLabel=(version:Version)=>{
    const status=version.status==='approved_locked'?l('معتمد','Approved'):version.status==='draft'?l('مسودة','Draft'):version.status;
    return `${version.start_date} — ${version.end_date} · v${version.version} · ${status}`;
  };
  return <Panel title={l('مقارنة مع فترة سابقة','Compare with an earlier period')}>
    {error&&<Notice tone="danger">{error}</Notice>}
    {!versions&&!error&&<p role="status">{l('جارٍ تحميل الفترات المقارنة…','Loading comparable periods…')}</p>}
    {versions?.length===0&&<p>{l('لا توجد قائمة محفوظة لفترة سابقة مماثلة في المدة والعملة والإعدادات.','No saved statement matches the period length, currency and settings.')}</p>}
    {!!versions?.length&&<label className="form-field">{l('إصدار الفترة المقارنة','Comparative version')}
      <select value={selected} onChange={e=>{setComparison(null);setError('');setSelected(e.target.value);}}>
        <option value="">{l('اختر إصدارًا','Select a version')}</option>
        {versions.map(version=><option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
      </select>
    </label>}
    {selected&&!comparison&&!error&&<p role="status">{l('جارٍ حساب الفروقات…','Calculating variances…')}</p>}
    {comparison&&<>
      <p>{l('الفترة الحالية','Current period')} <bdi>{versionLabel(comparison.current)}</bdi></p>
      <p>{l('الفترة المقارنة','Comparative period')} <bdi>{versionLabel(comparison.baseline)}</bdi></p>
      <Notice>{l('المقارنة داخل المنشأة نفسها وبعملة وإعدادات ومدة متماثلة. الفرق يساوي الحالي ناقص المقارن. النسبة تقسم الفرق على القيمة المطلقة لرصيد المقارنة، وتكون غير متاحة إذا كان رصيد الأساس صفرًا. تُستخدم التصنيفات كما حُفظت في كل إصدار.','The versions share the same entity, currency, settings and duration. Variance is current minus comparative. The percentage uses the absolute comparative value and is unavailable for a zero base. Each version uses its saved classifications.')}</Notice>
      <DataTable label={l('فروقات القوائم المالية','Statement variances')} rows={comparison.lines} rowKey={row=>row.code} columns={[
        {key:'line',header:l('البند','Line'),render:row=>label(row.code)},
        {key:'current',header:l('الحالي','Current'),render:row=><bdi>{row.current??'—'}</bdi>},
        {key:'baseline',header:l('المقارن','Comparative'),render:row=><bdi>{row.baseline??'—'}</bdi>},
        {key:'variance',header:`${l('الفرق','Variance')} · ${comparison.current.currency_code}`,render:row=><bdi>{row.variance??'—'}</bdi>},
        {key:'percent',header:l('نسبة الفرق','Variance %'),render:row=>row.percent===null
          ?l('غير متاح','Unavailable'):<bdi>{row.percent}%</bdi>},
      ]}/>
    </>}
  </Panel>;
}
