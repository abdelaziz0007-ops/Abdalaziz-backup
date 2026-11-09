export class BackendError extends Error {
  constructor(public code:string,message:string,public status:number,public requestId?:string){super(message);this.name='BackendError';}
}
const messages:Record<string,[string,string]>={
 AUTHENTICATION_REQUIRED:['انتهت الجلسة. سجّل الدخول من جديد.','Your session expired. Sign in again.'],
 MFA_REQUIRED:['أكّد رمز المصادقة للمتابعة.','Verify your authenticator code to continue.'],
 PERMISSION_DENIED:['ليس لديك صلاحية لهذا الإجراء.','You do not have permission for this action.'],
 BACKEND_NOT_CONFIGURED:['خدمة الحسابات غير مهيأة بعد.','Account services are not configured yet.'],
 SOURCE_STORAGE_UNAVAILABLE:['تخزين الملفات غير متاح حالياً.','File storage is currently unavailable.'],
 PREVIEW_RUNTIME_UNAVAILABLE:['معالجة الملفات المعزولة غير متاحة حالياً.','Isolated file processing is currently unavailable.'],
 DATABASE_UNAVAILABLE:['الاتصال بقاعدة البيانات غير متاح مؤقتاً.','Database temporarily unavailable.'],
 NETWORK_ERROR:['تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.','Unable to reach the server. Check your connection and retry.'],
 REQUEST_TIMEOUT:['انتهت مهلة الطلب. حدّث البيانات قبل إعادة إجراء الحفظ.','The request timed out. Refresh the data before retrying a save.'],
 INVALID_RESPONSE:['استجابة الخادم غير صالحة. حاول مجدداً لاحقاً.','The server returned an invalid response. Try again later.'],
 EMAIL_VERIFICATION_REQUIRED:['أكّد بريدك الإلكتروني قبل المتابعة.','Verify your email before continuing.'],
};
function failure(code:string,message:string,status:number,requestId?:string){
 const translated=messages[code];const error=new BackendError(code,translated?translated[document.documentElement.lang==='ar'?0:1]:message,status,requestId);
 if(status===401||code==='MFA_REQUIRED'||code==='EMAIL_VERIFICATION_REQUIRED')window.dispatchEvent(new CustomEvent('mizan:backend-error',{detail:error}));
 return error;
}
async function request(path:string,body?:unknown){
 let response:Response;
 try{response=await fetch('/api/v1'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
 catch(error){throw failure(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'REQUEST_TIMEOUT':'NETWORK_ERROR','Unable to reach the server',0);}
 if(!response.ok){
  const payload=await response.json().catch(()=>null);
  throw failure(payload?.error?.code??'REQUEST_FAILED',payload?.error?.message??('Request failed ('+response.status+')'),response.status,payload?.requestId??response.headers.get('X-Request-ID')??undefined);
 }
 return response;
}
export async function backend<T>(path:string,body?:unknown):Promise<T>{
 const response=await request(path,body);
 const result=await response.json().catch(()=>{throw failure('INVALID_RESPONSE','Invalid server response',response.status);});
 if(!result||!Object.prototype.hasOwnProperty.call(result,'data'))throw failure('INVALID_RESPONSE','Invalid server response',response.status);
 return result.data as T;
}
export async function backendDownload(path:string,body:unknown,filename:string){
 const response=await request(path,body);
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
 link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function backendUpload<T>(path:string,file:File):Promise<T>{
 let response:Response;
 try{response=await fetch('/api/v1'+path,{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/octet-stream','X-Upload-Name':encodeURIComponent(file.name)},body:file});}
 catch(error){throw failure(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'REQUEST_TIMEOUT':'NETWORK_ERROR','Upload failed',0);}
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw failure(result?.error?.code??'UPLOAD_FAILED',result?.error?.message??'Upload failed',response.status,result?.requestId);
 if(!result||!Object.prototype.hasOwnProperty.call(result,'data'))throw failure('INVALID_RESPONSE','Invalid upload response',response.status);
 return result.data as T;
}
