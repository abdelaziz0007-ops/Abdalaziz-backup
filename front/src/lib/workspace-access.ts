export interface WorkspaceAccess {tenantId:string;entityId:string|null;permissions:string[];bankPermissions:{bank_account_id:string;code:string}[]}
export function hasWorkspacePermission(access:WorkspaceAccess|null,tenant:string,entity:string,permission:string,bankId?:string){
 if(!access||access.tenantId!==tenant||access.entityId!==entity)return false;
 return access.permissions.includes(permission)||Boolean(bankId&&access.bankPermissions.some(value=>value.bank_account_id===bankId&&value.code===permission));
}
export function hasAnyBankPermission(access:WorkspaceAccess|null,tenant:string,entity:string,permission:string){
 return hasWorkspacePermission(access,tenant,entity,permission)||Boolean(access?.tenantId===tenant&&access.entityId===entity&&access.bankPermissions.some(value=>value.code===permission));
}
