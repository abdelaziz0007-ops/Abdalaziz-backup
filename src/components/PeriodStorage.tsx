import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/state/DemoProvider';
import { useWorkbench } from '@/state/WorkbenchProvider';
import { usePlanning, type PlanningState } from '@/state/PlanningProvider';
import { periodKey, type PeriodDataset } from '@/data/analytics';
import { Button } from '@/components/ui/Button';
import { Dialog, Notice, Icon, useLanguage } from './WorkspaceUI';

interface SavedSnapshot {
  version:1; entityId:string;period:string;scenario:string;
  datasets:Omit<PeriodDataset,'revision'|'importedAt'>[];
  planning:PlanningState;
}
interface SnapshotItem {id:string;period:string;created_at:string}
export function PeriodStorage(){
  const d=useDemo(), w=useWorkbench(), plan=usePlanning(), l=useLanguage();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false);
  const [items,setItems]=useState<SnapshotItem[]>([]),[message,setMessage]=useState(''),[error,setError]=useState('');
  const csrf=useRef('');
  const scope=`entityId=${encodeURIComponent(d.selectedEntityId??'')}&scenario=${encodeURIComponent(d.scenario)}`;
  const period=d.availablePeriods.find(p=>p.id===d.selectedPeriodId),month=period?.startDate.slice(0,7);
  const canEdit=Boolean(d.currentPersona?.permissions.includes('imports.manage')&&d.selectedEntityId&&d.currentPersona.scopedEntityIds.includes(d.selectedEntityId));
  const canSave=canEdit&&month&&w.rows.length&&(w.custom||(d.selectedEntityId==='ENT-ATLAS'&&month==='2026-10'));
  async function request(path:string,init:RequestInit={}){
    const response=await fetch(path,{...init,headers:{'Content-Type':'application/json','X-Mizan-CSRF':csrf.current,...init.headers}});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error??`HTTP ${response.status}`);
    return result;
  }
  useEffect(()=>{
    if(!open)return;
    let active=true;setConnected(false);setItems([]);setError('');setMessage('');setBusy(true);
    (async()=>{try{
      const response=await fetch('/api/storage/status');const status=await response.json();
      if(!response.ok)throw new Error(response.status===503?l('أرشيف العرض التجريبي غير مفعّل. لحفظ البيانات الفعلية، افتح مساحة العمل المتصلة وسجّل الدخول.','The demonstration archive is disabled. Open the connected workspace and sign in to save real data.'):status.error);
      if(!active)return;csrf.current=status.csrf;setConnected(true);
      const saved=await request('/api/snapshots?'+scope);if(active)setItems(saved);
    }catch(e){if(active)setError(e instanceof Error?e.message:String(e));}finally{if(active)setBusy(false);}})();
    return()=>{active=false;};
  },[open,scope]);
  async function save(){
    if(!canSave||!d.selectedEntityId||!month)return;
    setBusy(true);setError('');setMessage('');
    try{
      const datasets=Object.values(d.localDatasets).filter(data=>data.entityId===d.selectedEntityId&&data.period!==month).map(({entityId,period,rows,sourceFile})=>({entityId,period,rows,sourceFile}));
      datasets.push({entityId:d.selectedEntityId,period:month,rows:w.rows,sourceFile:w.rows[0]?.sourceFile??'trial-balance'});
      const {budget,trade,tradeAsOf,assumptions,supplemental,notes,owners}=plan;
      const payload:SavedSnapshot={version:1,entityId:d.selectedEntityId,period:month,scenario:d.scenario,datasets,planning:{budget,trade,tradeAsOf,assumptions,supplemental,notes,owners}};
      await request('/api/snapshots',{method:'POST',body:JSON.stringify(payload)});
      setItems(await request('/api/snapshots?'+scope));setMessage(l('حُفظت نسخة جديدة في Postgres.','A new snapshot was saved in Postgres.'));
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function restore(id:string){
    if(!canEdit)return;
    setBusy(true);setError('');setMessage('');
    try{
      const payload:SavedSnapshot=await request(`/api/snapshots/${id}?${scope}`);
      if(payload.entityId!==d.selectedEntityId||payload.scenario!==d.scenario)throw new Error('Saved scope mismatch');
      const restoredPeriod=periodKey(payload.entityId,payload.period);
      d.publishDatasets(payload.datasets);plan.restore(payload.planning,restoredPeriod);d.selectPeriod(restoredPeriod);
      w.record('Restored Postgres financial snapshot: '+id);
      setMessage(l('استُرجعت بيانات التحليل والقوائم والتخطيط.','Analysis, statements and planning data restored.'));
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <><button className="icon-button" aria-label={l('الحفظ والاسترجاع','Save & restore')} title={l('الحفظ والاسترجاع','Save & restore')} onClick={()=>setOpen(true)}><Icon name="file"/></button>{open&&<Dialog title={l('الحفظ في قاعدة البيانات','Database storage')} onClose={()=>setOpen(false)}>
    <p>{l('احفظ نسخة من ميزان المراجعة والفترات المستوردة والموازنة والذمم وافتراضات وملاحظات الفترة. الاسترجاع يستبدل هذه المدخلات في الجلسة الحالية.','Save trial balances, imported periods, budget, trade items, and period assumptions and notes. Restoring replaces these inputs in the current session.')}</p>
    <Notice>{l('الحفظ يدوي. المطابقات البنكية وقرارات الاعتماد وسجل الجلسة لا تشملها هذه النسخة. الخادم محلي لمستخدم واحد؛ الأدوار المعروضة تجريبية.','Saving is manual. Bank matches, approvals and session history are excluded. This is a local single-operator server; displayed roles are demonstrations.')}</Notice>
    <p role="status">{connected?l('أرشيف العرض التجريبي متصل','Demonstration archive connected'):busy?l('التحقق من الاتصال…','Checking connection…'):l('أرشيف العرض التجريبي غير متاح','Demonstration archive unavailable')}</p>
    {!connected&&!busy&&<a href="#/workspace">{l('فتح مساحة العمل المتصلة','Open connected workspace')}</a>}
    {error&&<Notice tone="danger">{error}</Notice>}{message&&<p role="status">{message}</p>}
    <Button onClick={save} disabled={!connected||busy||!canSave}>{l('حفظ نسخة جديدة','Save new snapshot')}</Button>
    {!canSave&&<p>{l('اختر فترة بميزان كامل وبصلاحية إدخال البيانات للحفظ.','Select a period with a full trial balance and import permission to save.')}</p>}
    <h3>{l('النسخ المحفوظة — آخر 30 نسخة','Saved snapshots — latest 30')}</h3>
    {!items.length&&!busy&&<p>{l('لا توجد نسخ محفوظة لهذه المنشأة والسيناريو.','No saved snapshots for this entity and scenario.')}</p>}
    <ul>{items.map(item=><li key={item.id}><bdi>{item.period} · {new Date(item.created_at).toLocaleString()}</bdi> <Button variant="ghost" disabled={busy||!canEdit} onClick={()=>restore(item.id)}>{l('استرجاع','Restore')}</Button></li>)}</ul>
    <p className="small muted">{l('الاسترجاع يفتح فترة النسخة. كل عملية حفظ تنشئ نسخة مستقلة.','Restoring opens the saved period. Each save creates an independent snapshot.')}</p>
  </Dialog>}</>;
}
