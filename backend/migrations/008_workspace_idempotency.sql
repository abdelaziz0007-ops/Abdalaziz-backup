CREATE TABLE mizan_private.workspace_requests (
 user_id uuid NOT NULL REFERENCES mizan.app_users(id),idempotency_key uuid NOT NULL,request_hash text NOT NULL,
 tenant_id uuid NOT NULL REFERENCES mizan.tenants(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,idempotency_key)
);
CREATE FUNCTION mizan_private.create_workspace_once(p_user uuid,p_session uuid,p_name text,p_region text,p_consent boolean,p_request uuid,p_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous mizan_private.workspace_requests; hash text; tenant uuid;
BEGIN
 hash=encode(sha256(convert_to(jsonb_build_array(trim(p_name),p_region,p_consent)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_key::text,67));
 SELECT * INTO previous FROM mizan_private.workspace_requests WHERE user_id=p_user AND idempotency_key=p_key;
 IF FOUND THEN
  IF previous.request_hash<>hash THEN RAISE EXCEPTION 'Idempotency key was used for different input' USING ERRCODE='23514';END IF;
  RETURN previous.tenant_id;
 END IF;
 tenant=mizan_private.create_workspace(p_user,p_session,p_name,p_region,p_consent,p_request);
 INSERT INTO mizan_private.workspace_requests(user_id,idempotency_key,request_hash,tenant_id) VALUES(p_user,p_key,hash,tenant);
 RETURN tenant;
END $$;
REVOKE ALL ON mizan_private.workspace_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION mizan_private.create_workspace_once(uuid,uuid,text,text,boolean,uuid,uuid) FROM PUBLIC;
