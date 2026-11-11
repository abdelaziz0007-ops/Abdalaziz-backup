// Export amounts are strings, never binary floating-point values or spreadsheet formulas.
export function exportRows(rows){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('Unsupported export row count');
 return rows.map(row=>{
  if(!row||typeof row.label!=='string'||row.label.length>500||typeof row.unit!=='string'||row.unit.length>80||row.note!=null&&(typeof row.note!=='string'||row.note.length>4000))throw Error('Invalid export row');
  const state=row.state??(row.value===null?'missing':'available');
  if(!['available','missing','not_applicable'].includes(state))throw Error('Invalid value state');
  if(state==='available'){
   if(typeof row.value!=='string'||row.value.length>80||!(/^-?\d+(\.\d+)?$/).test(row.value))throw Error('Exact decimal text required');
  }else if(row.value!==null)throw Error('Unavailable values must be null');
  return {...row,state};
 });
}
export function exportValue(row){
 return row.state==='not_applicable'?'Not applicable':row.value===null?'Unavailable':row.value;
}
