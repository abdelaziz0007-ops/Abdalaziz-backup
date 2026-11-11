import {describe,it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {outputWorkbook,outputPdf} from './output-export-format.mjs';
import {exportRows} from './output-export-contract.mjs';
import {readExportRows} from './output-export-routes.mjs';
const output={id:'output',entity_id:'entity',legal_name:'Mizan Test Entity',output_type:'analysis',start_date:'2026-01-01',end_date:'2026-12-31',currency_code:'BHD',status:'draft',version:2,generatedAt:'2026-11-11T00:00:00.000Z',content_fingerprint:'a'.repeat(64)};
describe('exact output files',()=>{
 it('roundtrips large decimals, formula-like labels, states and metadata through XLSX',async()=>{
  const rows=[{label:'=1+1',value:'9007199254740993.123456',unit:'ratio',state:'available'},{label:'Zero',value:'0.000',unit:'BHD',state:'available'},{label:'Missing',value:null,unit:'ratio',state:'missing',note:'Required denominator missing'},{label:'N/A',value:null,unit:'ratio',state:'not_applicable'}];
  const bytes=await outputWorkbook(output,rows),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
  const sheet=book.getWorksheet('Values');
  expect(sheet.getCell('A2').value).toBe('=1+1');expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  expect(sheet.getCell('B2').value).toBe('9007199254740993.123456');expect(sheet.getCell('B3').value).toBe('0.000');
  expect(sheet.getCell('B4').value).toBe('Unavailable');expect(sheet.getCell('E4').value).toBe('missing');expect(sheet.getCell('B5').value).toBe('Not applicable');
  expect(book.getWorksheet('Version').getCell('B2').value).toBe(output.legal_name);
 },15000);
 it('creates a PDF from the same exact-value contract',async()=>{const bytes=await outputPdf(output,[{label:'Exact ratio',value:'1.234567',unit:'ratio',state:'available'}]);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);});
 it.each([1.25,NaN,undefined,'1e3','=SUM(A1)','1,000'])('rejects inexact or invalid numeric input %s',value=>expect(()=>exportRows([{label:'Test',value,unit:'USD'}])).toThrow());
 it('rejects contradictory state and value',()=>{expect(()=>exportRows([{label:'Test',value:'0',state:'missing',unit:'USD'}])).toThrow();expect(()=>exportRows([{label:'Test',value:null,state:'available',unit:'USD'}])).toThrow();});
 it('rejects unbounded row and explanation input',()=>{expect(()=>exportRows(Array(10001).fill({}))).toThrow();expect(()=>exportRows([{label:'Test',value:'1',unit:'USD',note:'x'.repeat(4001)}])).toThrow();});
 it('reads stored metric strings without reducing precision or losing state',async()=>{
  const saved={label:'Ratio',value:'1.23456789',state:'available',unit:'ratio',note:'A / B'},queries=[];
  const rows=await readExportRows({query:async(sql,args)=>{queries.push({sql,args});return {rows:[saved]};}},'t','e',output);
  expect(rows).toEqual([saved]);expect(queries[0].sql).not.toContain('trunc(');expect(queries[0].args).toEqual(['t','e','output']);
 });
});
