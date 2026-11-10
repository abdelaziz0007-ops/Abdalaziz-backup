CREATE OR REPLACE FUNCTION mizan_private.workspace_context(p_user uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; entities jsonb;
BEGIN
 SELECT m.id INTO member FROM mizan.memberships m JOIN mizan.app_users u ON u.id=m.user_id JOIN mizan.tenants t ON t.id=m.tenant_id
 WHERE m.user_id=p_user AND m.tenant_id=p_tenant AND m.status='active' AND u.status='active' AND t.status='active';
 IF member IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(e.id),'[]'::jsonb) INTO entities FROM mizan.legal_entities e WHERE e.tenant_id=p_tenant AND e.status='active' AND (
 EXISTS(SELECT 1 FROM mizan.access_grants g WHERE g.tenant_id=p_tenant AND g.membership_id=member AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()) AND (g.entity_id IS NULL OR g.entity_id=e.id) AND g.permission_code IN ('entities.manage','members.manage','reports.view','imports.manage','outputs.prepare','outputs.approve','privacy.manage','support.authorize'))
 OR EXISTS(SELECT 1 FROM mizan.membership_roles r JOIN mizan.role_permissions rp ON rp.role_code=r.role_code WHERE r.tenant_id=p_tenant AND r.membership_id=member AND r.revoked_at IS NULL AND (r.entity_id IS NULL OR r.entity_id=e.id) AND rp.permission_code IN ('entities.manage','members.manage','reports.view','imports.manage','outputs.prepare','outputs.approve','privacy.manage','support.authorize')));
 RETURN jsonb_build_object('membershipId',member,'entityIds',entities);
END $$;
