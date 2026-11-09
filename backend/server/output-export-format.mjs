import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const captions={
  income_statement:'Income statement',financial_position:'Statement of financial position',
  analysis:'Financial analysis',reconciliation:'Bank reconciliation',
};
const colors={ink:'183248',muted:'465A69',accent:'087868',wash:'EEF6F4'};

function metadata(output){
  return [
    ['Entity ID',output.entity_id],
    ['Reporting period',output.start_date+' to '+output.end_date],
    ['Currency',output.currency_code],
    ['Status',output.status==='approved_locked'?'Approved and locked':output.status.replaceAll('_',' ')],
    ['Version',String(output.version)],
    ['Generated at (UTC)',output.generatedAt],
    ['Output ID',output.id],
    ['Version fingerprint',output.content_fingerprint],
  ];
}

export async function outputWorkbook(output,rows){
  const book=new ExcelJS.Workbook();
  book.creator='Mizan Financial Workspace';
  book.created=new Date(output.generatedAt);
  const info=book.addWorksheet('Version');
  info.columns=[{width:26},{width:76}];
  info.addRows([['Report',captions[output.output_type]],['Legal entity',output.legal_name],...metadata(output)]);
  const sheet=book.addWorksheet('Values',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[{header:'Line or metric',width:40},{header:'Exact value',width:34},{header:'Unit',width:14},{header:'Explanation',width:68}];
  sheet.addRows(rows.map(row=>[row.label,row.value??'Unavailable',row.unit,row.note??'']));
  sheet.getColumn(2).numFmt='@';
  sheet.getColumn(2).alignment={horizontal:'right'};
  sheet.getColumn(4).alignment={wrapText:true,vertical:'top'};
  for(const tab of [info,sheet]){
    tab.getRow(1).height=24;
    tab.getRow(1).eachCell(cell=>{
      cell.font={bold:true,color:{argb:'FFFFFFFF'}};
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+colors.ink}};
    });
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function outputPdf(output,rows){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:44,info:{Title:captions[output.output_type],Author:'Mizan Financial Workspace'}});
    const chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));
    doc.on('error',reject);
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    const left=44,width=doc.page.width-88,right=left+width;
    doc.fillColor('#'+colors.accent).font('Helvetica-Bold').fontSize(10).text('MIZAN  /  FINANCIAL WORKSPACE');
    doc.moveDown(.65).fillColor('#'+colors.ink).fontSize(22).text(captions[output.output_type]);
    doc.moveDown(.6).font('Helvetica').fontSize(9);
    for(const [label,value] of metadata(output))doc.text(label+'  '+value);
    doc.moveDown(1);
    function columns(){
      const y=doc.y;
      doc.rect(left,y,width,22).fill('#'+colors.wash);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#'+colors.ink);
      doc.text('Line or metric',left+8,y+6,{width:290});
      doc.text('Exact value / unit',right-188,y+6,{width:180,align:'right'});
      doc.y=y+25;
    }
    columns();
    for(const row of rows){
      doc.font('Helvetica').fontSize(10);
      const display=(row.value??'Unavailable')+(row.value!==null&&row.unit?' '+row.unit:'');
      const detailHeight=row.note?doc.fontSize(8).heightOfString(row.note,{width:width-16})+7:0;
      const height=22+detailHeight;
      if(doc.y+height>doc.page.height-48){doc.addPage();columns();}
      const y=doc.y;
      doc.fillColor('#'+colors.ink).fontSize(10).text(row.label,left+8,y+4,{width:300});
      doc.font('Courier').text(display,right-202,y+4,{width:194,align:'right'});
      if(row.note)doc.font('Helvetica').fontSize(8).fillColor('#'+colors.muted).text(row.note,left+8,y+20,{width:width-16});
      doc.moveTo(left,y+height).lineTo(right,y+height).strokeColor('#DCE5E6').stroke();
      doc.y=y+height+4;
    }
    doc.end();
  });
}
