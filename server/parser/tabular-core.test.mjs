import {it,expect} from 'vitest';
import JSZip from 'jszip';
import {parseCsvTable,parseXlsxTable,inspectWorkbookZip,tableLimits} from './tabular-core.mjs';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
async function workbook(sheet,{parts={},properties='',relationships=''}={}){
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');zip.file('xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${properties}<sheets><sheet name="الأرصدة" sheetId="1" r:id="rId1"/></sheets></workbook>`);zip.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>${relationships}</Relationships>`);zip.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${sheet}</sheetData></worksheet>`);for(const [name,value] of Object.entries(parts))zip.file(name,value);return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
it('previews CSV delimiters, multiline quoting and source line coordinates without rounding originals',()=>{
 const table=parseCsvTable(Buffer.from('\ufeffcode;name;amount\r\nA;"وصف\r\nمتعدد";9007199254740993.001\r\nB;"escaped ""text""";-0.01\r\n'),{delimiter:';'}),rows=table.sheets[0].rows;
 expect(rows[1]).toMatchObject({rowNumber:2,startLine:2});expect(rows[2].startLine).toBe(4);expect(rows[1].cells.map(c=>c.text)).toEqual(['A','وصف\nمتعدد','9007199254740993.001']);expect(rows[2].cells[1].text).toBe('escaped "text"');expect(table.sheets[0].rowCount).toBe(3);
});
it('counts rows beyond the preview and retains blank/trailing fields without phantom final rows',()=>{
 const table=parseCsvTable(Buffer.from('a,b,\n\nx,y,\n'),{previewRows:1});expect(table.sheets[0].rowCount).toBe(3);expect(table.sheets[0].rows).toHaveLength(1);expect(table.sheets[0].rows[0].cells.map(c=>c.text)).toEqual(['a','b','']);
});
it('rejects malformed quoting, invalid UTF-8, excessive fields/columns and unsupported options',()=>{
 for(const value of ['a,"unclosed','a,"closed"x','a,un"quoted'])expect(()=>parseCsvTable(Buffer.from(value))).toThrow();
 expect(()=>parseCsvTable(Buffer.from([255]))).toThrow();expect(()=>parseCsvTable(Buffer.from('x'.repeat(tableLimits.field+1)))).toThrow();expect(()=>parseCsvTable(Buffer.from(Array(257).fill('x').join(',')))).toThrow();expect(()=>parseCsvTable(Buffer.from('x'),{delimiter:'|'})).toThrow();
});
it('reads raw numeric/scientific XML text, shared/inline strings and sparse source coordinates',async()=>{
 const bytes=await workbook('<row r="3"><c r="A3" t="s"><v>0</v></c><c r="C3"><v>9007199254740993.001</v></c><c r="D3"><v>1.2500000000000000001E-3</v></c><c r="E3" t="inlineStr"><is><t><![CDATA[نص <محفوظ>]]></t></is></c></row>',{parts:{'xl/sharedStrings.xml':`<sst xmlns="${ns}"><si><r><t>اسم</t></r><r><t> الحساب</t></r></si></sst>`},properties:'<workbookPr date1904="1"/>'});
 const value=await parseXlsxTable(bytes);expect(value.dateSystem).toBe('1904');expect(value.sheets[0].name).toBe('الأرصدة');expect(value.sheets[0].rows[0].rowNumber).toBe(3);expect(value.sheets[0].rows[0].cells.map(c=>c.text)).toEqual(['اسم الحساب','','9007199254740993.001','1.2500000000000000001E-3','نص <محفوظ>']);
});
it('rejects formulas and workbook errors even outside the returned preview',async()=>{
 for(const cell of ['<c r="A2"><f>1+1</f><v>2</v></c>','<c r="A2" t="e"><v>#DIV/0!</v></c>'])await expect(parseXlsxTable(await workbook('<row r="1"><c r="A1"><v>1</v></c></row><row r="2">'+cell+'</row>'),{previewRows:1})).rejects.toHaveProperty('code',cell.includes('<f>')?'FORMULA_CELL_FORBIDDEN':'WORKBOOK_ERROR_CELL');
});
it('rejects active workbook parts, external links and DTD-defined entities',async()=>{
 for(const parts of [{'xl/vbaProject.bin':'x'},{'xl/externalLinks/externalLink1.xml':'x'},{'xl/embeddings/object.bin':'x'}])await expect(parseXlsxTable(await workbook('',{parts}))).rejects.toHaveProperty('code','ACTIVE_WORKBOOK_CONTENT');
 await expect(parseXlsxTable(await workbook('',{relationships:'<Relationship Id="outside" Target="https://example.invalid/" TargetMode="External"/>'}))).rejects.toHaveProperty('code','EXTERNAL_WORKBOOK_REFERENCE');
 await expect(parseXlsxTable(await workbook('',{parts:{'xl/sharedStrings.xml':'<!DOCTYPE sst [<!ENTITY a "x">]><sst/>'}}))).rejects.toHaveProperty('code','XML_DTD_FORBIDDEN');
});
it('verifies ZIP paths, checksums and declared inflation bounds before accepting workbook contents',async()=>{
 const bytes=await workbook('<row r="1"><c r="A1"><v>1</v></c></row>'),manifest=inspectWorkbookZip(bytes);expect(manifest.names.has('xl/workbook.xml')).toBe(true);
 const corrupt=Buffer.from(bytes),entry=manifest.entries.get('xl/workbook.xml');corrupt[entry.dataStart+1]^=0xff;await expect(parseXlsxTable(corrupt)).rejects.toBeInstanceOf(Error);
 const zip=new JSZip();zip.file('../traversal.xml','x');for(const [name] of manifest.entries)zip.file(name,'x');expect(()=>inspectWorkbookZip(Buffer.from('PKfake'))).toThrow();
 const unsafe=await zip.generateAsync({type:'nodebuffer'});expect(()=>inspectWorkbookZip(unsafe)).toThrow(/path/i);
 const bomb=await workbook('',{parts:{'xl/oversized.xml':'a'.repeat(100000)}});expect(()=>inspectWorkbookZip(bomb)).toThrow(/expansion/i);
});
it('bounds actual inflation when central-directory sizes lie and caps preview text',async()=>{
 const bytes=await workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>bounded content</t></is></c></row>'),copy=Buffer.from(bytes),end=copy.length-22,start=copy.readUInt32LE(end+16);let offset=start;
 while(offset<end){const length=copy.readUInt16LE(offset+28),name=copy.subarray(offset+46,offset+46+length).toString();if(name==='xl/worksheets/sheet1.xml'){copy.writeUInt32LE(1,offset+24);break;}offset+=46+length+copy.readUInt16LE(offset+30)+copy.readUInt16LE(offset+32);}
 await expect(parseXlsxTable(copy)).rejects.toHaveProperty('code','ARCHIVE_INFLATION_LIMIT');
 const text=Array(10).fill('x'.repeat(60000)).join('\n');expect(()=>parseCsvTable(Buffer.from(text))).toThrow(/preview/);expect(parseCsvTable(Buffer.from(text),{previewRows:2}).sheets[0].rowCount).toBe(10);
});
