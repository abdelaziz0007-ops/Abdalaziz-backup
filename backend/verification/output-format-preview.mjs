import {outputPdf} from '../server/output-export-format.mjs';
import {writeFile} from 'node:fs/promises';
const output={id:'01234567-0123-4123-8123-012345678901',entity_id:'11234567-0123-4123-8123-012345678901',legal_name:'Example Manufacturing and Trading Company Limited',output_type:'analysis',start_date:'2026-01-01',end_date:'2026-12-31',currency_code:'BHD',status:'draft',version:2,generatedAt:'2026-11-11T00:00:00.000Z',content_fingerprint:'a'.repeat(64)};
const rows=Array.from({length:16},(_,i)=>({label:'Metric '+(i+1)+': Long explanatory label that wraps onto multiple lines for accurate review of stored financial figures.',value:i===2?null:'9007199254740993.123456789012345678901234567890',unit:'ratio',state:i===2?'not_applicable':'available',note:'This figure is preserved from the selected saved version. It is not a causal conclusion. Supporting data must be reviewed independently. '.repeat(2)}));
await writeFile(process.argv[2],await outputPdf(output,rows));
