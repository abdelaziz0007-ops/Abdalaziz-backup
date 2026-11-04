import {inflateRawSync,crc32} from 'node:zlib';
import {SaxesParser} from 'saxes';
export class TableInputError extends Error{constructor(code,message){super(message);this.code=code;this.status=422;}}
const fail=(code,message)=>{throw new TableInputError(code,message);};
export const tableLimits=Object.freeze({bytes:50*1024*1024,rows:100000,columns:256,field:65536,previewCharacters:512*1024,zipEntries:10000,expandedBytes:200*1024*1024,compressionRatio:100,sharedStrings:200000,sharedStringBytes:32*1024*1024});
const validText=text=>{if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(text))fail('INVALID_TEXT','Unsupported control or replacement character');return text;};
function utf8(bytes){try{return validText(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(e){if(e instanceof TableInputError)throw e;fail('INVALID_ENCODING','Use valid UTF-8 source text');}}
export function parseCsvTable(bytes,{delimiter=',',previewRows=50}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>tableLimits.bytes)fail('FILE_SIZE_LIMIT','Source size is outside the supported limit');
 if(![',',';','\t'].includes(delimiter)||!Number.isInteger(previewRows)||previewRows<1||previewRows>200)fail('INVALID_PREVIEW_OPTIONS','Select a supported delimiter and preview row limit');
 const text=utf8(bytes).replace(/^\ufeff/,''),rows=[];let values=[],value='',quoted=false,closed=false,rowNumber=1,startLine=1,line=1,count=0,maxColumns=0,hasData=false,previewCharacters=0;
 const cell=()=>{if(value.length>tableLimits.field)fail('FIELD_SIZE_LIMIT','A source field exceeds 64 KiB');if(rows.length<previewRows){previewCharacters+=value.length;if(previewCharacters>tableLimits.previewCharacters)fail('PREVIEW_SIZE_LIMIT','Reduce the preview row count for large text fields');}values.push({text:value,kind:'text'});if(values.length>tableLimits.columns)fail('COLUMN_LIMIT','Source exceeds 256 columns');value='';closed=false;};
 const row=()=>{cell();count++;if(count>tableLimits.rows)fail('ROW_LIMIT','Source exceeds 100000 rows');maxColumns=Math.max(maxColumns,values.length);if(rows.length<previewRows)rows.push({rowNumber,startLine,cells:values});values=[];rowNumber++;startLine=line+1;hasData=false;};
 for(let i=0;i<text.length;i++){
  const ch=text[i];hasData=true;
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;value+='\n';line++;}else value+=ch;}
  else if(ch===delimiter)cell();
  else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;row();line++;}
  else if(ch==='"'){if(value||closed)fail('CSV_QUOTING','Unexpected quote in a source field');quoted=true;}
  else{if(closed)fail('CSV_QUOTING','Unexpected characters after a quoted field');value+=ch;}
  if(value.length>tableLimits.field)fail('FIELD_SIZE_LIMIT','A source field exceeds 64 KiB');
 }
 if(quoted)fail('CSV_QUOTING','Unclosed quoted field');if(hasData||values.length||value||closed)row();
 return {format:'csv',sheets:[{name:'CSV',rowCount:count,columnCount:maxColumns,rows}],dateSystem:null,warnings:[],parserVersion:'tabular-raw-v1'};
}
// Validate the central directory before any archive member is inflated.
export function inspectWorkbookZip(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>tableLimits.bytes)fail('FILE_SIZE_LIMIT','Workbook size is outside the supported limit');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)fail('INVALID_ZIP','ZIP end record is missing');
 const disk=bytes.readUInt16LE(end+4),centralDisk=bytes.readUInt16LE(end+6),diskCount=bytes.readUInt16LE(end+8),count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(disk||centralDisk||diskCount!==count||count===65535||start===0xffffffff||size===0xffffffff||count>tableLimits.zipEntries||start+size!==end)fail('UNSUPPORTED_ZIP','Multi-volume, ZIP64 or excessive archive metadata is unsupported');
 let offset=start,total=0;const names=new Set(),entries=new Map();
 for(let i=0;i<count;i++){
  if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)fail('INVALID_ZIP','Invalid ZIP central directory');
  const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),expanded=bytes.readUInt32LE(offset+24),nameLength=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42),attributes=bytes.readUInt32LE(offset+38);
  if(offset+46+nameLength+extra+comment>end||flags&0x41||![0,8].includes(method)||[compressed,expanded,local].includes(0xffffffff))fail('UNSUPPORTED_ZIP','Encrypted or unsupported archive entry');
  const name=utf8(bytes.subarray(offset+46,offset+46+nameLength));
  if(!name||name.startsWith('/')||name.includes('\\')||name.includes(':')||name.split('/').some(p=>p==='.'||p==='..')||names.has(name)||((attributes>>>16)&0xf000)===0xa000)fail('UNSAFE_ZIP_PATH','Unsafe, duplicate or linked archive path');
  if(/vbaProject|externalLinks\/|embeddings\/|activeX\/|queryTables\/|connections\.xml|webextensions\//i.test(name))fail('ACTIVE_WORKBOOK_CONTENT','Macros, embedded objects and external workbook links are unsupported');
  if(local+30>start||bytes.readUInt32LE(local)!==0x04034b50)fail('INVALID_ZIP','ZIP local entry is invalid');
  const localFlags=bytes.readUInt16LE(local+6),localMethod=bytes.readUInt16LE(local+8),localNameLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),dataStart=local+30+localNameLength+localExtra;
  if(localFlags!==flags||localMethod!==method||dataStart+compressed>start||!bytes.subarray(local+30,local+30+localNameLength).equals(bytes.subarray(offset+46,offset+46+nameLength)))fail('INVALID_ZIP','ZIP local and central entries disagree');
  total+=expanded;if(total>tableLimits.expandedBytes||expanded>Math.max(1,compressed)*tableLimits.compressionRatio)fail('ARCHIVE_EXPANSION_LIMIT','Workbook archive exceeds the expansion limit');
  entries.set(name,{method,compressed,expanded,dataStart,checksum:bytes.readUInt32LE(offset+16)});names.add(name);offset+=46+nameLength+extra+comment;
 }
 if(offset!==end||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml')||!names.has('xl/_rels/workbook.xml.rels'))fail('INVALID_WORKBOOK','Required workbook parts are missing');return {names,entries,expandedBytes:total};
}
function xml(text,handlers){
 validText(text);if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('XML_DTD_FORBIDDEN','XML declarations defining entities are forbidden');
 const parser=new SaxesParser({xmlns:true});parser.on('error',()=>fail('INVALID_XML','Malformed workbook XML'));parser.on('doctype',()=>fail('XML_DTD_FORBIDDEN','XML DTD is forbidden'));
 for(const [name,handler] of Object.entries(handlers))parser.on(name,handler);if(handlers.text)parser.on('cdata',handlers.text);parser.write(text).close();
}
const attribute=(node,name)=>Object.values(node.attributes).find(a=>a.local===name)?.value;
function columnNumber(reference){const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(reference??'');if(!match)fail('INVALID_CELL_REFERENCE','A workbook cell reference is invalid');let column=0;for(const ch of match[1])column=column*26+ch.charCodeAt(0)-64;if(column>tableLimits.columns)fail('COLUMN_LIMIT','Source exceeds 256 columns');return {column,row:Number(match[2])};}
export async function parseXlsxTable(bytes,{previewRows=50}={}){
 if(!Number.isInteger(previewRows)||previewRows<1||previewRows>200)fail('INVALID_PREVIEW_OPTIONS','Select a supported preview row limit');
 const manifest=inspectWorkbookZip(bytes);
 const part=async name=>{
  const entry=manifest.entries.get(name);if(!entry)fail('INVALID_WORKBOOK','A workbook relationship target is missing');
  const compressed=bytes.subarray(entry.dataStart,entry.dataStart+entry.compressed);let value;
  try{value=entry.method===0?compressed:inflateRawSync(compressed,{maxOutputLength:Math.max(1,entry.expanded)});}catch{fail('ARCHIVE_INFLATION_LIMIT','Workbook inflation failed or exceeded its declared bound');}
  if(value.length!==entry.expanded||crc32(value)!==entry.checksum)fail('WORKBOOK_CHECKSUM','Workbook part size or checksum is invalid');return utf8(value);
 };
 const relationships=new Map(),sheets=[];let dateSystem='1900';
 let workbookType=false;xml(await part('[Content_Types].xml'),{opentag:n=>{const type=attribute(n,'ContentType')||'';if(/macroEnabled|vbaProject|oleObject|activeX/i.test(type))fail('ACTIVE_WORKBOOK_CONTENT','Active workbook content is unsupported');if(n.local==='Override'&&attribute(n,'PartName')==='/xl/workbook.xml'&&type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')workbookType=true;}});if(!workbookType)fail('INVALID_WORKBOOK','A standard XLSX workbook content type is required');
 xml(await part('xl/_rels/workbook.xml.rels'),{opentag:n=>{if(n.local==='Relationship'){
  const id=attribute(n,'Id'),target=attribute(n,'Target'),mode=attribute(n,'TargetMode');if(mode==='External'||!target||/^[a-z]+:/i.test(target)||target.includes('..')||target.includes('\\'))fail('EXTERNAL_WORKBOOK_REFERENCE','External or unsafe workbook relationships are forbidden');
  if(!id||relationships.has(id))fail('INVALID_WORKBOOK','Duplicate workbook relationship');relationships.set(id,target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,''));
 }}});
 xml(await part('xl/workbook.xml'),{opentag:n=>{if(n.local==='workbookPr'&&['1','true'].includes(attribute(n,'date1904')))dateSystem='1904';if(n.local==='sheet'){
  const name=attribute(n,'name'),id=attribute(n,'id');if(!name||name.length>100||sheets.some(s=>s.name===name)||sheets.length>=100||!relationships.has(id))fail('INVALID_WORKBOOK','Workbook sheet metadata is invalid');sheets.push({name,path:relationships.get(id)});
 }}});if(!sheets.length)fail('INVALID_WORKBOOK','Workbook has no worksheets');
 const strings=[];let totalStringBytes=0;
 if(manifest.names.has('xl/sharedStrings.xml')){let text='',inText=false;xml(await part('xl/sharedStrings.xml'),{opentag:n=>{if(n.local==='si')text='';if(n.local==='t')inText=true;},text:v=>{if(inText){text+=v;if(text.length>tableLimits.field)fail('FIELD_SIZE_LIMIT','Shared string exceeds the field limit');}},closetag:n=>{if(n.local==='t')inText=false;if(n.local==='si'){strings.push(text);totalStringBytes+=Buffer.byteLength(text);if(strings.length>tableLimits.sharedStrings||totalStringBytes>tableLimits.sharedStringBytes)fail('SHARED_STRING_LIMIT','Workbook shared strings exceed the limit');}}});}
 const result=[];let totalRows=0,previewCharacters=0;const warnings=[];
 for(const sheet of sheets){
  if(!/^xl\/worksheets\/[^/]+\.xml$/.test(sheet.path))fail('INVALID_WORKBOOK','Only standard worksheet parts are supported');
  let currentRow=null,cell=null,tag='',rowCount=0,columnCount=0,lastRow=0;const rows=[];
  xml(await part(sheet.path),{opentag:n=>{
   if(n.local==='row'){const number=attribute(n,'r')===undefined?lastRow+1:Number(attribute(n,'r'));if(!Number.isInteger(number)||number<1||number<=lastRow||number>1048576)fail('INVALID_ROW_REFERENCE','Worksheet rows must have increasing valid references');lastRow=number;currentRow={rowNumber:number,startLine:null,cells:[]};rowCount++;totalRows++;if(totalRows>tableLimits.rows)fail('ROW_LIMIT','Workbook exceeds 100000 rows');}
   if(n.local==='c'){if(!currentRow||cell)fail('INVALID_WORKBOOK','Cell outside a worksheet row');const reference=attribute(n,'r'),ref=reference?columnNumber(reference):{column:currentRow.cells.length+1,row:currentRow.rowNumber};if(ref.column>tableLimits.columns||ref.row!==currentRow.rowNumber||ref.column<=currentRow.cells.length)fail('INVALID_CELL_REFERENCE','Cells must have increasing references in their row');while(currentRow.cells.length<ref.column-1)currentRow.cells.push({text:'',kind:'blank'});cell={column:ref.column,type:attribute(n,'t')||'n',value:'',inline:'',formula:false};}
   if(n.local==='f'&&cell)cell.formula=true;if(cell&&['v','t'].includes(n.local))tag=n.local;
   if(n.local==='hyperlink'&&attribute(n,'id'))fail('EXTERNAL_WORKBOOK_REFERENCE','Linked worksheet content is unsupported');
  },text:value=>{if(cell&&tag){if(tag==='v')cell.value+=value;else cell.inline+=value;if(cell.value.length>tableLimits.field||cell.inline.length>tableLimits.field)fail('FIELD_SIZE_LIMIT','Workbook cell exceeds 64 KiB');}},closetag:n=>{
   if(['v','t'].includes(n.local))tag='';
   if(n.local==='c'){
    if(!cell||!currentRow)fail('INVALID_WORKBOOK','Malformed cell boundary');let text=cell.value,kind=cell.type==='n'?'number':'text';
    if(cell.formula)fail('FORMULA_CELL_FORBIDDEN',`Worksheet ${sheet.name}, row ${currentRow.rowNumber}: export values instead of formulas`);
    if(cell.type==='s'){if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)>=strings.length)fail('INVALID_SHARED_STRING','Invalid shared string index');text=strings[Number(text)];}
    else if(cell.type==='inlineStr')text=cell.inline;
    else if(cell.type==='b'){if(!['0','1'].includes(text))fail('INVALID_CELL_VALUE','Invalid boolean cell');text=text==='1'?'true':'false';kind='boolean';}
    else if(cell.type==='e')fail('WORKBOOK_ERROR_CELL',`Worksheet ${sheet.name}, row ${currentRow.rowNumber}: source contains an error cell`);
    else if(!['n','str','d'].includes(cell.type))fail('UNSUPPORTED_CELL_TYPE','Unsupported workbook cell type');
    if(kind==='number'&&text&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))fail('INVALID_CELL_VALUE','Invalid workbook numeric text');
    if(rows.length<previewRows){previewCharacters+=text.length;if(previewCharacters>tableLimits.previewCharacters)fail('PREVIEW_SIZE_LIMIT','Reduce the preview row count for large text fields');}currentRow.cells.push({text,kind,sourceType:cell.type});columnCount=Math.max(columnCount,cell.column);cell=null;
   }
   if(n.local==='row'){if(rows.length<previewRows)rows.push(currentRow);currentRow=null;}
  }});result.push({name:sheet.name,rowCount,columnCount,rows});
 }
 return {format:'xlsx',sheets:result,dateSystem,warnings,parserVersion:'tabular-raw-v1'};
}
