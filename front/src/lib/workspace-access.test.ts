import {expect,it} from 'vitest';
import {hasWorkspacePermission,hasAnyBankPermission,type WorkspaceAccess} from './workspace-access';
const access:WorkspaceAccess={tenantId:'workspace-a',entityId:'entity-a',permissions:['reports.view'],bankPermissions:[{bank_account_id:'bank-a',code:'outputs.prepare'}]};
it('does not reuse permissions from the previous workspace or entity',()=>{
 expect(hasWorkspacePermission(access,'workspace-b','entity-a','reports.view')).toBe(false);
 expect(hasWorkspacePermission(access,'workspace-a','entity-b','reports.view')).toBe(false);
 expect(hasWorkspacePermission(null,'workspace-a','entity-a','reports.view')).toBe(false);
});
it('keeps bank-specific grants distinct from entity-wide grants',()=>{
 expect(hasWorkspacePermission(access,'workspace-a','entity-a','outputs.prepare')).toBe(false);
 expect(hasWorkspacePermission(access,'workspace-a','entity-a','outputs.prepare','bank-b')).toBe(false);
 expect(hasWorkspacePermission(access,'workspace-a','entity-a','outputs.prepare','bank-a')).toBe(true);
 expect(hasAnyBankPermission(access,'workspace-a','entity-a','outputs.prepare')).toBe(true);
 expect(hasAnyBankPermission(access,'workspace-b','entity-a','outputs.prepare')).toBe(false);
});
