-- Existing decisions stay append-only. New service decisions carry a request UUID
-- in their evidence; a tenant/entity cannot consume it twice, even across groups.
CREATE UNIQUE INDEX match_decision_request_once
 ON mizan.match_decisions(tenant_id,entity_id,(new_state->>'requestKey'))
 WHERE new_state ? 'requestKey';
