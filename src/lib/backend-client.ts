export class BackendError extends Error {
  constructor(public code:string,message:string,public status:number){super(message);}
}
export async function backend<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/v1'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();
  if(!response.ok)throw new BackendError(result.error?.code??'REQUEST_FAILED',result.error?.message??'Request failed',response.status);
  return result.data as T;
}

export async function backendDownload(path:string,body:unknown,filename:string){
  const response=await fetch('/api/v1'+path,{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  if(!response.ok){
    const {error}=await response.json();
    throw new BackendError(error?.code??'DOWNLOAD_FAILED',error?.message??'Download failed',response.status);
  }
  const url=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
