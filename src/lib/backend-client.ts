export class BackendError extends Error {
  constructor(public code:string,message:string,public status:number){super(message);}
}
export async function backend<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/v1'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();
  if(!response.ok)throw new BackendError(result.error?.code??'REQUEST_FAILED',result.error?.message??'Request failed',response.status);
  return result.data as T;
}
