import {TableInputError} from './tabular-core.mjs';
import {parseDecimal,formatDec} from '../../src/lib/decimal.ts';
const fail=(code,message)=>{throw new TableInputError(code,message);};
const separators=new Set(['.',',',' ']);
export function expandNumericText(text){
 const match=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
 if(!match||!(match[2]||match[3])||text.length>100)fail('INVALID_AMOUNT','Invalid numeric text');
 const sign=match[1]==='-'?'-':'',integer=match[2]||'0',fraction=match[3]||'',exponent=Number(match[4]||0);if(Math.abs(exponent)>100)fail('AMOUNT_RANGE','Numeric exponent is outside the supported range');
 const digits=integer+fraction,position=integer.length+exponent;
 const result=position<=0?'0.'+'0'.repeat(-position)+digits:position>=digits.length?digits+'0'.repeat(position-digits.length):digits.slice(0,position)+'.'+digits.slice(position);
 return sign+result;
}
export function mappedAmount(cell,{decimalSeparator='.',thousandsSeparator=null,precision=2}={}){
 if(!Number.isInteger(precision)||precision<0||precision>8||!['.',','].includes(decimalSeparator)||thousandsSeparator!==null&&(!separators.has(thousandsSeparator)||thousandsSeparator===decimalSeparator))fail('INVALID_AMOUNT_OPTIONS','Choose distinct supported number separators and currency precision');
 let text=cell.text.trim();
 if(cell.kind==='number')text=expandNumericText(text);
 else{
  if(/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(text))fail('TEXT_SCIENTIFIC_AMOUNT','Scientific numeric text requires an explicit numeric source type');
  let sign='';if(/^[+-]/.test(text)){sign=text[0];text=text.slice(1);}const parts=text.split(decimalSeparator);if(parts.length>2||parts.some(p=>!p))fail('INVALID_AMOUNT','Amount separators are inconsistent');
  let integer=parts[0];if(thousandsSeparator&&integer.includes(thousandsSeparator)){const groups=integer.split(thousandsSeparator);if(!/^\d{1,3}$/.test(groups[0])||groups.slice(1).some(g=>!/^\d{3}$/.test(g)))fail('INVALID_AMOUNT_GROUPING','Thousands groups must contain exactly three digits');integer=groups.join('');}
  if(!/^\d+$/.test(integer)||parts[1]!==undefined&&!/^\d+$/.test(parts[1]))fail('INVALID_AMOUNT','Amount contains unselected separators or unsupported characters');text=sign+integer+(parts[1]!==undefined?'.'+parts[1]:'');
 }
 // Removing trailing zeros is exact; no rounding policy is invented here.
 if(text.includes('.'))text=text.replace(/0+$/,'').replace(/\.$/,'');
 try{const value=parseDecimal(text,precision);if(value.units<=-(10n**BigInt(22+precision))||value.units>=10n**BigInt(22+precision))fail('AMOUNT_RANGE','Amount exceeds the database exact-amount range');return formatDec(value,precision);}catch(e){if(e instanceof TableInputError)throw e;fail('AMOUNT_PRECISION','Amount is invalid or exceeds the currency precision');}
}
export function mappedDate(cell,{dateFormat='YYYY-MM-DD',dateSystem='1900'}={}){
 const text=cell.text.trim();let iso;
 if(dateFormat==='excel_serial'){
  if(cell.kind!=='number'||!['1900','1904'].includes(dateSystem))fail('DATE_SYSTEM_REQUIRED','Excel serial dates require a numeric source and explicit workbook date system');
  const expanded=expandNumericText(text);if(!/^\d+(?:\.0+)?$/.test(expanded))fail('INVALID_SERIAL_DATE','Posting dates cannot contain a time fraction or negative serial');const serial=Number(expanded);if(!Number.isSafeInteger(serial)||serial>2958465||dateSystem==='1900'&&(serial<1||serial===60))fail('INVALID_SERIAL_DATE','Invalid or fictitious Excel serial date');
  const origin=dateSystem==='1904'?'1904-01-01':'1899-12-31',days=dateSystem==='1900'&&serial>60?serial-1:serial;iso=new Date(Date.parse(origin+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 }else if(dateFormat==='YYYY-MM-DD'){if(!/^\d{4}-\d{2}-\d{2}$/.test(text))fail('INVALID_DATE','Use the selected YYYY-MM-DD date format');iso=text;}
 else if(['DD/MM/YYYY','MM/DD/YYYY'].includes(dateFormat)){const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(!match)fail('INVALID_DATE','Date does not match the selected format');iso=match[3]+'-'+(dateFormat==='DD/MM/YYYY'?match[2]:match[1])+'-'+(dateFormat==='DD/MM/YYYY'?match[1]:match[2]);}
 else fail('INVALID_DATE_OPTIONS','Select an explicit supported date format');
 const time=Date.parse(iso+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==iso)fail('INVALID_DATE','Date is not a valid calendar day');return iso;
}
const contracts={trial_balance:{accountCode:'text',accountName:'text',closingBalance:'amount'},general_ledger:{journalReference:'text',lineReference:'text',accountCode:'text',postingDate:'date',debit:'amount',credit:'amount'},bank_statement:{rowId:'text',postingDate:'date',signedAmount:'amount'},bank_ledger:{rowId:'text',postingDate:'date',signedAmount:'amount'}};
const optional={trial_balance:{classification:'text',openingBalance:'amount',debitMovement:'amount',creditMovement:'amount'},general_ledger:{description:'text'},bank_statement:{reference:'text',description:'text',runningBalance:'amount'},bank_ledger:{reference:'text',description:'text',runningBalance:'amount'}};
export function previewMapping(table,{sheetName,headerRow,mapping,dataType,numberOptions={},dateFormat='YYYY-MM-DD',requiredHeaders=null}){
 const sheet=table.sheets.find(s=>s.name===sheetName),contract=contracts[dataType];if(!sheet||!contract||!Number.isInteger(headerRow)||headerRow<1||headerRow>100||!mapping||typeof mapping!=='object'||Array.isArray(mapping))fail('INVALID_MAPPING','Choose a worksheet, header row, data type and column mapping');
 const header=sheet.rows.find(r=>r.rowNumber===headerRow);if(!header)fail('HEADER_NOT_PREVIEWED','The selected header row is absent from the bounded preview');
 const fields={...contract,...optional[dataType]},headers=header.cells.map(c=>c.text),normalized=v=>v.normalize('NFKC').trim();
 if(Object.keys(mapping).some(f=>!Object.hasOwn(fields,f)))fail('UNKNOWN_MAPPING_FIELD','The mapping contains an unsupported field');
 for(const name of Object.keys(contract))if(!Object.hasOwn(mapping,name))fail('REQUIRED_MAPPING_FIELD','Required mapping field is missing: '+name);
 const columns=Object.values(mapping);if(columns.some(c=>!Number.isInteger(c)||c<1||c>headers.length)||new Set(columns).size!==columns.length)fail('INVALID_MAPPING_COLUMN','Each field needs a distinct existing one-based source column');
 const expected=Object.entries(mapping).map(([field,column])=>({field,column,header:normalized(headers[column-1])}));
 if(expected.some(v=>!v.header))fail('EMPTY_REQUIRED_HEADER','Mapped columns require nonempty headers');
 if(requiredHeaders!==null){if(!Array.isArray(requiredHeaders))fail('INVALID_TEMPLATE','Template header contract is invalid');for(const old of requiredHeaders){const current=expected.find(v=>v.field===old.field);if(!current||current.column!==old.column||current.header!==old.header)fail('TEMPLATE_COLUMN_DRIFT','Required template columns changed; explicit review is required');}}
 const rows=[],issues=[],duplicates=new Set();
 for(const source of sheet.rows.filter(r=>r.rowNumber>headerRow)){
  const values={},original={};let valid=true;
  for(const [field,column] of Object.entries(mapping)){
   const cell=source.cells[column-1]??{text:'',kind:'blank'};original[field]={column,text:cell.text,sourceType:cell.sourceType??cell.kind};
   if(!cell.text.trim()&&!Object.hasOwn(contract,field)){values[field]=null;continue;}
   try{values[field]=fields[field]==='amount'?mappedAmount(cell,numberOptions):fields[field]==='date'?mappedDate(cell,{dateFormat,dateSystem:table.dateSystem}):cell.text.trim();if(fields[field]==='text'&&(!values[field]||values[field].length>500))fail('INVALID_REQUIRED_TEXT','Mapped text must have 1–500 characters');}
   catch(error){if(!(error instanceof TableInputError))throw error;valid=false;issues.push({rowNumber:source.rowNumber,column,field,severity:'blocking',code:error.code,message:error.message});}
  }
  if(valid&&dataType==='general_ledger'){
   const d=parseDecimal(values.debit,numberOptions.precision??2).units,c=parseDecimal(values.credit,numberOptions.precision??2).units;if(d<0n||c<0n||d!==0n&&c!==0n){valid=false;issues.push({rowNumber:source.rowNumber,severity:'blocking',code:'INVALID_LEDGER_SIDES',message:'Debit and credit must be nonnegative; only one side may be positive'});}
  }
  const identity=dataType==='trial_balance'?values.accountCode:dataType==='general_ledger'?JSON.stringify([values.journalReference,values.lineReference]):values.rowId;
  if(valid&&duplicates.has(identity))issues.push({rowNumber:source.rowNumber,severity:'warning',code:'POSSIBLE_DUPLICATE',message:'Duplicate source identity in preview; no row was removed'});if(valid)duplicates.add(identity);
  rows.push({rowNumber:source.rowNumber,startLine:source.startLine,original,values,valid});
 }
 return {sheetName,headerRow,dataType,requiredHeaders:expected,rows,issues,previewedRows:rows.length,sourceRowCount:sheet.rowCount,completeSourcePreview:sheet.rowCount===sheet.rows.length,readOnly:true,parserVersion:table.parserVersion};
}
