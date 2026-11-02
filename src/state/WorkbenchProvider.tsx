import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useDemo } from './DemoProvider';
import type { Reconciliation } from '@/data/types';
import { defaultRows, type TrialRow } from '@/data/finance';

export interface LocalEvent { id: string; time: string; action: string; actor: string }
export interface ImportRecord { id: string; name: string; count: number; rows: TrialRow[]; published: boolean }
interface Workbench {
  rows: TrialRow[]; custom: boolean; revision: number; imports: ImportRecord[]; events: LocalEvent[];
  rec: Reconciliation | null; setRec: (value: Reconciliation) => void;
  reviewedFingerprint: string | null; setReviewedFingerprint: (value: string | null) => void;
  stage: (name: string, rows: TrialRow[]) => string; publish: (id: string) => void;
  map: (code: string, classification: string) => void; record: (action: string) => void;
}
const Context = createContext<Workbench | null>(null);
interface Snapshot { rows:TrialRow[];custom:boolean;revision:number;imports:ImportRecord[];events:LocalEvent[];rec:Reconciliation|null;reviewedFingerprint:string|null }
function ScopedWorkbench({children,cache,scopeKey}: {children: ReactNode;cache:Map<string,Snapshot>;scopeKey:string}) {
  const { currentPersona, selectedEntityId, selectedPeriodId, scenario, localDatasets, publishDatasets, availablePeriods } = useDemo();
  const imported=localDatasets[selectedPeriodId??''];
  const saved=cache.get(scopeKey);
  const [rows,setRows]=useState(saved?.rows??(selectedEntityId==='ENT-ATLAS'&&scenario!=='emptyEntity'?defaultRows:[])), [custom,setCustom]=useState(saved?.custom??false), [revision,setRevision]=useState(saved?.revision??3);
  const [imports,setImports]=useState<ImportRecord[]>(saved?.imports??[]), [events,setEvents]=useState<LocalEvent[]>(saved?.events??[]), [rec,setRec]=useState<Reconciliation|null>(saved?.rec??null);
  const [reviewedFingerprint,setReviewedFingerprint]=useState<string|null>(saved?.reviewedFingerprint??null);
  useEffect(()=>{if(imported&&imported.entityId===selectedEntityId){setRows(imported.rows);setCustom(true);setRevision(imported.revision);}},[imported,selectedEntityId]);
  useEffect(()=>{cache.set(scopeKey,{rows,custom,revision,imports,events,rec,reviewedFingerprint});},[cache,scopeKey,rows,custom,revision,imports,events,rec,reviewedFingerprint]);
  const record=(action:string) => setEvents(prev=>[{id:crypto.randomUUID(),time:new Date().toISOString(),action,actor:currentPersona?.id??''},...prev]);
  const stage=(name:string,input:TrialRow[])=> { const id=crypto.randomUUID(); setImports(prev=>[{id,name,count:input.length,rows:input,published:false},...prev]); record('CSV preview: '+name); return id; };
  const publish=(id:string)=>{ const item=imports.find(i=>i.id===id); if(!item || item.published || !currentPersona?.permissions.includes('imports.manage')) return; const month=availablePeriods.find(p=>p.id===selectedPeriodId)?.startDate.slice(0,7);if(month&&selectedEntityId)publishDatasets([{entityId:selectedEntityId,period:month,rows:item.rows,sourceFile:item.name}]);setRows(item.rows);setCustom(true);setRevision(r=>r+1);setImports(prev=>prev.map(i=>({...i,published:i.id===id?true:i.published})));record('Published local dataset: '+item.name); };
  const map=(code:string,classification:string)=>{if(!currentPersona?.permissions.includes('mapping.edit'))return;const next=rows.map(r=>r.accountCode===code?{...r,classification}:r);const month=availablePeriods.find(p=>p.id===selectedPeriodId)?.startDate.slice(0,7);if(month&&selectedEntityId)publishDatasets([{entityId:selectedEntityId,period:month,rows:next,sourceFile:next[0]?.sourceFile??'mapping'}]);setRows(next);setCustom(true);setRevision(r=>r+1);record('Account mapping: '+code+' → '+classification);};
  return <Context.Provider value={{rows,custom,revision,imports,events,rec,setRec,reviewedFingerprint,setReviewedFingerprint,stage,publish,map,record}}>{children}</Context.Provider>;
}
export function WorkbenchProvider({children}:{children:ReactNode}) {
  const d=useDemo();
  const cache=useRef(new Map<string,Snapshot>());
  const scopeKey=[d.selectedEntityId,d.selectedPeriodId,d.scenario,d.repoGeneration].join(':');
  // Financial input and decisions never cross entity, period, identity or scenario boundaries.
  return <ScopedWorkbench key={scopeKey} scopeKey={scopeKey} cache={cache.current}>{children}</ScopedWorkbench>;
}
export function useWorkbench(){const ctx=useContext(Context);if(!ctx)throw new Error('WorkbenchProvider required');return ctx;}
