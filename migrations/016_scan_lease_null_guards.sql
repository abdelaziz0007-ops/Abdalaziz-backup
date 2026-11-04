-- Explicit NULL checks prevent SQL three-valued logic from weakening lease fencing.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('mizan_private.finish_scan_job(uuid,text,text,text,text)'::regprocedure) INTO definition;
 definition=replace(definition,'IF lease.job_id IS NULL OR lease.token_hash<>',
  'IF p_token IS NULL OR p_token!~''^[0-9a-f]{64}$'' OR lease.job_id IS NULL OR lease.token_hash<>');
 definition=replace(definition,'IF p_outcome NOT IN (', 'IF p_outcome IS NULL OR p_outcome NOT IN (');
 EXECUTE definition;
 SELECT pg_get_functiondef('mizan_private.claim_scan_job(text)'::regprocedure) INTO definition;
 definition=replace(definition,'IF length(p_worker) NOT BETWEEN', 'IF p_worker IS NULL OR length(p_worker) NOT BETWEEN');
 EXECUTE definition;
END $$;
