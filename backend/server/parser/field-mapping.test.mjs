import {it,expect} from 'vitest';
import {parseCsvTable} from './tabular-core.mjs';
import {mappedAmount,mappedDate,expandNumericText,previewMapping} from './field-mapping.mjs';
const text=value=>({text:value,kind:'text'}),number=value=>({text:value,kind:'number'});
it('normalizes explicitly selected number separators while preserving exact large values',()=>{
 expect(mappedAmount(text('9.007.199.254.740.993,001'),{decimalSeparator:',',thousandsSeparator:'.',precision:3})).toBe('9007199254740993.001');
 expect(mappedAmount(text('-1,234.5000'),{decimalSeparator:'.',thousandsSeparator:',',precision:2})).toBe('-1234.50');
 expect(mappedAmount(number('1.25E+4'),{decimalSeparator:',',thousandsSeparator:'.',precision:0})).toBe('12500');
 expect(expandNumericText('1.230000000000000000004E-2')).toBe('0.01230000000000000000004');
});
it('rejects ambiguous grouping, unselected separators, excess precision and invented rounding',()=>{
 for(const value of ['1,23.45','1 234.56','1.234,56'])expect(()=>mappedAmount(text(value),{decimalSeparator:'.',thousandsSeparator:','})).toThrow();
 expect(()=>mappedAmount(text('1.001'),{precision:2})).toThrow(/precision/);expect(()=>mappedAmount(text('1e3'))).toThrow();expect(()=>mappedAmount(number('1e101'))).toThrow();expect(()=>mappedAmount(text('10000000000000000000000'),{precision:2})).toThrow(/range/);
});
it('uses explicit date interpretation and validates calendar days without local timezone conversion',()=>{
 expect(mappedDate(text('03/04/2026'),{dateFormat:'DD/MM/YYYY'})).toBe('2026-04-03');expect(mappedDate(text('03/04/2026'),{dateFormat:'MM/DD/YYYY'})).toBe('2026-03-04');expect(mappedDate(text('2026-01-31'))).toBe('2026-01-31');
 for(const value of ['2026-02-29','2026-02-30','2026-01-31T10:00:00Z'])expect(()=>mappedDate(text(value))).toThrow();
});
it('handles both Excel date systems and rejects the fictitious leap day or hidden time fractions',()=>{
 expect(mappedDate(number('1'),{dateFormat:'excel_serial',dateSystem:'1900'})).toBe('1900-01-01');expect(mappedDate(number('59'),{dateFormat:'excel_serial',dateSystem:'1900'})).toBe('1900-02-28');expect(mappedDate(number('61'),{dateFormat:'excel_serial',dateSystem:'1900'})).toBe('1900-03-01');expect(mappedDate(number('0'),{dateFormat:'excel_serial',dateSystem:'1904'})).toBe('1904-01-01');
 for(const value of ['60','10.5','-1'])expect(()=>mappedDate(number(value),{dateFormat:'excel_serial',dateSystem:'1900'})).toThrow();expect(()=>mappedDate(text('45000'),{dateFormat:'excel_serial',dateSystem:'1900'})).toThrow();
});
const options={sheetName:'CSV',headerRow:1,dataType:'trial_balance',mapping:{accountCode:1,accountName:2,closingBalance:3},numberOptions:{precision:2}};
it('retains original fields and source coordinates while returning row-specific blocking errors',()=>{
 const value=previewMapping(parseCsvTable(Buffer.from('code,name,balance\n100,Bank,"1,234.50"\n200,Equity,1.001\n100,Repeated,10\n')),options);
 expect(value.rows[0]).toMatchObject({rowNumber:2,original:{closingBalance:{column:3,text:'1,234.50'}},valid:false});
 expect(value.issues).toEqual(expect.arrayContaining([expect.objectContaining({rowNumber:2,field:'closingBalance',severity:'blocking'}),expect.objectContaining({rowNumber:3,code:'AMOUNT_PRECISION'})]));expect(value.rows).toHaveLength(3);expect(value.readOnly).toBe(true);
});
it('detects required template column drift without silently searching for moved columns',()=>{
 const first=previewMapping(parseCsvTable(Buffer.from('code,name,balance\n100,Bank,1\n')),options),next=parseCsvTable(Buffer.from('name,code,balance\nBank,100,1\n'));
 expect(()=>previewMapping(next,{...options,requiredHeaders:first.requiredHeaders})).toThrow(/review/);
 expect(()=>previewMapping(next,{...options,mapping:{accountCode:2,accountName:1,closingBalance:3},requiredHeaders:first.requiredHeaders})).toThrow(/review/);
 const extra=parseCsvTable(Buffer.from('code,name,balance,note\n100,Bank,1,extra\n'));expect(previewMapping(extra,{...options,requiredHeaders:first.requiredHeaders}).rows[0].valid).toBe(true);
});
it('warns about duplicated identities without removing rows and rejects invalid ledger sides',()=>{
 const duplicated=previewMapping(parseCsvTable(Buffer.from('code,name,balance\n100,Bank,1\n100,Repeat,2\n')),options);expect(duplicated.rows).toHaveLength(2);expect(duplicated.issues[0]).toMatchObject({code:'POSSIBLE_DUPLICATE',severity:'warning'});
 const ledger=previewMapping(parseCsvTable(Buffer.from('journal,line,account,date,debit,credit\nJ1,L1,100,2026-01-02,10,10\n')),{sheetName:'CSV',headerRow:1,dataType:'general_ledger',mapping:{journalReference:1,lineReference:2,accountCode:3,postingDate:4,debit:5,credit:6}});expect(ledger.rows[0].valid).toBe(false);expect(ledger.issues[0].code).toBe('INVALID_LEDGER_SIDES');
});
