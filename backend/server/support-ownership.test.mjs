import {describe,it,expect} from 'vitest';
import {supportSchemas} from './support-routes.mjs';
import {ownershipSchemas} from './ownership-routes.mjs';
const common={reason:'Authorized investigation',requestKey:'14fce912-4de2-4b98-a534-c8ef45678615'};
describe('support authorization boundaries',()=>{
 it.each([0,25,1.5,-1])('rejects invalid grant duration %s',hours=>expect(supportSchemas.grant.safeParse({...common,email:'operator@example.org',hours}).success).toBe(false));
 it('rejects attempts to inject permissions',()=>expect(supportSchemas.grant.safeParse({...common,email:'operator@example.org',hours:1,permission_codes:['imports.manage']}).success).toBe(false));
 it('requires an access purpose',()=>expect(supportSchemas.read.safeParse({reason:' '}).success).toBe(false));
 it('does not accept an arbitrary ticket state',()=>expect(supportSchemas.transition.safeParse({...common,status:'deleted'}).success).toBe(false));
});
describe('ownership consent',()=>{
 it.each([false,undefined,'true'])('rejects missing or nonliteral consent %s',administrationConsent=>expect(ownershipSchemas.accept.safeParse({...common,administrationConsent}).success).toBe(false));
 it('accepts explicit consent with an audit reason',()=>expect(ownershipSchemas.accept.safeParse({...common,administrationConsent:true}).success).toBe(true));
 it('rejects caller supplied owner identifiers',()=>expect(ownershipSchemas.propose.safeParse({...common,email:'member@example.org',ownerId:common.requestKey}).success).toBe(false));
});
