// Retired: parsing source content before malware scanning violates the import gate.
export function rejectDirectImport(_req,res){
 return res.status(410).json({error:{code:'SCANNED_IMPORT_REQUIRED',message:'Upload through Sources, wait for a clean scan, review the isolated preview, then publish the dataset.'}});
}
