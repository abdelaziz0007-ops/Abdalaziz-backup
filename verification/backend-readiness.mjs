import {readFile,writeFile} from 'node:fs/promises';
const srs=await readFile('SRS-FIN-001-EN.md','utf8');
const requirements=[...srs.matchAll(/^\| (FR-\d{3}) \| (.*?) \| ([MS]) \| (.*?) \|$/gm)].map(([,id,title,stage,acceptance])=>({id,title,stage,acceptance}));
const nonFunctional=[...srs.matchAll(/^\| (NFR-\d{3}) \| (.*?) \| (.*?) \|$/gm)].map(([,id,title,acceptance])=>({id,title,acceptance}));
const dataRules=[...srs.matchAll(/^- \*\*(DR-\d{3}):\*\* (.+)$/gm)].map(([,id,acceptance])=>({id,acceptance}));
if(requirements.length!==45)throw Error('Expected all 45 functional SRS requirements');
let matrix;try{matrix=JSON.parse(await readFile('docs/backend-requirements.json','utf8'));}catch{
 const partial=new Set(['FR-001','FR-002','FR-003','FR-004','FR-005','FR-006','FR-007','FR-008','FR-009','FR-010','FR-011','FR-012','FR-015','FR-016','FR-018','FR-019','FR-025','FR-026','FR-027','FR-028','FR-030','FR-031','FR-040']);
 matrix={scope:'All M and S requirements, explicitly requested by the project owner',externalConfiguration:'No email, payment, hosting, malware scan, OCR or AI provider has been selected yet. Provider activation is not represented by a mock passing.',requirements:requirements.map(r=>({...r,status:partial.has(r.id)?'partial':'pending',evidence:[],remaining:'Acceptance must be exercised against the completed backend; schema existence alone is not completion.'}))};
 await writeFile('docs/backend-requirements.json',JSON.stringify(matrix,null,2)+'\n');
}
if(!matrix.nonFunctional||!matrix.dataRules){matrix.nonFunctional=nonFunctional.map(r=>({...r,status:'pending',evidence:[],remaining:'Requires measured operational acceptance, not a configuration claim.'}));matrix.dataRules=dataRules.map(r=>({...r,status:'partial',evidence:[],remaining:'Recheck across every completed workflow before final acceptance.'}));await writeFile('docs/backend-requirements.json',JSON.stringify(matrix,null,2)+'\n');}
for(const [source,records] of [[requirements,matrix.requirements],[nonFunctional,matrix.nonFunctional],[dataRules,matrix.dataRules]])for(const r of source){const record=records.find(x=>x.id===r.id);if(!record)throw Error('Missing requirement '+r.id);if(record.status==='verified'&&(!record.evidence?.length||record.remaining))throw Error('Verified requirement needs evidence and no unfinished work: '+r.id);}
const counts={};for(const r of matrix.requirements)counts[r.status]=(counts[r.status]??0)+1;
console.log(JSON.stringify({scope:matrix.scope,functionalRequirements:45,nonFunctionalRequirements:nonFunctional.length,dataRules:dataRules.length,status:counts,externalConfiguration:matrix.externalConfiguration},null,2));
if(process.argv.includes('--release')&&[...matrix.requirements,...matrix.nonFunctional,...matrix.dataRules].some(r=>r.status!=='verified')){console.error('Release readiness is NOT met: unfinished SRS acceptance requirements remain.');process.exitCode=1;}
