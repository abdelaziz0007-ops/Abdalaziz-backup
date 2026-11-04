-- Background jobs must lose authority when the global account is disabled,
-- even if a tenant membership/grant has not yet been revoked separately.
CREATE OR REPLACE FUNCTION mizan.has_permission(p_tenant uuid,p_entity uuid,p_user uuid,p_code text,p_bank uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM mizan.app_users WHERE id=p_user AND status='active') AND EXISTS(
 SELECT 1 FROM mizan.memberships m JOIN mizan.access_grants g ON g.tenant_id=m.tenant_id AND g.membership_id=m.id
 WHERE m.tenant_id=p_tenant AND m.user_id=p_user AND m.status='active' AND g.permission_code=p_code AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
 AND (g.entity_id IS NULL OR g.entity_id=p_entity) AND (g.bank_account_id IS NULL OR g.bank_account_id=p_bank)
 UNION ALL
 SELECT 1 FROM mizan.memberships m JOIN mizan.membership_roles g ON g.tenant_id=m.tenant_id AND g.membership_id=m.id JOIN mizan.role_permissions rp ON rp.role_code=g.role_code
 WHERE m.tenant_id=p_tenant AND m.user_id=p_user AND m.status='active' AND g.revoked_at IS NULL AND rp.permission_code=p_code
 AND (g.entity_id IS NULL OR g.entity_id=p_entity) AND (g.bank_account_id IS NULL OR g.bank_account_id=p_bank));
$$;
