# Applied database catalog

Read-only introspection of the 107 SRS business tables, including refinements from migrations 003–005. No customer records or credentials are included. See DATABASE-SRS.md for behavior, RLS and remaining service work.

## currencies

| Column | Type | Required | Default |
|---|---|---|---|
| code | text | Yes | `—` |
| name | text | Yes | `—` |
| minor_units | smallint | Yes | `—` |

Constraints:

- **currencies_code_check**: `CHECK (code ~ '^[A-Z]{3}$'::text)`
- **currencies_code_not_null**: `NOT NULL code`
- **currencies_minor_units_check**: `CHECK (minor_units >= 0 AND minor_units <= 8)`
- **currencies_minor_units_not_null**: `NOT NULL minor_units`
- **currencies_name_not_null**: `NOT NULL name`
- **currencies_pkey**: `PRIMARY KEY (code)`

Triggers:

None.

## app_users

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| created_at | timestamp with time zone | Yes | `now()` |
| identity_provider | text | Yes | `—` |
| provider_subject | text | Yes | `—` |
| email | text | Yes | `—` |
| display_name | text | Yes | `—` |
| mfa_enabled | boolean | Yes | `false` |
| status | text | Yes | `'active'::text` |
| last_authenticated_at | timestamp with time zone | No | `—` |

Constraints:

- **app_users_created_at_not_null**: `NOT NULL created_at`
- **app_users_display_name_not_null**: `NOT NULL display_name`
- **app_users_email_not_null**: `NOT NULL email`
- **app_users_id_not_null**: `NOT NULL id`
- **app_users_identity_provider_not_null**: `NOT NULL identity_provider`
- **app_users_identity_provider_provider_subject_key**: `UNIQUE (identity_provider, provider_subject)`
- **app_users_mfa_enabled_not_null**: `NOT NULL mfa_enabled`
- **app_users_pkey**: `PRIMARY KEY (id)`
- **app_users_provider_subject_not_null**: `NOT NULL provider_subject`
- **app_users_status_check**: `CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'deleted'::text]))`
- **app_users_status_not_null**: `NOT NULL status`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.app_users FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## user_sessions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| created_at | timestamp with time zone | Yes | `now()` |
| user_id | uuid | Yes | `—` |
| provider_session_hash | text | Yes | `—` |
| authenticated_at | timestamp with time zone | Yes | `—` |
| mfa_verified_at | timestamp with time zone | No | `—` |
| expires_at | timestamp with time zone | Yes | `—` |
| revoked_at | timestamp with time zone | No | `—` |
| revocation_reason | text | No | `—` |

Constraints:

- **user_sessions_authenticated_at_not_null**: `NOT NULL authenticated_at`
- **user_sessions_check**: `CHECK (expires_at > authenticated_at)`
- **user_sessions_check1**: `CHECK (revoked_at IS NULL OR revocation_reason IS NOT NULL)`
- **user_sessions_created_at_not_null**: `NOT NULL created_at`
- **user_sessions_expires_at_not_null**: `NOT NULL expires_at`
- **user_sessions_id_not_null**: `NOT NULL id`
- **user_sessions_pkey**: `PRIMARY KEY (id)`
- **user_sessions_provider_session_hash_key**: `UNIQUE (provider_session_hash)`
- **user_sessions_provider_session_hash_not_null**: `NOT NULL provider_session_hash`
- **user_sessions_user_id_fkey**: `FOREIGN KEY (user_id) REFERENCES mizan.app_users(id)`
- **user_sessions_user_id_not_null**: `NOT NULL user_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.user_sessions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## security_events

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| created_at | timestamp with time zone | Yes | `now()` |
| user_id | uuid | No | `—` |
| event_type | text | Yes | `—` |
| request_id | uuid | No | `—` |
| redacted_details | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **security_events_created_at_not_null**: `NOT NULL created_at`
- **security_events_event_type_not_null**: `NOT NULL event_type`
- **security_events_id_not_null**: `NOT NULL id`
- **security_events_pkey**: `PRIMARY KEY (id)`
- **security_events_redacted_details_not_null**: `NOT NULL redacted_details`
- **security_events_user_id_fkey**: `FOREIGN KEY (user_id) REFERENCES mizan.app_users(id)`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.security_events FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.security_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## permissions

| Column | Type | Required | Default |
|---|---|---|---|
| code | text | Yes | `—` |
| description | text | Yes | `—` |

Constraints:

- **permissions_code_not_null**: `NOT NULL code`
- **permissions_description_not_null**: `NOT NULL description`
- **permissions_pkey**: `PRIMARY KEY (code)`

Triggers:

None.

## roles

| Column | Type | Required | Default |
|---|---|---|---|
| code | text | Yes | `—` |
| description | text | Yes | `—` |

Constraints:

- **roles_code_not_null**: `NOT NULL code`
- **roles_description_not_null**: `NOT NULL description`
- **roles_pkey**: `PRIMARY KEY (code)`

Triggers:

None.

## role_permissions

| Column | Type | Required | Default |
|---|---|---|---|
| role_code | text | Yes | `—` |
| permission_code | text | Yes | `—` |

Constraints:

- **role_permissions_permission_code_fkey**: `FOREIGN KEY (permission_code) REFERENCES mizan.permissions(code)`
- **role_permissions_permission_code_not_null**: `NOT NULL permission_code`
- **role_permissions_pkey**: `PRIMARY KEY (role_code, permission_code)`
- **role_permissions_role_code_fkey**: `FOREIGN KEY (role_code) REFERENCES mizan.roles(code)`
- **role_permissions_role_code_not_null**: `NOT NULL role_code`

Triggers:

None.

## tenants

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| created_at | timestamp with time zone | Yes | `now()` |
| name | text | Yes | `—` |
| data_region | text | Yes | `—` |
| status | text | Yes | `'active'::text` |
| owner_user_id | uuid | Yes | `—` |

Constraints:

- **tenants_created_at_not_null**: `NOT NULL created_at`
- **tenants_data_region_not_null**: `NOT NULL data_region`
- **tenants_id_not_null**: `NOT NULL id`
- **tenants_name_not_null**: `NOT NULL name`
- **tenants_owner_user_id_fkey**: `FOREIGN KEY (owner_user_id) REFERENCES mizan.app_users(id)`
- **tenants_owner_user_id_not_null**: `NOT NULL owner_user_id`
- **tenants_pkey**: `PRIMARY KEY (id)`
- **tenants_status_check**: `CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'export_window'::text, 'deletion_pending'::text, 'deleted'::text]))`
- **tenants_status_not_null**: `NOT NULL status`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.tenants FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## memberships

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| user_id | uuid | Yes | `—` |
| status | text | Yes | `'invited'::text` |
| joined_at | timestamp with time zone | No | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **memberships_created_at_not_null**: `NOT NULL created_at`
- **memberships_id_not_null**: `NOT NULL id`
- **memberships_pkey**: `PRIMARY KEY (id)`
- **memberships_status_check**: `CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text]))`
- **memberships_status_not_null**: `NOT NULL status`
- **memberships_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **memberships_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **memberships_tenant_id_not_null**: `NOT NULL tenant_id`
- **memberships_tenant_id_user_id_key**: `UNIQUE (tenant_id, user_id)`
- **memberships_user_id_fkey**: `FOREIGN KEY (user_id) REFERENCES mizan.app_users(id)`
- **memberships_user_id_not_null**: `NOT NULL user_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.memberships FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## legal_entities

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| code | text | Yes | `—` |
| legal_name | text | Yes | `—` |
| registration_identifier_ciphertext | text | No | `—` |
| status | text | Yes | `'active'::text` |

Constraints:

- **legal_entities_code_not_null**: `NOT NULL code`
- **legal_entities_created_at_not_null**: `NOT NULL created_at`
- **legal_entities_id_not_null**: `NOT NULL id`
- **legal_entities_legal_name_not_null**: `NOT NULL legal_name`
- **legal_entities_pkey**: `PRIMARY KEY (id)`
- **legal_entities_status_check**: `CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]))`
- **legal_entities_status_not_null**: `NOT NULL status`
- **legal_entities_tenant_id_code_key**: `UNIQUE (tenant_id, code)`
- **legal_entities_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **legal_entities_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **legal_entities_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.legal_entities FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## entity_settings_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| version | integer | Yes | `—` |
| predecessor_id | uuid | No | `—` |
| currency_code | text | Yes | `—` |
| fiscal_year_start_month | smallint | Yes | `—` |
| calendar | text | Yes | `—` |
| calendar_conversion_policy | text | No | `—` |
| accounting_framework | text | Yes | `—` |
| policies | jsonb | Yes | `'{}'::jsonb` |
| effective_from | date | Yes | `—` |
| created_by | uuid | Yes | `—` |
| change_reason | text | Yes | `—` |

Constraints:

- **entity_settings_versions_accounting_framework_not_null**: `NOT NULL accounting_framework`
- **entity_settings_versions_calendar_check**: `CHECK (calendar = ANY (ARRAY['gregorian'::text, 'explicit_conversion'::text]))`
- **entity_settings_versions_calendar_not_null**: `NOT NULL calendar`
- **entity_settings_versions_change_reason_not_null**: `NOT NULL change_reason`
- **entity_settings_versions_created_at_not_null**: `NOT NULL created_at`
- **entity_settings_versions_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **entity_settings_versions_created_by_not_null**: `NOT NULL created_by`
- **entity_settings_versions_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **entity_settings_versions_currency_code_not_null**: `NOT NULL currency_code`
- **entity_settings_versions_effective_from_not_null**: `NOT NULL effective_from`
- **entity_settings_versions_entity_id_not_null**: `NOT NULL entity_id`
- **entity_settings_versions_fiscal_year_start_month_check**: `CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12)`
- **entity_settings_versions_fiscal_year_start_month_not_null**: `NOT NULL fiscal_year_start_month`
- **entity_settings_versions_id_not_null**: `NOT NULL id`
- **entity_settings_versions_pkey**: `PRIMARY KEY (id)`
- **entity_settings_versions_policies_check**: `CHECK (jsonb_typeof(policies) = 'object'::text)`
- **entity_settings_versions_policies_not_null**: `NOT NULL policies`
- **entity_settings_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **entity_settings_versions_tenant_id_entity_id_id_currency_co_key**: `UNIQUE (tenant_id, entity_id, id, currency_code)`
- **entity_settings_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **entity_settings_versions_tenant_id_entity_id_predecessor_i_fkey**: `FOREIGN KEY (tenant_id, entity_id, predecessor_id) REFERENCES mizan.entity_settings_versions(tenant_id, entity_id, id)`
- **entity_settings_versions_tenant_id_entity_id_version_key**: `UNIQUE (tenant_id, entity_id, version)`
- **entity_settings_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **entity_settings_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **entity_settings_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **entity_settings_versions_version_check**: `CHECK (version > 0)`
- **entity_settings_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.entity_settings_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.entity_settings_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## accounting_periods

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| logical_period_id | uuid | Yes | `gen_random_uuid()` |
| version | integer | Yes | `—` |
| predecessor_id | uuid | No | `—` |
| settings_version_id | uuid | Yes | `—` |
| start_date | date | Yes | `—` |
| end_date | date | Yes | `—` |
| status | text | Yes | `'open'::text` |
| locked_at | timestamp with time zone | No | `—` |
| locked_by | uuid | No | `—` |
| reopen_reason | text | No | `—` |
| created_by | uuid | Yes | `—` |

Constraints:

- **accounting_periods_check**: `CHECK (end_date >= start_date)`
- **accounting_periods_check1**: `CHECK (status <> 'locked'::text OR locked_at IS NOT NULL AND locked_by IS NOT NULL)`
- **accounting_periods_check2**: `CHECK (predecessor_id IS NULL OR length(TRIM(BOTH FROM reopen_reason)) > 0)`
- **accounting_periods_created_at_not_null**: `NOT NULL created_at`
- **accounting_periods_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **accounting_periods_created_by_not_null**: `NOT NULL created_by`
- **accounting_periods_end_date_not_null**: `NOT NULL end_date`
- **accounting_periods_entity_id_not_null**: `NOT NULL entity_id`
- **accounting_periods_id_not_null**: `NOT NULL id`
- **accounting_periods_locked_by_fkey**: `FOREIGN KEY (locked_by) REFERENCES mizan.app_users(id)`
- **accounting_periods_logical_period_id_not_null**: `NOT NULL logical_period_id`
- **accounting_periods_pkey**: `PRIMARY KEY (id)`
- **accounting_periods_settings_version_id_not_null**: `NOT NULL settings_version_id`
- **accounting_periods_start_date_not_null**: `NOT NULL start_date`
- **accounting_periods_status_check**: `CHECK (status = ANY (ARRAY['open'::text, 'locked'::text, 'superseded'::text]))`
- **accounting_periods_status_not_null**: `NOT NULL status`
- **accounting_periods_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **accounting_periods_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **accounting_periods_tenant_id_entity_id_logical_period_id_ve_key**: `UNIQUE (tenant_id, entity_id, logical_period_id, version)`
- **accounting_periods_tenant_id_entity_id_predecessor_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, predecessor_id) REFERENCES mizan.accounting_periods(tenant_id, entity_id, id)`
- **accounting_periods_tenant_id_entity_id_settings_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, settings_version_id) REFERENCES mizan.entity_settings_versions(tenant_id, entity_id, id)`
- **accounting_periods_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **accounting_periods_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **accounting_periods_tenant_id_not_null**: `NOT NULL tenant_id`
- **accounting_periods_version_check**: `CHECK (version > 0)`
- **accounting_periods_version_not_null**: `NOT NULL version`
- **period_reopening_reason_required**: `CHECK (predecessor_id IS NULL OR reopen_reason IS NOT NULL AND length(TRIM(BOTH FROM reopen_reason)) > 0)`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.accounting_periods FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER locked_period BEFORE INSERT OR DELETE OR UPDATE ON mizan.accounting_periods FOR EACH ROW EXECUTE FUNCTION mizan.guard_period()`

## accounts

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| code | text | Yes | `—` |
| name | text | Yes | `—` |
| account_type | text | Yes | `—` |
| parent_id | uuid | No | `—` |
| active | boolean | Yes | `true` |

Constraints:

- **accounts_account_type_check**: `CHECK (account_type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text, 'unclassified'::text]))`
- **accounts_account_type_not_null**: `NOT NULL account_type`
- **accounts_active_not_null**: `NOT NULL active`
- **accounts_code_not_null**: `NOT NULL code`
- **accounts_created_at_not_null**: `NOT NULL created_at`
- **accounts_entity_id_not_null**: `NOT NULL entity_id`
- **accounts_id_not_null**: `NOT NULL id`
- **accounts_name_not_null**: `NOT NULL name`
- **accounts_pkey**: `PRIMARY KEY (id)`
- **accounts_tenant_id_entity_id_code_key**: `UNIQUE (tenant_id, entity_id, code)`
- **accounts_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **accounts_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **accounts_tenant_id_entity_id_parent_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, parent_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **accounts_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **accounts_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **accounts_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.accounts FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## bank_accounts

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| label | text | Yes | `—` |
| identifier_ciphertext | text | Yes | `—` |
| identifier_last_four | text | No | `—` |
| currency_code | text | Yes | `—` |
| ledger_account_id | uuid | Yes | `—` |
| active | boolean | Yes | `true` |

Constraints:

- **bank_accounts_active_not_null**: `NOT NULL active`
- **bank_accounts_created_at_not_null**: `NOT NULL created_at`
- **bank_accounts_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **bank_accounts_currency_code_not_null**: `NOT NULL currency_code`
- **bank_accounts_entity_id_not_null**: `NOT NULL entity_id`
- **bank_accounts_id_not_null**: `NOT NULL id`
- **bank_accounts_identifier_ciphertext_not_null**: `NOT NULL identifier_ciphertext`
- **bank_accounts_identifier_last_four_check**: `CHECK (length(identifier_last_four) <= 4)`
- **bank_accounts_label_not_null**: `NOT NULL label`
- **bank_accounts_ledger_account_id_not_null**: `NOT NULL ledger_account_id`
- **bank_accounts_pkey**: `PRIMARY KEY (id)`
- **bank_accounts_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **bank_accounts_tenant_id_entity_id_id_currency_code_key**: `UNIQUE (tenant_id, entity_id, id, currency_code)`
- **bank_accounts_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **bank_accounts_tenant_id_entity_id_ledger_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, ledger_account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **bank_accounts_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **bank_accounts_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **bank_accounts_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER bank_settings_frozen BEFORE UPDATE ON mizan.bank_accounts FOR EACH ROW EXECUTE FUNCTION mizan.guard_bank_configuration()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.bank_accounts FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## membership_roles

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| membership_id | uuid | Yes | `—` |
| role_code | text | Yes | `—` |
| entity_id | uuid | No | `—` |
| bank_account_id | uuid | No | `—` |
| granted_by | uuid | Yes | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **membership_roles_check**: `CHECK (bank_account_id IS NULL OR entity_id IS NOT NULL)`
- **membership_roles_created_at_not_null**: `NOT NULL created_at`
- **membership_roles_granted_by_fkey**: `FOREIGN KEY (granted_by) REFERENCES mizan.app_users(id)`
- **membership_roles_granted_by_not_null**: `NOT NULL granted_by`
- **membership_roles_id_not_null**: `NOT NULL id`
- **membership_roles_membership_id_not_null**: `NOT NULL membership_id`
- **membership_roles_pkey**: `PRIMARY KEY (id)`
- **membership_roles_role_code_fkey**: `FOREIGN KEY (role_code) REFERENCES mizan.roles(code)`
- **membership_roles_role_code_not_null**: `NOT NULL role_code`
- **membership_roles_tenant_id_entity_id_bank_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_account_id) REFERENCES mizan.bank_accounts(tenant_id, entity_id, id)`
- **membership_roles_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **membership_roles_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **membership_roles_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **membership_roles_tenant_id_membership_id_fkey**: `FOREIGN KEY (tenant_id, membership_id) REFERENCES mizan.memberships(tenant_id, id)`
- **membership_roles_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.membership_roles FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## access_grants

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| membership_id | uuid | Yes | `—` |
| permission_code | text | Yes | `—` |
| entity_id | uuid | No | `—` |
| bank_account_id | uuid | No | `—` |
| granted_by | uuid | Yes | `—` |
| expires_at | timestamp with time zone | No | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **access_grants_check**: `CHECK (bank_account_id IS NULL OR entity_id IS NOT NULL)`
- **access_grants_created_at_not_null**: `NOT NULL created_at`
- **access_grants_granted_by_fkey**: `FOREIGN KEY (granted_by) REFERENCES mizan.app_users(id)`
- **access_grants_granted_by_not_null**: `NOT NULL granted_by`
- **access_grants_id_not_null**: `NOT NULL id`
- **access_grants_membership_id_not_null**: `NOT NULL membership_id`
- **access_grants_permission_code_fkey**: `FOREIGN KEY (permission_code) REFERENCES mizan.permissions(code)`
- **access_grants_permission_code_not_null**: `NOT NULL permission_code`
- **access_grants_pkey**: `PRIMARY KEY (id)`
- **access_grants_tenant_id_entity_id_bank_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_account_id) REFERENCES mizan.bank_accounts(tenant_id, entity_id, id)`
- **access_grants_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **access_grants_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **access_grants_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **access_grants_tenant_id_membership_id_fkey**: `FOREIGN KEY (tenant_id, membership_id) REFERENCES mizan.memberships(tenant_id, id)`
- **access_grants_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.access_grants FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## invitations

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| email | text | Yes | `—` |
| token_hash | text | Yes | `—` |
| invited_by | uuid | Yes | `—` |
| expires_at | timestamp with time zone | Yes | `—` |
| accepted_at | timestamp with time zone | No | `—` |
| accepted_by | uuid | No | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **invitations_accepted_by_fkey**: `FOREIGN KEY (accepted_by) REFERENCES mizan.app_users(id)`
- **invitations_check**: `CHECK (expires_at > created_at)`
- **invitations_check1**: `CHECK (accepted_at IS NULL OR accepted_at < expires_at AND accepted_by IS NOT NULL AND revoked_at IS NULL)`
- **invitations_created_at_not_null**: `NOT NULL created_at`
- **invitations_email_not_null**: `NOT NULL email`
- **invitations_expires_at_not_null**: `NOT NULL expires_at`
- **invitations_id_not_null**: `NOT NULL id`
- **invitations_invited_by_fkey**: `FOREIGN KEY (invited_by) REFERENCES mizan.app_users(id)`
- **invitations_invited_by_not_null**: `NOT NULL invited_by`
- **invitations_pkey**: `PRIMARY KEY (id)`
- **invitations_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **invitations_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **invitations_tenant_id_not_null**: `NOT NULL tenant_id`
- **invitations_token_hash_key**: `UNIQUE (token_hash)`
- **invitations_token_hash_not_null**: `NOT NULL token_hash`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.invitations FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER invitation_single_use BEFORE UPDATE ON mizan.invitations FOR EACH ROW EXECUTE FUNCTION mizan.guard_invitation()`

## invitation_grants

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| invitation_id | uuid | Yes | `—` |
| permission_code | text | Yes | `—` |
| entity_id | uuid | No | `—` |
| bank_account_id | uuid | No | `—` |

Constraints:

- **invitation_grants_check**: `CHECK (bank_account_id IS NULL OR entity_id IS NOT NULL)`
- **invitation_grants_created_at_not_null**: `NOT NULL created_at`
- **invitation_grants_id_not_null**: `NOT NULL id`
- **invitation_grants_invitation_id_not_null**: `NOT NULL invitation_id`
- **invitation_grants_permission_code_fkey**: `FOREIGN KEY (permission_code) REFERENCES mizan.permissions(code)`
- **invitation_grants_permission_code_not_null**: `NOT NULL permission_code`
- **invitation_grants_pkey**: `PRIMARY KEY (id)`
- **invitation_grants_tenant_id_entity_id_bank_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_account_id) REFERENCES mizan.bank_accounts(tenant_id, entity_id, id)`
- **invitation_grants_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **invitation_grants_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **invitation_grants_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **invitation_grants_tenant_id_invitation_id_fkey**: `FOREIGN KEY (tenant_id, invitation_id) REFERENCES mizan.invitations(tenant_id, id)`
- **invitation_grants_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.invitation_grants FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## processing_jobs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| job_type | text | Yes | `—` |
| idempotency_key | text | Yes | `—` |
| status | text | Yes | `'queued'::text` |
| progress | numeric | Yes | `0` |
| attempt_count | integer | Yes | `0` |
| lease_expires_at | timestamp with time zone | No | `—` |
| cancel_requested_at | timestamp with time zone | No | `—` |
| started_at | timestamp with time zone | No | `—` |
| finished_at | timestamp with time zone | No | `—` |
| trace_id | uuid | Yes | `gen_random_uuid()` |
| input_references | jsonb | Yes | `'{}'::jsonb` |
| error_code | text | No | `—` |
| requested_by | uuid | Yes | `—` |

Constraints:

- **processing_jobs_attempt_count_check**: `CHECK (attempt_count >= 0)`
- **processing_jobs_attempt_count_not_null**: `NOT NULL attempt_count`
- **processing_jobs_created_at_not_null**: `NOT NULL created_at`
- **processing_jobs_entity_id_not_null**: `NOT NULL entity_id`
- **processing_jobs_id_not_null**: `NOT NULL id`
- **processing_jobs_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **processing_jobs_input_references_check**: `CHECK (jsonb_typeof(input_references) = 'object'::text)`
- **processing_jobs_input_references_not_null**: `NOT NULL input_references`
- **processing_jobs_job_type_not_null**: `NOT NULL job_type`
- **processing_jobs_pkey**: `PRIMARY KEY (id)`
- **processing_jobs_progress_check**: `CHECK (progress >= 0::numeric AND progress <= 1::numeric)`
- **processing_jobs_progress_not_null**: `NOT NULL progress`
- **processing_jobs_requested_by_fkey**: `FOREIGN KEY (requested_by) REFERENCES mizan.app_users(id)`
- **processing_jobs_requested_by_not_null**: `NOT NULL requested_by`
- **processing_jobs_status_check**: `CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text]))`
- **processing_jobs_status_not_null**: `NOT NULL status`
- **processing_jobs_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **processing_jobs_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **processing_jobs_tenant_id_entity_id_job_type_idempotency_ke_key**: `UNIQUE (tenant_id, entity_id, job_type, idempotency_key)`
- **processing_jobs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **processing_jobs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **processing_jobs_tenant_id_not_null**: `NOT NULL tenant_id`
- **processing_jobs_trace_id_not_null**: `NOT NULL trace_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.processing_jobs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## job_attempts

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| job_id | uuid | Yes | `—` |
| attempt_number | integer | Yes | `—` |
| worker_identifier | text | Yes | `—` |
| started_at | timestamp with time zone | Yes | `—` |
| finished_at | timestamp with time zone | No | `—` |
| error_code | text | No | `—` |

Constraints:

- **job_attempts_attempt_number_check**: `CHECK (attempt_number > 0)`
- **job_attempts_attempt_number_not_null**: `NOT NULL attempt_number`
- **job_attempts_created_at_not_null**: `NOT NULL created_at`
- **job_attempts_entity_id_not_null**: `NOT NULL entity_id`
- **job_attempts_id_not_null**: `NOT NULL id`
- **job_attempts_job_id_not_null**: `NOT NULL job_id`
- **job_attempts_pkey**: `PRIMARY KEY (id)`
- **job_attempts_started_at_not_null**: `NOT NULL started_at`
- **job_attempts_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **job_attempts_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **job_attempts_tenant_id_entity_id_job_id_attempt_number_key**: `UNIQUE (tenant_id, entity_id, job_id, attempt_number)`
- **job_attempts_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **job_attempts_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **job_attempts_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **job_attempts_tenant_id_not_null**: `NOT NULL tenant_id`
- **job_attempts_worker_identifier_not_null**: `NOT NULL worker_identifier`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.job_attempts FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.job_attempts FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## source_files

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| sha256 | text | Yes | `—` |
| original_name | text | Yes | `—` |
| media_type | text | Yes | `—` |
| byte_size | bigint | Yes | `—` |
| object_key | text | Yes | `—` |
| object_version | text | Yes | `—` |
| encryption_key_reference | text | Yes | `—` |
| uploaded_by | uuid | Yes | `—` |
| scan_status | text | Yes | `'quarantined'::text` |
| scanned_at | timestamp with time zone | No | `—` |
| scanner_version | text | No | `—` |
| scan_job_id | uuid | No | `—` |
| deleted_at | timestamp with time zone | No | `—` |

Constraints:

- **clean_scan_evidence**: `CHECK (scan_status <> 'clean'::text OR scanned_at IS NOT NULL AND scanner_version IS NOT NULL)`
- **source_files_byte_size_check**: `CHECK (byte_size >= 0)`
- **source_files_byte_size_not_null**: `NOT NULL byte_size`
- **source_files_created_at_not_null**: `NOT NULL created_at`
- **source_files_encryption_key_reference_not_null**: `NOT NULL encryption_key_reference`
- **source_files_entity_id_not_null**: `NOT NULL entity_id`
- **source_files_id_not_null**: `NOT NULL id`
- **source_files_media_type_not_null**: `NOT NULL media_type`
- **source_files_object_key_not_null**: `NOT NULL object_key`
- **source_files_object_version_not_null**: `NOT NULL object_version`
- **source_files_original_name_not_null**: `NOT NULL original_name`
- **source_files_pkey**: `PRIMARY KEY (id)`
- **source_files_scan_status_check**: `CHECK (scan_status = ANY (ARRAY['quarantined'::text, 'clean'::text, 'infected'::text, 'rejected'::text]))`
- **source_files_scan_status_not_null**: `NOT NULL scan_status`
- **source_files_sha256_check**: `CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)`
- **source_files_sha256_not_null**: `NOT NULL sha256`
- **source_files_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **source_files_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **source_files_tenant_id_entity_id_scan_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, scan_job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **source_files_tenant_id_entity_id_sha256_key**: `UNIQUE (tenant_id, entity_id, sha256)`
- **source_files_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **source_files_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **source_files_tenant_id_not_null**: `NOT NULL tenant_id`
- **source_files_uploaded_by_fkey**: `FOREIGN KEY (uploaded_by) REFERENCES mizan.app_users(id)`
- **source_files_uploaded_by_not_null**: `NOT NULL uploaded_by`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.source_files FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_identity_immutable BEFORE UPDATE ON mizan.source_files FOR EACH ROW EXECUTE FUNCTION mizan.guard_columns('sha256', 'original_name', 'media_type', 'byte_size', 'object_key', 'object_version', 'encryption_key_reference', 'uploaded_by')`

## import_templates

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| logical_template_id | uuid | Yes | `gen_random_uuid()` |
| version | integer | Yes | `—` |
| name | text | Yes | `—` |
| predecessor_id | uuid | No | `—` |
| required_columns | jsonb | Yes | `—` |
| column_mapping | jsonb | Yes | `'{}'::jsonb` |
| header_row | integer | Yes | `—` |
| worksheet_name | text | Yes | `—` |
| date_format | text | Yes | `—` |
| decimal_separator | text | Yes | `—` |
| thousands_separator | text | No | `—` |
| created_by | uuid | Yes | `—` |

Constraints:

- **import_templates_column_mapping_check**: `CHECK (jsonb_typeof(column_mapping) = 'object'::text)`
- **import_templates_column_mapping_not_null**: `NOT NULL column_mapping`
- **import_templates_created_at_not_null**: `NOT NULL created_at`
- **import_templates_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **import_templates_created_by_not_null**: `NOT NULL created_by`
- **import_templates_date_format_not_null**: `NOT NULL date_format`
- **import_templates_decimal_separator_not_null**: `NOT NULL decimal_separator`
- **import_templates_entity_id_not_null**: `NOT NULL entity_id`
- **import_templates_header_row_check**: `CHECK (header_row > 0)`
- **import_templates_header_row_not_null**: `NOT NULL header_row`
- **import_templates_id_not_null**: `NOT NULL id`
- **import_templates_logical_template_id_not_null**: `NOT NULL logical_template_id`
- **import_templates_name_not_null**: `NOT NULL name`
- **import_templates_pkey**: `PRIMARY KEY (id)`
- **import_templates_required_columns_check**: `CHECK (jsonb_typeof(required_columns) = 'array'::text)`
- **import_templates_required_columns_not_null**: `NOT NULL required_columns`
- **import_templates_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **import_templates_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **import_templates_tenant_id_entity_id_logical_template_id_ve_key**: `UNIQUE (tenant_id, entity_id, logical_template_id, version)`
- **import_templates_tenant_id_entity_id_predecessor_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, predecessor_id) REFERENCES mizan.import_templates(tenant_id, entity_id, id)`
- **import_templates_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **import_templates_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **import_templates_tenant_id_not_null**: `NOT NULL tenant_id`
- **import_templates_version_check**: `CHECK (version > 0)`
- **import_templates_version_not_null**: `NOT NULL version`
- **import_templates_worksheet_name_not_null**: `NOT NULL worksheet_name`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.import_templates FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.import_templates FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## import_batches

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| source_file_id | uuid | Yes | `—` |
| template_id | uuid | Yes | `—` |
| period_id | uuid | Yes | `—` |
| parser_version | text | Yes | `—` |
| data_type | text | Yes | `—` |
| balance_basis | text | No | `—` |
| range_start | date | No | `—` |
| range_end | date | No | `—` |
| idempotency_key | text | Yes | `—` |
| job_id | uuid | No | `—` |
| status | text | Yes | `'uploaded'::text` |
| complete_dataset | boolean | Yes | `false` |
| published_at | timestamp with time zone | No | `—` |
| published_by | uuid | No | `—` |

Constraints:

- **import_batches_balance_basis_check**: `CHECK (balance_basis = ANY (ARRAY['period'::text, 'year_to_date'::text, 'point_in_time'::text, 'not_applicable'::text]))`
- **import_batches_check**: `CHECK (range_end IS NULL OR range_start IS NULL OR range_end >= range_start)`
- **import_batches_check1**: `CHECK (status <> 'published'::text OR complete_dataset AND published_at IS NOT NULL AND published_by IS NOT NULL)`
- **import_batches_complete_dataset_not_null**: `NOT NULL complete_dataset`
- **import_batches_created_at_not_null**: `NOT NULL created_at`
- **import_batches_data_type_check**: `CHECK (data_type = ANY (ARRAY['trial_balance'::text, 'general_ledger'::text, 'bank_statement'::text, 'bank_ledger'::text, 'budget'::text, 'trade_items'::text, 'ocr'::text]))`
- **import_batches_data_type_not_null**: `NOT NULL data_type`
- **import_batches_entity_id_not_null**: `NOT NULL entity_id`
- **import_batches_id_not_null**: `NOT NULL id`
- **import_batches_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **import_batches_parser_version_not_null**: `NOT NULL parser_version`
- **import_batches_period_id_not_null**: `NOT NULL period_id`
- **import_batches_pkey**: `PRIMARY KEY (id)`
- **import_batches_published_by_fkey**: `FOREIGN KEY (published_by) REFERENCES mizan.app_users(id)`
- **import_batches_source_file_id_not_null**: `NOT NULL source_file_id`
- **import_batches_status_check**: `CHECK (status = ANY (ARRAY['uploaded'::text, 'scanning'::text, 'extracting'::text, 'needs_review'::text, 'failed'::text, 'ready'::text, 'published'::text, 'cancelled'::text]))`
- **import_batches_status_not_null**: `NOT NULL status`
- **import_batches_template_id_not_null**: `NOT NULL template_id`
- **import_batches_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **import_batches_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **import_batches_tenant_id_entity_id_idempotency_key_key**: `UNIQUE (tenant_id, entity_id, idempotency_key)`
- **import_batches_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **import_batches_tenant_id_entity_id_period_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, period_id) REFERENCES mizan.accounting_periods(tenant_id, entity_id, id)`
- **import_batches_tenant_id_entity_id_source_file_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_file_id) REFERENCES mizan.source_files(tenant_id, entity_id, id)`
- **import_batches_tenant_id_entity_id_template_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, template_id) REFERENCES mizan.import_templates(tenant_id, entity_id, id)`
- **import_batches_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **import_batches_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **import_batches_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.import_batches FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER immutable_import BEFORE INSERT OR DELETE OR UPDATE ON mizan.import_batches FOR EACH ROW EXECUTE FUNCTION mizan.guard_import()`
- `CREATE TRIGGER period_open BEFORE INSERT OR UPDATE ON mizan.import_batches FOR EACH ROW EXECUTE FUNCTION mizan.guard_period_reference()`

## source_rows

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| import_batch_id | uuid | Yes | `—` |
| worksheet | text | Yes | `—` |
| row_number | integer | Yes | `—` |
| original_values | jsonb | Yes | `'{}'::jsonb` |
| row_fingerprint | text | Yes | `—` |

Constraints:

- **original_json_object**: `CHECK (jsonb_typeof(original_values) = 'object'::text)`
- **source_rows_created_at_not_null**: `NOT NULL created_at`
- **source_rows_entity_id_not_null**: `NOT NULL entity_id`
- **source_rows_id_not_null**: `NOT NULL id`
- **source_rows_import_batch_id_not_null**: `NOT NULL import_batch_id`
- **source_rows_original_values_check**: `CHECK (jsonb_typeof(original_values) = 'object'::text)`
- **source_rows_original_values_not_null**: `NOT NULL original_values`
- **source_rows_pkey**: `PRIMARY KEY (id)`
- **source_rows_row_fingerprint_not_null**: `NOT NULL row_fingerprint`
- **source_rows_row_number_check**: `CHECK (row_number > 0)`
- **source_rows_row_number_not_null**: `NOT NULL row_number`
- **source_rows_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **source_rows_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **source_rows_tenant_id_entity_id_import_batch_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, import_batch_id) REFERENCES mizan.import_batches(tenant_id, entity_id, id)`
- **source_rows_tenant_id_entity_id_import_batch_id_worksheet_r_key**: `UNIQUE (tenant_id, entity_id, import_batch_id, worksheet, row_number)`
- **source_rows_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **source_rows_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **source_rows_tenant_id_not_null**: `NOT NULL tenant_id`
- **source_rows_worksheet_not_null**: `NOT NULL worksheet`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.source_rows FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.source_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_batch_frozen BEFORE INSERT ON mizan.source_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_source_row_insert()`

## row_transformations

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| source_row_id | uuid | Yes | `—` |
| version | integer | Yes | `—` |
| derived_values | jsonb | Yes | `'{}'::jsonb` |
| reason | text | Yes | `—` |
| actor_id | uuid | Yes | `—` |
| validation_job_id | uuid | No | `—` |

Constraints:

- **row_transformations_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **row_transformations_actor_id_not_null**: `NOT NULL actor_id`
- **row_transformations_created_at_not_null**: `NOT NULL created_at`
- **row_transformations_derived_values_check**: `CHECK (jsonb_typeof(derived_values) = 'object'::text)`
- **row_transformations_derived_values_not_null**: `NOT NULL derived_values`
- **row_transformations_entity_id_not_null**: `NOT NULL entity_id`
- **row_transformations_id_not_null**: `NOT NULL id`
- **row_transformations_pkey**: `PRIMARY KEY (id)`
- **row_transformations_reason_not_null**: `NOT NULL reason`
- **row_transformations_source_row_id_not_null**: `NOT NULL source_row_id`
- **row_transformations_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **row_transformations_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **row_transformations_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **row_transformations_tenant_id_entity_id_source_row_id_versi_key**: `UNIQUE (tenant_id, entity_id, source_row_id, version)`
- **row_transformations_tenant_id_entity_id_validation_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, validation_job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **row_transformations_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **row_transformations_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **row_transformations_tenant_id_not_null**: `NOT NULL tenant_id`
- **row_transformations_version_check**: `CHECK (version > 0)`
- **row_transformations_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.row_transformations FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.row_transformations FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## row_dispositions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| source_row_id | uuid | Yes | `—` |
| version | integer | Yes | `—` |
| disposition | text | Yes | `—` |
| reason | text | Yes | `—` |
| signed_effect | mizan.exact_amount | No | `—` |
| actor_id | uuid | Yes | `—` |

Constraints:

- **row_dispositions_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **row_dispositions_actor_id_not_null**: `NOT NULL actor_id`
- **row_dispositions_created_at_not_null**: `NOT NULL created_at`
- **row_dispositions_disposition_check**: `CHECK (disposition = ANY (ARRAY['accepted'::text, 'rejected'::text, 'excluded'::text, 'total_row'::text]))`
- **row_dispositions_disposition_not_null**: `NOT NULL disposition`
- **row_dispositions_entity_id_not_null**: `NOT NULL entity_id`
- **row_dispositions_id_not_null**: `NOT NULL id`
- **row_dispositions_pkey**: `PRIMARY KEY (id)`
- **row_dispositions_reason_not_null**: `NOT NULL reason`
- **row_dispositions_source_row_id_not_null**: `NOT NULL source_row_id`
- **row_dispositions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **row_dispositions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **row_dispositions_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **row_dispositions_tenant_id_entity_id_source_row_id_version_key**: `UNIQUE (tenant_id, entity_id, source_row_id, version)`
- **row_dispositions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **row_dispositions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **row_dispositions_tenant_id_not_null**: `NOT NULL tenant_id`
- **row_dispositions_version_check**: `CHECK (version > 0)`
- **row_dispositions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.row_dispositions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.row_dispositions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## quality_runs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `clock_timestamp()` |
| import_batch_id | uuid | Yes | `—` |
| job_id | uuid | No | `—` |
| rule_version | text | Yes | `—` |
| content_fingerprint | text | Yes | `—` |
| records_read | bigint | Yes | `—` |
| accepted | bigint | Yes | `—` |
| rejected | bigint | Yes | `—` |
| excluded | bigint | Yes | `—` |
| totals_before | jsonb | Yes | `'{}'::jsonb` |
| totals_after | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **quality_runs_accepted_check**: `CHECK (accepted >= 0)`
- **quality_runs_accepted_not_null**: `NOT NULL accepted`
- **quality_runs_check**: `CHECK (records_read = (accepted + rejected + excluded))`
- **quality_runs_content_fingerprint_check**: `CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'::text)`
- **quality_runs_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **quality_runs_created_at_not_null**: `NOT NULL created_at`
- **quality_runs_entity_id_not_null**: `NOT NULL entity_id`
- **quality_runs_excluded_check**: `CHECK (excluded >= 0)`
- **quality_runs_excluded_not_null**: `NOT NULL excluded`
- **quality_runs_id_not_null**: `NOT NULL id`
- **quality_runs_import_batch_id_not_null**: `NOT NULL import_batch_id`
- **quality_runs_pkey**: `PRIMARY KEY (id)`
- **quality_runs_records_read_check**: `CHECK (records_read >= 0)`
- **quality_runs_records_read_not_null**: `NOT NULL records_read`
- **quality_runs_rejected_check**: `CHECK (rejected >= 0)`
- **quality_runs_rejected_not_null**: `NOT NULL rejected`
- **quality_runs_rule_version_not_null**: `NOT NULL rule_version`
- **quality_runs_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **quality_runs_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **quality_runs_tenant_id_entity_id_import_batch_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, import_batch_id) REFERENCES mizan.import_batches(tenant_id, entity_id, id)`
- **quality_runs_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **quality_runs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **quality_runs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **quality_runs_tenant_id_not_null**: `NOT NULL tenant_id`
- **quality_runs_totals_after_check**: `CHECK (jsonb_typeof(totals_after) = 'object'::text)`
- **quality_runs_totals_after_not_null**: `NOT NULL totals_after`
- **quality_runs_totals_before_check**: `CHECK (jsonb_typeof(totals_before) = 'object'::text)`
- **quality_runs_totals_before_not_null**: `NOT NULL totals_before`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.quality_runs FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.quality_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## quality_issues

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| quality_run_id | uuid | Yes | `—` |
| source_row_id | uuid | No | `—` |
| severity | text | Yes | `—` |
| code | text | Yes | `—` |
| message | text | Yes | `—` |
| evidence | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **quality_issues_code_not_null**: `NOT NULL code`
- **quality_issues_created_at_not_null**: `NOT NULL created_at`
- **quality_issues_entity_id_not_null**: `NOT NULL entity_id`
- **quality_issues_evidence_check**: `CHECK (jsonb_typeof(evidence) = 'object'::text)`
- **quality_issues_evidence_not_null**: `NOT NULL evidence`
- **quality_issues_id_not_null**: `NOT NULL id`
- **quality_issues_message_not_null**: `NOT NULL message`
- **quality_issues_pkey**: `PRIMARY KEY (id)`
- **quality_issues_quality_run_id_not_null**: `NOT NULL quality_run_id`
- **quality_issues_severity_check**: `CHECK (severity = ANY (ARRAY['blocking'::text, 'warning'::text]))`
- **quality_issues_severity_not_null**: `NOT NULL severity`
- **quality_issues_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **quality_issues_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **quality_issues_tenant_id_entity_id_quality_run_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, quality_run_id) REFERENCES mizan.quality_runs(tenant_id, entity_id, id)`
- **quality_issues_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **quality_issues_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **quality_issues_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **quality_issues_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.quality_issues FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.quality_issues FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## duplicate_candidates

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| source_row_id | uuid | Yes | `—` |
| other_source_row_id | uuid | Yes | `—` |
| rule_version | text | Yes | `—` |
| status | text | Yes | `'pending'::text` |
| decided_by | uuid | No | `—` |
| decision_reason | text | No | `—` |
| decided_at | timestamp with time zone | No | `—` |

Constraints:

- **duplicate_candidates_check**: `CHECK (source_row_id <> other_source_row_id)`
- **duplicate_candidates_check1**: `CHECK (status = 'pending'::text OR decided_by IS NOT NULL AND length(TRIM(BOTH FROM decision_reason)) > 0)`
- **duplicate_candidates_created_at_not_null**: `NOT NULL created_at`
- **duplicate_candidates_decided_by_fkey**: `FOREIGN KEY (decided_by) REFERENCES mizan.app_users(id)`
- **duplicate_candidates_entity_id_not_null**: `NOT NULL entity_id`
- **duplicate_candidates_id_not_null**: `NOT NULL id`
- **duplicate_candidates_other_source_row_id_not_null**: `NOT NULL other_source_row_id`
- **duplicate_candidates_pkey**: `PRIMARY KEY (id)`
- **duplicate_candidates_rule_version_not_null**: `NOT NULL rule_version`
- **duplicate_candidates_source_row_id_not_null**: `NOT NULL source_row_id`
- **duplicate_candidates_status_check**: `CHECK (status = ANY (ARRAY['pending'::text, 'legitimate'::text, 'duplicate'::text]))`
- **duplicate_candidates_status_not_null**: `NOT NULL status`
- **duplicate_candidates_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **duplicate_candidates_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **duplicate_candidates_tenant_id_entity_id_other_source_row__fkey**: `FOREIGN KEY (tenant_id, entity_id, other_source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **duplicate_candidates_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **duplicate_candidates_tenant_id_entity_id_source_row_id_othe_key**: `UNIQUE (tenant_id, entity_id, source_row_id, other_source_row_id, rule_version)`
- **duplicate_candidates_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **duplicate_candidates_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **duplicate_candidates_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.duplicate_candidates FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## dataset_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| logical_dataset_id | uuid | Yes | `gen_random_uuid()` |
| version | integer | Yes | `—` |
| period_id | uuid | Yes | `—` |
| predecessor_id | uuid | No | `—` |
| currency_code | text | Yes | `—` |
| data_type | text | Yes | `—` |
| content_fingerprint | text | Yes | `—` |
| status | text | Yes | `'draft'::text` |
| complete_dataset | boolean | Yes | `false` |
| published_at | timestamp with time zone | No | `—` |
| published_by | uuid | No | `—` |
| idempotency_key | text | Yes | `—` |

Constraints:

- **dataset_versions_check**: `CHECK (status <> 'published'::text OR complete_dataset AND published_at IS NOT NULL AND published_by IS NOT NULL)`
- **dataset_versions_complete_dataset_not_null**: `NOT NULL complete_dataset`
- **dataset_versions_content_fingerprint_check**: `CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'::text)`
- **dataset_versions_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **dataset_versions_created_at_not_null**: `NOT NULL created_at`
- **dataset_versions_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **dataset_versions_currency_code_not_null**: `NOT NULL currency_code`
- **dataset_versions_data_type_not_null**: `NOT NULL data_type`
- **dataset_versions_entity_id_not_null**: `NOT NULL entity_id`
- **dataset_versions_id_not_null**: `NOT NULL id`
- **dataset_versions_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **dataset_versions_logical_dataset_id_not_null**: `NOT NULL logical_dataset_id`
- **dataset_versions_period_id_not_null**: `NOT NULL period_id`
- **dataset_versions_pkey**: `PRIMARY KEY (id)`
- **dataset_versions_published_by_fkey**: `FOREIGN KEY (published_by) REFERENCES mizan.app_users(id)`
- **dataset_versions_status_check**: `CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))`
- **dataset_versions_status_not_null**: `NOT NULL status`
- **dataset_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **dataset_versions_tenant_id_entity_id_id_currency_code_key**: `UNIQUE (tenant_id, entity_id, id, currency_code)`
- **dataset_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **dataset_versions_tenant_id_entity_id_idempotency_key_key**: `UNIQUE (tenant_id, entity_id, idempotency_key)`
- **dataset_versions_tenant_id_entity_id_logical_dataset_id_ver_key**: `UNIQUE (tenant_id, entity_id, logical_dataset_id, version)`
- **dataset_versions_tenant_id_entity_id_period_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, period_id) REFERENCES mizan.accounting_periods(tenant_id, entity_id, id)`
- **dataset_versions_tenant_id_entity_id_predecessor_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, predecessor_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **dataset_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **dataset_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **dataset_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **dataset_versions_version_check**: `CHECK (version > 0)`
- **dataset_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.dataset_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER period_open BEFORE INSERT OR UPDATE ON mizan.dataset_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_period_reference()`
- `CREATE TRIGGER published_dataset BEFORE INSERT OR DELETE OR UPDATE ON mizan.dataset_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset()`

## dataset_imports

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dataset_id | uuid | Yes | `—` |
| import_batch_id | uuid | Yes | `—` |

Constraints:

- **dataset_imports_created_at_not_null**: `NOT NULL created_at`
- **dataset_imports_dataset_id_not_null**: `NOT NULL dataset_id`
- **dataset_imports_entity_id_not_null**: `NOT NULL entity_id`
- **dataset_imports_id_not_null**: `NOT NULL id`
- **dataset_imports_import_batch_id_not_null**: `NOT NULL import_batch_id`
- **dataset_imports_pkey**: `PRIMARY KEY (id)`
- **dataset_imports_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **dataset_imports_tenant_id_entity_id_dataset_id_import_batch_key**: `UNIQUE (tenant_id, entity_id, dataset_id, import_batch_id)`
- **dataset_imports_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **dataset_imports_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **dataset_imports_tenant_id_entity_id_import_batch_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, import_batch_id) REFERENCES mizan.import_batches(tenant_id, entity_id, id)`
- **dataset_imports_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **dataset_imports_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **dataset_imports_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER dataset_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.dataset_imports FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('dataset_id')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.dataset_imports FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## dimensions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| code | text | Yes | `—` |
| name | text | Yes | `—` |
| dimension_type | text | Yes | `—` |

Constraints:

- **dimensions_code_not_null**: `NOT NULL code`
- **dimensions_created_at_not_null**: `NOT NULL created_at`
- **dimensions_dimension_type_not_null**: `NOT NULL dimension_type`
- **dimensions_entity_id_not_null**: `NOT NULL entity_id`
- **dimensions_id_not_null**: `NOT NULL id`
- **dimensions_name_not_null**: `NOT NULL name`
- **dimensions_pkey**: `PRIMARY KEY (id)`
- **dimensions_tenant_id_entity_id_code_key**: `UNIQUE (tenant_id, entity_id, code)`
- **dimensions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **dimensions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **dimensions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **dimensions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **dimensions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.dimensions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## dimension_values

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dimension_id | uuid | Yes | `—` |
| code | text | Yes | `—` |
| name | text | Yes | `—` |
| parent_id | uuid | No | `—` |

Constraints:

- **dimension_values_code_not_null**: `NOT NULL code`
- **dimension_values_created_at_not_null**: `NOT NULL created_at`
- **dimension_values_dimension_id_not_null**: `NOT NULL dimension_id`
- **dimension_values_entity_id_not_null**: `NOT NULL entity_id`
- **dimension_values_id_not_null**: `NOT NULL id`
- **dimension_values_name_not_null**: `NOT NULL name`
- **dimension_values_pkey**: `PRIMARY KEY (id)`
- **dimension_values_tenant_id_entity_id_dimension_id_code_key**: `UNIQUE (tenant_id, entity_id, dimension_id, code)`
- **dimension_values_tenant_id_entity_id_dimension_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dimension_id) REFERENCES mizan.dimensions(tenant_id, entity_id, id)`
- **dimension_values_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **dimension_values_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **dimension_values_tenant_id_entity_id_parent_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, parent_id) REFERENCES mizan.dimension_values(tenant_id, entity_id, id)`
- **dimension_values_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **dimension_values_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **dimension_values_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.dimension_values FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## ledger_entries

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dataset_id | uuid | Yes | `—` |
| source_row_id | uuid | Yes | `—` |
| account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| journal_reference | text | Yes | `—` |
| line_reference | text | Yes | `—` |
| posting_date | date | Yes | `—` |
| debit | mizan.exact_amount | Yes | `0` |
| credit | mizan.exact_amount | Yes | `0` |
| description_ciphertext | text | No | `—` |
| reversal_of_id | uuid | No | `—` |

Constraints:

- **ledger_entries_account_id_not_null**: `NOT NULL account_id`
- **ledger_entries_check**: `CHECK (debit::numeric = 0::numeric OR credit::numeric = 0::numeric)`
- **ledger_entries_created_at_not_null**: `NOT NULL created_at`
- **ledger_entries_credit_check**: `CHECK (credit::numeric >= 0::numeric)`
- **ledger_entries_credit_not_null**: `NOT NULL credit`
- **ledger_entries_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **ledger_entries_currency_code_not_null**: `NOT NULL currency_code`
- **ledger_entries_dataset_id_not_null**: `NOT NULL dataset_id`
- **ledger_entries_debit_check**: `CHECK (debit::numeric >= 0::numeric)`
- **ledger_entries_debit_not_null**: `NOT NULL debit`
- **ledger_entries_entity_id_not_null**: `NOT NULL entity_id`
- **ledger_entries_id_not_null**: `NOT NULL id`
- **ledger_entries_journal_reference_not_null**: `NOT NULL journal_reference`
- **ledger_entries_line_reference_not_null**: `NOT NULL line_reference`
- **ledger_entries_pkey**: `PRIMARY KEY (id)`
- **ledger_entries_posting_date_not_null**: `NOT NULL posting_date`
- **ledger_entries_source_row_id_not_null**: `NOT NULL source_row_id`
- **ledger_entries_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **ledger_entries_tenant_id_entity_id_dataset_id_currency_cod_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id, currency_code) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id, currency_code)`
- **ledger_entries_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **ledger_entries_tenant_id_entity_id_dataset_id_journal_refer_key**: `UNIQUE (tenant_id, entity_id, dataset_id, journal_reference, line_reference)`
- **ledger_entries_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **ledger_entries_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **ledger_entries_tenant_id_entity_id_reversal_of_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, reversal_of_id) REFERENCES mizan.ledger_entries(tenant_id, entity_id, id)`
- **ledger_entries_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **ledger_entries_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **ledger_entries_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **ledger_entries_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.ledger_entries FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('debit', 'credit')`
- `CREATE TRIGGER dataset_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.ledger_entries FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('dataset_id')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.ledger_entries FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_belongs_to_dataset BEFORE INSERT OR UPDATE ON mizan.ledger_entries FOR EACH ROW EXECUTE FUNCTION mizan.guard_same_parent_sources()`

## ledger_dimensions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| ledger_entry_id | uuid | Yes | `—` |
| dimension_value_id | uuid | Yes | `—` |

Constraints:

- **ledger_dimensions_created_at_not_null**: `NOT NULL created_at`
- **ledger_dimensions_dimension_value_id_not_null**: `NOT NULL dimension_value_id`
- **ledger_dimensions_entity_id_not_null**: `NOT NULL entity_id`
- **ledger_dimensions_id_not_null**: `NOT NULL id`
- **ledger_dimensions_ledger_entry_id_not_null**: `NOT NULL ledger_entry_id`
- **ledger_dimensions_pkey**: `PRIMARY KEY (id)`
- **ledger_dimensions_tenant_id_entity_id_dimension_value_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dimension_value_id) REFERENCES mizan.dimension_values(tenant_id, entity_id, id)`
- **ledger_dimensions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **ledger_dimensions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **ledger_dimensions_tenant_id_entity_id_ledger_entry_id_dimen_key**: `UNIQUE (tenant_id, entity_id, ledger_entry_id, dimension_value_id)`
- **ledger_dimensions_tenant_id_entity_id_ledger_entry_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, ledger_entry_id) REFERENCES mizan.ledger_entries(tenant_id, entity_id, id)`
- **ledger_dimensions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **ledger_dimensions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **ledger_dimensions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.ledger_dimensions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.ledger_dimensions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER ledger_dimensions_frozen BEFORE INSERT ON mizan.ledger_dimensions FOR EACH ROW EXECUTE FUNCTION mizan.guard_ledger_dimension()`

## trial_balance_rows

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dataset_id | uuid | Yes | `—` |
| source_row_id | uuid | Yes | `—` |
| account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| balance_type | text | Yes | `—` |
| opening_balance | mizan.exact_amount | No | `—` |
| debit_movement | mizan.exact_amount | No | `—` |
| credit_movement | mizan.exact_amount | No | `—` |
| closing_balance | mizan.exact_amount | Yes | `—` |

Constraints:

- **trial_balance_rows_account_id_not_null**: `NOT NULL account_id`
- **trial_balance_rows_balance_type_check**: `CHECK (balance_type = ANY (ARRAY['period'::text, 'year_to_date'::text, 'point_in_time'::text]))`
- **trial_balance_rows_balance_type_not_null**: `NOT NULL balance_type`
- **trial_balance_rows_check**: `CHECK (opening_balance IS NULL OR debit_movement IS NULL OR credit_movement IS NULL OR (opening_balance::numeric + debit_movement::numeric - credit_movement::numeric) = closing_balance::numeric)`
- **trial_balance_rows_closing_balance_not_null**: `NOT NULL closing_balance`
- **trial_balance_rows_created_at_not_null**: `NOT NULL created_at`
- **trial_balance_rows_credit_movement_check**: `CHECK (credit_movement::numeric >= 0::numeric)`
- **trial_balance_rows_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **trial_balance_rows_currency_code_not_null**: `NOT NULL currency_code`
- **trial_balance_rows_dataset_id_not_null**: `NOT NULL dataset_id`
- **trial_balance_rows_debit_movement_check**: `CHECK (debit_movement::numeric >= 0::numeric)`
- **trial_balance_rows_entity_id_not_null**: `NOT NULL entity_id`
- **trial_balance_rows_id_not_null**: `NOT NULL id`
- **trial_balance_rows_pkey**: `PRIMARY KEY (id)`
- **trial_balance_rows_source_row_id_not_null**: `NOT NULL source_row_id`
- **trial_balance_rows_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **trial_balance_rows_tenant_id_entity_id_dataset_id_account_i_key**: `UNIQUE (tenant_id, entity_id, dataset_id, account_id)`
- **trial_balance_rows_tenant_id_entity_id_dataset_id_currency_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id, currency_code) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id, currency_code)`
- **trial_balance_rows_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **trial_balance_rows_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **trial_balance_rows_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **trial_balance_rows_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **trial_balance_rows_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **trial_balance_rows_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **trial_balance_rows_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.trial_balance_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('opening_balance', 'debit_movement', 'credit_movement', 'closing_balance')`
- `CREATE TRIGGER dataset_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.trial_balance_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('dataset_id')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.trial_balance_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_belongs_to_dataset BEFORE INSERT OR UPDATE ON mizan.trial_balance_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_same_parent_sources()`

## report_line_items

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| code | text | Yes | `—` |
| name | text | Yes | `—` |
| statement_type | text | Yes | `—` |
| parent_id | uuid | No | `—` |
| display_order | integer | Yes | `0` |

Constraints:

- **report_line_items_code_not_null**: `NOT NULL code`
- **report_line_items_created_at_not_null**: `NOT NULL created_at`
- **report_line_items_display_order_not_null**: `NOT NULL display_order`
- **report_line_items_entity_id_not_null**: `NOT NULL entity_id`
- **report_line_items_id_not_null**: `NOT NULL id`
- **report_line_items_name_not_null**: `NOT NULL name`
- **report_line_items_pkey**: `PRIMARY KEY (id)`
- **report_line_items_statement_type_not_null**: `NOT NULL statement_type`
- **report_line_items_tenant_id_entity_id_code_key**: `UNIQUE (tenant_id, entity_id, code)`
- **report_line_items_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **report_line_items_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **report_line_items_tenant_id_entity_id_parent_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, parent_id) REFERENCES mizan.report_line_items(tenant_id, entity_id, id)`
- **report_line_items_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **report_line_items_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **report_line_items_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.report_line_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## mapping_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| logical_mapping_id | uuid | Yes | `gen_random_uuid()` |
| version | integer | Yes | `—` |
| predecessor_id | uuid | No | `—` |
| created_by | uuid | Yes | `—` |
| content_fingerprint | text | Yes | `—` |
| status | text | Yes | `'draft'::text` |
| published_at | timestamp with time zone | No | `—` |

Constraints:

- **mapping_versions_content_fingerprint_check**: `CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'::text)`
- **mapping_versions_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **mapping_versions_created_at_not_null**: `NOT NULL created_at`
- **mapping_versions_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **mapping_versions_created_by_not_null**: `NOT NULL created_by`
- **mapping_versions_entity_id_not_null**: `NOT NULL entity_id`
- **mapping_versions_id_not_null**: `NOT NULL id`
- **mapping_versions_logical_mapping_id_not_null**: `NOT NULL logical_mapping_id`
- **mapping_versions_pkey**: `PRIMARY KEY (id)`
- **mapping_versions_status_check**: `CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))`
- **mapping_versions_status_not_null**: `NOT NULL status`
- **mapping_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **mapping_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **mapping_versions_tenant_id_entity_id_logical_mapping_id_ver_key**: `UNIQUE (tenant_id, entity_id, logical_mapping_id, version)`
- **mapping_versions_tenant_id_entity_id_predecessor_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, predecessor_id) REFERENCES mizan.mapping_versions(tenant_id, entity_id, id)`
- **mapping_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **mapping_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **mapping_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **mapping_versions_version_check**: `CHECK (version > 0)`
- **mapping_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.mapping_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER published_mapping BEFORE INSERT OR DELETE OR UPDATE ON mizan.mapping_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_mapping()`

## account_mappings

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| mapping_version_id | uuid | Yes | `—` |
| account_id | uuid | Yes | `—` |
| line_item_id | uuid | Yes | `—` |
| weight | numeric | Yes | `—` |
| split_rule | text | No | `—` |

Constraints:

- **account_mappings_account_id_not_null**: `NOT NULL account_id`
- **account_mappings_created_at_not_null**: `NOT NULL created_at`
- **account_mappings_entity_id_not_null**: `NOT NULL entity_id`
- **account_mappings_id_not_null**: `NOT NULL id`
- **account_mappings_line_item_id_not_null**: `NOT NULL line_item_id`
- **account_mappings_mapping_version_id_not_null**: `NOT NULL mapping_version_id`
- **account_mappings_pkey**: `PRIMARY KEY (id)`
- **account_mappings_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **account_mappings_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **account_mappings_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **account_mappings_tenant_id_entity_id_line_item_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, line_item_id) REFERENCES mizan.report_line_items(tenant_id, entity_id, id)`
- **account_mappings_tenant_id_entity_id_mapping_version_id_acc_key**: `UNIQUE (tenant_id, entity_id, mapping_version_id, account_id, line_item_id)`
- **account_mappings_tenant_id_entity_id_mapping_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, mapping_version_id) REFERENCES mizan.mapping_versions(tenant_id, entity_id, id)`
- **account_mappings_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **account_mappings_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **account_mappings_tenant_id_not_null**: `NOT NULL tenant_id`
- **account_mappings_weight_check**: `CHECK (weight > 0::numeric AND weight <= 1::numeric)`
- **account_mappings_weight_not_null**: `NOT NULL weight`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.account_mappings FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER mapping_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.account_mappings FOR EACH ROW EXECUTE FUNCTION mizan.guard_mapping_child()`

## formula_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| formula_code | text | Yes | `—` |
| version | integer | Yes | `—` |
| name | text | Yes | `—` |
| expression | text | Yes | `—` |
| required_inputs | jsonb | Yes | `'{}'::jsonb` |
| unit | text | Yes | `—` |
| limitations | text | Yes | `—` |
| approved_by | uuid | No | `—` |
| approved_at | timestamp with time zone | No | `—` |

Constraints:

- **formula_versions_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **formula_versions_created_at_not_null**: `NOT NULL created_at`
- **formula_versions_entity_id_not_null**: `NOT NULL entity_id`
- **formula_versions_expression_not_null**: `NOT NULL expression`
- **formula_versions_formula_code_not_null**: `NOT NULL formula_code`
- **formula_versions_id_not_null**: `NOT NULL id`
- **formula_versions_limitations_not_null**: `NOT NULL limitations`
- **formula_versions_name_not_null**: `NOT NULL name`
- **formula_versions_pkey**: `PRIMARY KEY (id)`
- **formula_versions_required_inputs_check**: `CHECK (jsonb_typeof(required_inputs) = 'object'::text)`
- **formula_versions_required_inputs_not_null**: `NOT NULL required_inputs`
- **formula_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **formula_versions_tenant_id_entity_id_formula_code_version_key**: `UNIQUE (tenant_id, entity_id, formula_code, version)`
- **formula_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **formula_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **formula_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **formula_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **formula_versions_unit_not_null**: `NOT NULL unit`
- **formula_versions_version_check**: `CHECK (version > 0)`
- **formula_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.formula_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.formula_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## exception_rule_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| rule_code | text | Yes | `—` |
| version | integer | Yes | `—` |
| definition | jsonb | Yes | `'{}'::jsonb` |
| explanation_template | text | Yes | `—` |
| approved_by | uuid | No | `—` |
| approved_at | timestamp with time zone | No | `—` |

Constraints:

- **exception_rule_versions_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **exception_rule_versions_created_at_not_null**: `NOT NULL created_at`
- **exception_rule_versions_definition_check**: `CHECK (jsonb_typeof(definition) = 'object'::text)`
- **exception_rule_versions_definition_not_null**: `NOT NULL definition`
- **exception_rule_versions_entity_id_not_null**: `NOT NULL entity_id`
- **exception_rule_versions_explanation_template_not_null**: `NOT NULL explanation_template`
- **exception_rule_versions_id_not_null**: `NOT NULL id`
- **exception_rule_versions_pkey**: `PRIMARY KEY (id)`
- **exception_rule_versions_rule_code_not_null**: `NOT NULL rule_code`
- **exception_rule_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **exception_rule_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **exception_rule_versions_tenant_id_entity_id_rule_code_versi_key**: `UNIQUE (tenant_id, entity_id, rule_code, version)`
- **exception_rule_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **exception_rule_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **exception_rule_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **exception_rule_versions_version_check**: `CHECK (version > 0)`
- **exception_rule_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.exception_rule_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.exception_rule_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## matching_rule_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| rule_code | text | Yes | `—` |
| version | integer | Yes | `—` |
| priority | integer | Yes | `—` |
| date_basis | text | Yes | `—` |
| date_window_days | integer | Yes | `—` |
| amount_tolerance | mizan.exact_amount | Yes | `—` |
| group_size_limit | integer | Yes | `—` |
| group_date_window_days | integer | Yes | `—` |
| auto_confirm | boolean | Yes | `false` |
| conditions | jsonb | Yes | `'{}'::jsonb` |
| approved_by | uuid | No | `—` |
| approved_at | timestamp with time zone | No | `—` |

Constraints:

- **matching_rule_versions_amount_tolerance_check**: `CHECK (amount_tolerance::numeric >= 0::numeric)`
- **matching_rule_versions_amount_tolerance_not_null**: `NOT NULL amount_tolerance`
- **matching_rule_versions_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **matching_rule_versions_auto_confirm_not_null**: `NOT NULL auto_confirm`
- **matching_rule_versions_check**: `CHECK (NOT auto_confirm OR amount_tolerance::numeric = 0::numeric AND approved_by IS NOT NULL AND approved_at IS NOT NULL)`
- **matching_rule_versions_conditions_check**: `CHECK (jsonb_typeof(conditions) = 'object'::text)`
- **matching_rule_versions_conditions_not_null**: `NOT NULL conditions`
- **matching_rule_versions_created_at_not_null**: `NOT NULL created_at`
- **matching_rule_versions_date_basis_check**: `CHECK (date_basis = ANY (ARRAY['posting_date'::text, 'value_date'::text]))`
- **matching_rule_versions_date_basis_not_null**: `NOT NULL date_basis`
- **matching_rule_versions_date_window_days_check**: `CHECK (date_window_days >= 0)`
- **matching_rule_versions_date_window_days_not_null**: `NOT NULL date_window_days`
- **matching_rule_versions_entity_id_not_null**: `NOT NULL entity_id`
- **matching_rule_versions_group_date_window_days_check**: `CHECK (group_date_window_days >= 0)`
- **matching_rule_versions_group_date_window_days_not_null**: `NOT NULL group_date_window_days`
- **matching_rule_versions_group_size_limit_check**: `CHECK (group_size_limit > 0)`
- **matching_rule_versions_group_size_limit_not_null**: `NOT NULL group_size_limit`
- **matching_rule_versions_id_not_null**: `NOT NULL id`
- **matching_rule_versions_pkey**: `PRIMARY KEY (id)`
- **matching_rule_versions_priority_not_null**: `NOT NULL priority`
- **matching_rule_versions_rule_code_not_null**: `NOT NULL rule_code`
- **matching_rule_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **matching_rule_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **matching_rule_versions_tenant_id_entity_id_rule_code_versio_key**: `UNIQUE (tenant_id, entity_id, rule_code, version)`
- **matching_rule_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **matching_rule_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **matching_rule_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **matching_rule_versions_version_check**: `CHECK (version > 0)`
- **matching_rule_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.matching_rule_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.matching_rule_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## exchange_rates

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| base_currency | text | Yes | `—` |
| quote_currency | text | Yes | `—` |
| rate_date | date | Yes | `—` |
| rate | numeric | Yes | `—` |
| rate_source | text | Yes | `—` |
| policy_version_id | uuid | Yes | `—` |
| approved_by | uuid | Yes | `—` |

Constraints:

- **exchange_rates_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **exchange_rates_approved_by_not_null**: `NOT NULL approved_by`
- **exchange_rates_base_currency_fkey**: `FOREIGN KEY (base_currency) REFERENCES mizan.currencies(code)`
- **exchange_rates_base_currency_not_null**: `NOT NULL base_currency`
- **exchange_rates_check**: `CHECK (base_currency <> quote_currency)`
- **exchange_rates_created_at_not_null**: `NOT NULL created_at`
- **exchange_rates_entity_id_not_null**: `NOT NULL entity_id`
- **exchange_rates_id_not_null**: `NOT NULL id`
- **exchange_rates_pkey**: `PRIMARY KEY (id)`
- **exchange_rates_policy_version_id_not_null**: `NOT NULL policy_version_id`
- **exchange_rates_quote_currency_fkey**: `FOREIGN KEY (quote_currency) REFERENCES mizan.currencies(code)`
- **exchange_rates_quote_currency_not_null**: `NOT NULL quote_currency`
- **exchange_rates_rate_check**: `CHECK (rate > 0::numeric AND rate < '1000000000000000000'::numeric AND scale(rate) <= 18)`
- **exchange_rates_rate_date_not_null**: `NOT NULL rate_date`
- **exchange_rates_rate_not_null**: `NOT NULL rate`
- **exchange_rates_rate_source_not_null**: `NOT NULL rate_source`
- **exchange_rates_tenant_id_entity_id_base_currency_quote_curr_key**: `UNIQUE (tenant_id, entity_id, base_currency, quote_currency, rate_date, rate_source, policy_version_id)`
- **exchange_rates_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **exchange_rates_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **exchange_rates_tenant_id_entity_id_policy_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, policy_version_id) REFERENCES mizan.entity_settings_versions(tenant_id, entity_id, id)`
- **exchange_rates_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **exchange_rates_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **exchange_rates_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.exchange_rates FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.exchange_rates FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## output_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| logical_output_id | uuid | Yes | `gen_random_uuid()` |
| version | integer | Yes | `—` |
| predecessor_id | uuid | No | `—` |
| reopen_reason | text | No | `—` |
| output_type | text | Yes | `—` |
| period_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| settings_version_id | uuid | Yes | `—` |
| mapping_version_id | uuid | No | `—` |
| preparer_id | uuid | Yes | `—` |
| content_fingerprint | text | Yes | `—` |
| status | text | Yes | `'draft'::text` |
| submitted_fingerprint | text | No | `—` |
| submitted_at | timestamp with time zone | No | `—` |
| locked_at | timestamp with time zone | No | `—` |

Constraints:

- **output_reopening_reason_required**: `CHECK (predecessor_id IS NULL OR reopen_reason IS NOT NULL AND length(TRIM(BOTH FROM reopen_reason)) > 0)`
- **output_versions_check**: `CHECK (predecessor_id IS NULL OR length(TRIM(BOTH FROM reopen_reason)) > 0)`
- **output_versions_check1**: `CHECK ((status <> ALL (ARRAY['under_review'::text, 'approved_locked'::text])) OR submitted_fingerprint = content_fingerprint AND submitted_at IS NOT NULL)`
- **output_versions_check2**: `CHECK (status <> 'approved_locked'::text OR locked_at IS NOT NULL)`
- **output_versions_content_fingerprint_check**: `CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'::text)`
- **output_versions_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **output_versions_created_at_not_null**: `NOT NULL created_at`
- **output_versions_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **output_versions_currency_code_not_null**: `NOT NULL currency_code`
- **output_versions_entity_id_not_null**: `NOT NULL entity_id`
- **output_versions_id_not_null**: `NOT NULL id`
- **output_versions_logical_output_id_not_null**: `NOT NULL logical_output_id`
- **output_versions_output_type_check**: `CHECK (output_type = ANY (ARRAY['income_statement'::text, 'financial_position'::text, 'cash_flows'::text, 'analysis'::text, 'reconciliation'::text, 'executive_pack'::text]))`
- **output_versions_output_type_not_null**: `NOT NULL output_type`
- **output_versions_period_id_not_null**: `NOT NULL period_id`
- **output_versions_pkey**: `PRIMARY KEY (id)`
- **output_versions_preparer_id_fkey**: `FOREIGN KEY (preparer_id) REFERENCES mizan.app_users(id)`
- **output_versions_preparer_id_not_null**: `NOT NULL preparer_id`
- **output_versions_settings_version_id_not_null**: `NOT NULL settings_version_id`
- **output_versions_status_check**: `CHECK (status = ANY (ARRAY['draft'::text, 'ready_for_review'::text, 'under_review'::text, 'rejected'::text, 'withdrawn'::text, 'approved_locked'::text]))`
- **output_versions_status_not_null**: `NOT NULL status`
- **output_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **output_versions_tenant_id_entity_id_id_currency_code_key**: `UNIQUE (tenant_id, entity_id, id, currency_code)`
- **output_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **output_versions_tenant_id_entity_id_logical_output_id_versi_key**: `UNIQUE (tenant_id, entity_id, logical_output_id, version)`
- **output_versions_tenant_id_entity_id_mapping_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, mapping_version_id) REFERENCES mizan.mapping_versions(tenant_id, entity_id, id)`
- **output_versions_tenant_id_entity_id_period_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, period_id) REFERENCES mizan.accounting_periods(tenant_id, entity_id, id)`
- **output_versions_tenant_id_entity_id_predecessor_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, predecessor_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **output_versions_tenant_id_entity_id_settings_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, settings_version_id) REFERENCES mizan.entity_settings_versions(tenant_id, entity_id, id)`
- **output_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **output_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **output_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **output_versions_version_check**: `CHECK (version > 0)`
- **output_versions_version_not_null**: `NOT NULL version`
- **submitted_fingerprint_required**: `CHECK ((status <> ALL (ARRAY['under_review'::text, 'approved_locked'::text])) OR submitted_fingerprint IS NOT NULL AND submitted_fingerprint = content_fingerprint AND submitted_at IS NOT NULL)`

Triggers:

- `CREATE TRIGGER documented_review_transition BEFORE UPDATE ON mizan.output_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_review_transition()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.output_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_version_guard BEFORE INSERT OR DELETE OR UPDATE ON mizan.output_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_output()`
- `CREATE TRIGGER period_open BEFORE INSERT OR UPDATE ON mizan.output_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_period_reference()`

## output_datasets

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| dataset_id | uuid | Yes | `—` |
| source_role | text | Yes | `—` |

Constraints:

- **output_datasets_created_at_not_null**: `NOT NULL created_at`
- **output_datasets_dataset_id_not_null**: `NOT NULL dataset_id`
- **output_datasets_entity_id_not_null**: `NOT NULL entity_id`
- **output_datasets_id_not_null**: `NOT NULL id`
- **output_datasets_output_version_id_not_null**: `NOT NULL output_version_id`
- **output_datasets_pkey**: `PRIMARY KEY (id)`
- **output_datasets_source_role_check**: `CHECK (source_role = ANY (ARRAY['primary'::text, 'comparative'::text, 'opening'::text, 'supplemental'::text, 'bank'::text, 'books'::text]))`
- **output_datasets_source_role_not_null**: `NOT NULL source_role`
- **output_datasets_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **output_datasets_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **output_datasets_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **output_datasets_tenant_id_entity_id_output_version_id_datas_key**: `UNIQUE (tenant_id, entity_id, output_version_id, dataset_id, source_role)`
- **output_datasets_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **output_datasets_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **output_datasets_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **output_datasets_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.output_datasets FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.output_datasets FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## report_lines

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| line_item_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| value | mizan.exact_amount | No | `—` |
| value_state | text | Yes | `—` |
| unavailable_reason | text | No | `—` |
| formula_version_id | uuid | No | `—` |
| display_order | integer | Yes | `0` |

Constraints:

- **report_lines_check**: `CHECK (value_state = 'available'::text AND value IS NOT NULL OR value_state <> 'available'::text AND value IS NULL AND unavailable_reason IS NOT NULL)`
- **report_lines_created_at_not_null**: `NOT NULL created_at`
- **report_lines_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **report_lines_currency_code_not_null**: `NOT NULL currency_code`
- **report_lines_display_order_not_null**: `NOT NULL display_order`
- **report_lines_entity_id_not_null**: `NOT NULL entity_id`
- **report_lines_id_not_null**: `NOT NULL id`
- **report_lines_line_item_id_not_null**: `NOT NULL line_item_id`
- **report_lines_output_version_id_not_null**: `NOT NULL output_version_id`
- **report_lines_pkey**: `PRIMARY KEY (id)`
- **report_lines_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **report_lines_tenant_id_entity_id_formula_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, formula_version_id) REFERENCES mizan.formula_versions(tenant_id, entity_id, id)`
- **report_lines_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **report_lines_tenant_id_entity_id_line_item_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, line_item_id) REFERENCES mizan.report_line_items(tenant_id, entity_id, id)`
- **report_lines_tenant_id_entity_id_output_version_id_currenc_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id, currency_code) REFERENCES mizan.output_versions(tenant_id, entity_id, id, currency_code)`
- **report_lines_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **report_lines_tenant_id_entity_id_output_version_id_line_ite_key**: `UNIQUE (tenant_id, entity_id, output_version_id, line_item_id)`
- **report_lines_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **report_lines_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **report_lines_tenant_id_not_null**: `NOT NULL tenant_id`
- **report_lines_value_state_check**: `CHECK (value_state = ANY (ARRAY['available'::text, 'missing'::text, 'not_applicable'::text]))`
- **report_lines_value_state_not_null**: `NOT NULL value_state`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.report_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('value')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.report_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.report_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## report_line_sources

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| report_line_id | uuid | Yes | `—` |
| source_row_id | uuid | Yes | `—` |
| account_id | uuid | No | `—` |
| contribution | mizan.exact_amount | No | `—` |
| transformation_id | uuid | No | `—` |

Constraints:

- **report_line_sources_created_at_not_null**: `NOT NULL created_at`
- **report_line_sources_entity_id_not_null**: `NOT NULL entity_id`
- **report_line_sources_id_not_null**: `NOT NULL id`
- **report_line_sources_pkey**: `PRIMARY KEY (id)`
- **report_line_sources_report_line_id_not_null**: `NOT NULL report_line_id`
- **report_line_sources_source_row_id_not_null**: `NOT NULL source_row_id`
- **report_line_sources_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **report_line_sources_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **report_line_sources_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **report_line_sources_tenant_id_entity_id_report_line_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, report_line_id) REFERENCES mizan.report_lines(tenant_id, entity_id, id)`
- **report_line_sources_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **report_line_sources_tenant_id_entity_id_transformation_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, transformation_id) REFERENCES mizan.row_transformations(tenant_id, entity_id, id)`
- **report_line_sources_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **report_line_sources_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **report_line_sources_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.report_line_sources FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.report_line_sources FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER line_sources_frozen BEFORE INSERT ON mizan.report_line_sources FOR EACH ROW EXECUTE FUNCTION mizan.guard_line_source()`

## metric_results

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| formula_version_id | uuid | Yes | `—` |
| value | numeric | No | `—` |
| value_state | text | Yes | `—` |
| unavailable_reason | text | No | `—` |
| input_references | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **metric_results_check**: `CHECK (value_state = 'available'::text AND value IS NOT NULL OR value_state <> 'available'::text AND value IS NULL AND unavailable_reason IS NOT NULL)`
- **metric_results_created_at_not_null**: `NOT NULL created_at`
- **metric_results_entity_id_not_null**: `NOT NULL entity_id`
- **metric_results_formula_version_id_not_null**: `NOT NULL formula_version_id`
- **metric_results_id_not_null**: `NOT NULL id`
- **metric_results_input_references_check**: `CHECK (jsonb_typeof(input_references) = 'object'::text)`
- **metric_results_input_references_not_null**: `NOT NULL input_references`
- **metric_results_output_version_id_not_null**: `NOT NULL output_version_id`
- **metric_results_pkey**: `PRIMARY KEY (id)`
- **metric_results_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **metric_results_tenant_id_entity_id_formula_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, formula_version_id) REFERENCES mizan.formula_versions(tenant_id, entity_id, id)`
- **metric_results_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **metric_results_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **metric_results_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **metric_results_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **metric_results_tenant_id_not_null**: `NOT NULL tenant_id`
- **metric_results_value_check**: `CHECK (value::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))`
- **metric_results_value_state_check**: `CHECK (value_state = ANY (ARRAY['available'::text, 'missing'::text, 'not_applicable'::text]))`
- **metric_results_value_state_not_null**: `NOT NULL value_state`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.metric_results FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.metric_results FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## exception_results

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| rule_version_id | uuid | Yes | `—` |
| severity | text | Yes | `—` |
| explanation | text | Yes | `—` |
| affected_sources | jsonb | Yes | `'{}'::jsonb` |
| resolved_by | uuid | No | `—` |
| resolution_reason | text | No | `—` |

Constraints:

- **exception_results_affected_sources_check**: `CHECK (jsonb_typeof(affected_sources) = 'object'::text)`
- **exception_results_affected_sources_not_null**: `NOT NULL affected_sources`
- **exception_results_created_at_not_null**: `NOT NULL created_at`
- **exception_results_entity_id_not_null**: `NOT NULL entity_id`
- **exception_results_explanation_not_null**: `NOT NULL explanation`
- **exception_results_id_not_null**: `NOT NULL id`
- **exception_results_output_version_id_not_null**: `NOT NULL output_version_id`
- **exception_results_pkey**: `PRIMARY KEY (id)`
- **exception_results_resolved_by_fkey**: `FOREIGN KEY (resolved_by) REFERENCES mizan.app_users(id)`
- **exception_results_rule_version_id_not_null**: `NOT NULL rule_version_id`
- **exception_results_severity_not_null**: `NOT NULL severity`
- **exception_results_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **exception_results_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **exception_results_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **exception_results_tenant_id_entity_id_rule_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, rule_version_id) REFERENCES mizan.exception_rule_versions(tenant_id, entity_id, id)`
- **exception_results_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **exception_results_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **exception_results_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.exception_results FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.exception_results FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## analysis_narratives

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| narrative_type | text | Yes | `—` |
| text_content | text | Yes | `—` |
| metric_result_id | uuid | No | `—` |
| model_run_id | uuid | No | `—` |

Constraints:

- **analysis_narratives_created_at_not_null**: `NOT NULL created_at`
- **analysis_narratives_entity_id_not_null**: `NOT NULL entity_id`
- **analysis_narratives_id_not_null**: `NOT NULL id`
- **analysis_narratives_narrative_type_check**: `CHECK (narrative_type = ANY (ARRAY['rule_based'::text, 'ai_assisted'::text]))`
- **analysis_narratives_narrative_type_not_null**: `NOT NULL narrative_type`
- **analysis_narratives_output_version_id_not_null**: `NOT NULL output_version_id`
- **analysis_narratives_pkey**: `PRIMARY KEY (id)`
- **analysis_narratives_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **analysis_narratives_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **analysis_narratives_tenant_id_entity_id_metric_result_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, metric_result_id) REFERENCES mizan.metric_results(tenant_id, entity_id, id)`
- **analysis_narratives_tenant_id_entity_id_model_run_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, model_run_id) REFERENCES mizan.ai_narrative_runs(tenant_id, entity_id, id)`
- **analysis_narratives_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **analysis_narratives_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **analysis_narratives_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **analysis_narratives_tenant_id_not_null**: `NOT NULL tenant_id`
- **analysis_narratives_text_content_not_null**: `NOT NULL text_content`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.analysis_narratives FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.analysis_narratives FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## validation_results

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| validated_fingerprint | text | Yes | `—` |
| code | text | Yes | `—` |
| severity | text | Yes | `—` |
| passed | boolean | Yes | `—` |
| message | text | Yes | `—` |
| evidence | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **validation_results_code_not_null**: `NOT NULL code`
- **validation_results_created_at_not_null**: `NOT NULL created_at`
- **validation_results_entity_id_not_null**: `NOT NULL entity_id`
- **validation_results_evidence_check**: `CHECK (jsonb_typeof(evidence) = 'object'::text)`
- **validation_results_evidence_not_null**: `NOT NULL evidence`
- **validation_results_id_not_null**: `NOT NULL id`
- **validation_results_message_not_null**: `NOT NULL message`
- **validation_results_output_version_id_not_null**: `NOT NULL output_version_id`
- **validation_results_passed_not_null**: `NOT NULL passed`
- **validation_results_pkey**: `PRIMARY KEY (id)`
- **validation_results_severity_check**: `CHECK (severity = ANY (ARRAY['blocking'::text, 'warning'::text, 'info'::text]))`
- **validation_results_severity_not_null**: `NOT NULL severity`
- **validation_results_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **validation_results_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **validation_results_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **validation_results_tenant_id_entity_id_output_version_id_va_key**: `UNIQUE (tenant_id, entity_id, output_version_id, validated_fingerprint, code)`
- **validation_results_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **validation_results_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **validation_results_tenant_id_not_null**: `NOT NULL tenant_id`
- **validation_results_validated_fingerprint_not_null**: `NOT NULL validated_fingerprint`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.validation_results FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.validation_results FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## budget_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| logical_budget_id | uuid | Yes | `gen_random_uuid()` |
| version | integer | Yes | `—` |
| period_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| name | text | Yes | `—` |
| content_fingerprint | text | Yes | `—` |

Constraints:

- **budget_versions_content_fingerprint_check**: `CHECK (content_fingerprint ~ '^[0-9a-f]{64}$'::text)`
- **budget_versions_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **budget_versions_created_at_not_null**: `NOT NULL created_at`
- **budget_versions_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **budget_versions_currency_code_not_null**: `NOT NULL currency_code`
- **budget_versions_entity_id_not_null**: `NOT NULL entity_id`
- **budget_versions_id_not_null**: `NOT NULL id`
- **budget_versions_logical_budget_id_not_null**: `NOT NULL logical_budget_id`
- **budget_versions_name_not_null**: `NOT NULL name`
- **budget_versions_period_id_not_null**: `NOT NULL period_id`
- **budget_versions_pkey**: `PRIMARY KEY (id)`
- **budget_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **budget_versions_tenant_id_entity_id_id_currency_code_key**: `UNIQUE (tenant_id, entity_id, id, currency_code)`
- **budget_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **budget_versions_tenant_id_entity_id_logical_budget_id_versi_key**: `UNIQUE (tenant_id, entity_id, logical_budget_id, version)`
- **budget_versions_tenant_id_entity_id_period_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, period_id) REFERENCES mizan.accounting_periods(tenant_id, entity_id, id)`
- **budget_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **budget_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **budget_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **budget_versions_version_check**: `CHECK (version > 0)`
- **budget_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER period_open BEFORE INSERT OR UPDATE ON mizan.budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_period_reference()`

## budget_lines

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| budget_version_id | uuid | Yes | `—` |
| account_id | uuid | Yes | `—` |
| dimension_value_id | uuid | No | `—` |
| currency_code | text | Yes | `—` |
| amount | mizan.exact_amount | Yes | `—` |

Constraints:

- **budget_lines_account_id_not_null**: `NOT NULL account_id`
- **budget_lines_amount_not_null**: `NOT NULL amount`
- **budget_lines_budget_version_id_not_null**: `NOT NULL budget_version_id`
- **budget_lines_created_at_not_null**: `NOT NULL created_at`
- **budget_lines_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **budget_lines_currency_code_not_null**: `NOT NULL currency_code`
- **budget_lines_entity_id_not_null**: `NOT NULL entity_id`
- **budget_lines_id_not_null**: `NOT NULL id`
- **budget_lines_pkey**: `PRIMARY KEY (id)`
- **budget_lines_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **budget_lines_tenant_id_entity_id_budget_version_id_currenc_fkey**: `FOREIGN KEY (tenant_id, entity_id, budget_version_id, currency_code) REFERENCES mizan.budget_versions(tenant_id, entity_id, id, currency_code)`
- **budget_lines_tenant_id_entity_id_budget_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, budget_version_id) REFERENCES mizan.budget_versions(tenant_id, entity_id, id)`
- **budget_lines_tenant_id_entity_id_dimension_value_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dimension_value_id) REFERENCES mizan.dimension_values(tenant_id, entity_id, id)`
- **budget_lines_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **budget_lines_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **budget_lines_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **budget_lines_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **budget_lines_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.budget_lines FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER budget_binding_frozen BEFORE INSERT ON mizan.budget_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_bound_budget()`
- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.budget_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('amount')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.budget_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## trade_items

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dataset_id | uuid | Yes | `—` |
| source_row_id | uuid | Yes | `—` |
| account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| external_id | text | Yes | `—` |
| kind | text | Yes | `—` |
| party_ciphertext | text | Yes | `—` |
| invoice_date | date | Yes | `—` |
| due_date | date | Yes | `—` |
| amount | mizan.exact_amount | Yes | `—` |
| as_of_date | date | Yes | `—` |

Constraints:

- **trade_items_account_id_not_null**: `NOT NULL account_id`
- **trade_items_amount_check**: `CHECK (amount::numeric >= 0::numeric)`
- **trade_items_amount_not_null**: `NOT NULL amount`
- **trade_items_as_of_date_not_null**: `NOT NULL as_of_date`
- **trade_items_check**: `CHECK (due_date >= invoice_date)`
- **trade_items_created_at_not_null**: `NOT NULL created_at`
- **trade_items_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **trade_items_currency_code_not_null**: `NOT NULL currency_code`
- **trade_items_dataset_id_not_null**: `NOT NULL dataset_id`
- **trade_items_due_date_not_null**: `NOT NULL due_date`
- **trade_items_entity_id_not_null**: `NOT NULL entity_id`
- **trade_items_external_id_not_null**: `NOT NULL external_id`
- **trade_items_id_not_null**: `NOT NULL id`
- **trade_items_invoice_date_not_null**: `NOT NULL invoice_date`
- **trade_items_kind_check**: `CHECK (kind = ANY (ARRAY['receivable'::text, 'payable'::text]))`
- **trade_items_kind_not_null**: `NOT NULL kind`
- **trade_items_party_ciphertext_not_null**: `NOT NULL party_ciphertext`
- **trade_items_pkey**: `PRIMARY KEY (id)`
- **trade_items_source_row_id_not_null**: `NOT NULL source_row_id`
- **trade_items_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **trade_items_tenant_id_entity_id_dataset_id_external_id_key**: `UNIQUE (tenant_id, entity_id, dataset_id, external_id)`
- **trade_items_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **trade_items_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **trade_items_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **trade_items_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **trade_items_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **trade_items_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **trade_items_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.trade_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('amount')`
- `CREATE TRIGGER dataset_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.trade_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('dataset_id')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.trade_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_belongs_to_dataset BEFORE INSERT OR UPDATE ON mizan.trade_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_same_parent_sources()`

## trade_settlements

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| trade_item_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| settlement_date | date | Yes | `—` |
| amount | mizan.exact_amount | Yes | `—` |
| source_row_id | uuid | Yes | `—` |

Constraints:

- **trade_settlements_amount_check**: `CHECK (amount::numeric > 0::numeric)`
- **trade_settlements_amount_not_null**: `NOT NULL amount`
- **trade_settlements_created_at_not_null**: `NOT NULL created_at`
- **trade_settlements_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **trade_settlements_currency_code_not_null**: `NOT NULL currency_code`
- **trade_settlements_entity_id_not_null**: `NOT NULL entity_id`
- **trade_settlements_id_not_null**: `NOT NULL id`
- **trade_settlements_pkey**: `PRIMARY KEY (id)`
- **trade_settlements_settlement_date_not_null**: `NOT NULL settlement_date`
- **trade_settlements_source_row_id_not_null**: `NOT NULL source_row_id`
- **trade_settlements_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **trade_settlements_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **trade_settlements_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **trade_settlements_tenant_id_entity_id_trade_item_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, trade_item_id) REFERENCES mizan.trade_items(tenant_id, entity_id, id)`
- **trade_settlements_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **trade_settlements_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **trade_settlements_tenant_id_not_null**: `NOT NULL tenant_id`
- **trade_settlements_trade_item_id_not_null**: `NOT NULL trade_item_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.trade_settlements FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.trade_settlements FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('amount')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.trade_settlements FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER trade_settlement_guard BEFORE INSERT ON mizan.trade_settlements FOR EACH ROW EXECUTE FUNCTION mizan.guard_trade_settlement()`

## planning_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| period_id | uuid | Yes | `—` |
| version | integer | Yes | `—` |
| scenario_assumptions | jsonb | Yes | `'{}'::jsonb` |
| supplemental_inputs | jsonb | Yes | `'{}'::jsonb` |
| management_notes | text | Yes | `''::text` |
| created_by | uuid | Yes | `—` |

Constraints:

- **planning_versions_created_at_not_null**: `NOT NULL created_at`
- **planning_versions_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **planning_versions_created_by_not_null**: `NOT NULL created_by`
- **planning_versions_entity_id_not_null**: `NOT NULL entity_id`
- **planning_versions_id_not_null**: `NOT NULL id`
- **planning_versions_management_notes_not_null**: `NOT NULL management_notes`
- **planning_versions_period_id_not_null**: `NOT NULL period_id`
- **planning_versions_pkey**: `PRIMARY KEY (id)`
- **planning_versions_scenario_assumptions_check**: `CHECK (jsonb_typeof(scenario_assumptions) = 'object'::text)`
- **planning_versions_scenario_assumptions_not_null**: `NOT NULL scenario_assumptions`
- **planning_versions_supplemental_inputs_check**: `CHECK (jsonb_typeof(supplemental_inputs) = 'object'::text)`
- **planning_versions_supplemental_inputs_not_null**: `NOT NULL supplemental_inputs`
- **planning_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **planning_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **planning_versions_tenant_id_entity_id_period_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, period_id) REFERENCES mizan.accounting_periods(tenant_id, entity_id, id)`
- **planning_versions_tenant_id_entity_id_period_id_version_key**: `UNIQUE (tenant_id, entity_id, period_id, version)`
- **planning_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **planning_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **planning_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **planning_versions_version_check**: `CHECK (version > 0)`
- **planning_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.planning_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.planning_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER period_open BEFORE INSERT OR UPDATE ON mizan.planning_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_period_reference()`

## bank_transactions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dataset_id | uuid | Yes | `—` |
| source_row_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| posting_date | date | Yes | `—` |
| value_date | date | No | `—` |
| reference_ciphertext | text | No | `—` |
| reference_hash | text | No | `—` |
| description_ciphertext | text | No | `—` |
| signed_amount | mizan.exact_amount | Yes | `—` |
| running_balance | mizan.exact_amount | No | `—` |
| reversal_of_id | uuid | No | `—` |

Constraints:

- **bank_transactions_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **bank_transactions_created_at_not_null**: `NOT NULL created_at`
- **bank_transactions_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **bank_transactions_currency_code_not_null**: `NOT NULL currency_code`
- **bank_transactions_dataset_id_not_null**: `NOT NULL dataset_id`
- **bank_transactions_entity_id_not_null**: `NOT NULL entity_id`
- **bank_transactions_id_not_null**: `NOT NULL id`
- **bank_transactions_pkey**: `PRIMARY KEY (id)`
- **bank_transactions_posting_date_not_null**: `NOT NULL posting_date`
- **bank_transactions_signed_amount_check**: `CHECK (signed_amount::numeric <> 0::numeric)`
- **bank_transactions_signed_amount_not_null**: `NOT NULL signed_amount`
- **bank_transactions_source_row_id_not_null**: `NOT NULL source_row_id`
- **bank_transactions_tenant_id_entity_id_bank_account_id_curr_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_account_id, currency_code) REFERENCES mizan.bank_accounts(tenant_id, entity_id, id, currency_code)`
- **bank_transactions_tenant_id_entity_id_dataset_id_currency__fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id, currency_code) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id, currency_code)`
- **bank_transactions_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **bank_transactions_tenant_id_entity_id_dataset_id_source_row_key**: `UNIQUE (tenant_id, entity_id, dataset_id, source_row_id)`
- **bank_transactions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **bank_transactions_tenant_id_entity_id_id_bank_account_id_cu_key**: `UNIQUE (tenant_id, entity_id, id, bank_account_id, currency_code)`
- **bank_transactions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **bank_transactions_tenant_id_entity_id_reversal_of_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, reversal_of_id) REFERENCES mizan.bank_transactions(tenant_id, entity_id, id)`
- **bank_transactions_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **bank_transactions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **bank_transactions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **bank_transactions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.bank_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('signed_amount', 'running_balance')`
- `CREATE TRIGGER dataset_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.bank_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('dataset_id')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.bank_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_belongs_to_dataset BEFORE INSERT OR UPDATE ON mizan.bank_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_same_parent_sources()`

## book_transactions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| dataset_id | uuid | Yes | `—` |
| source_row_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| posting_date | date | Yes | `—` |
| value_date | date | No | `—` |
| reference_ciphertext | text | No | `—` |
| reference_hash | text | No | `—` |
| description_ciphertext | text | No | `—` |
| signed_amount | mizan.exact_amount | Yes | `—` |
| running_balance | mizan.exact_amount | No | `—` |
| reversal_of_id | uuid | No | `—` |
| ledger_entry_id | uuid | No | `—` |

Constraints:

- **book_transactions_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **book_transactions_created_at_not_null**: `NOT NULL created_at`
- **book_transactions_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **book_transactions_currency_code_not_null**: `NOT NULL currency_code`
- **book_transactions_dataset_id_not_null**: `NOT NULL dataset_id`
- **book_transactions_entity_id_not_null**: `NOT NULL entity_id`
- **book_transactions_id_not_null**: `NOT NULL id`
- **book_transactions_pkey**: `PRIMARY KEY (id)`
- **book_transactions_posting_date_not_null**: `NOT NULL posting_date`
- **book_transactions_signed_amount_check**: `CHECK (signed_amount::numeric <> 0::numeric)`
- **book_transactions_signed_amount_not_null**: `NOT NULL signed_amount`
- **book_transactions_source_row_id_not_null**: `NOT NULL source_row_id`
- **book_transactions_tenant_id_entity_id_bank_account_id_curr_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_account_id, currency_code) REFERENCES mizan.bank_accounts(tenant_id, entity_id, id, currency_code)`
- **book_transactions_tenant_id_entity_id_dataset_id_currency__fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id, currency_code) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id, currency_code)`
- **book_transactions_tenant_id_entity_id_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **book_transactions_tenant_id_entity_id_dataset_id_source_row_key**: `UNIQUE (tenant_id, entity_id, dataset_id, source_row_id)`
- **book_transactions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **book_transactions_tenant_id_entity_id_id_bank_account_id_cu_key**: `UNIQUE (tenant_id, entity_id, id, bank_account_id, currency_code)`
- **book_transactions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **book_transactions_tenant_id_entity_id_ledger_entry_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, ledger_entry_id) REFERENCES mizan.ledger_entries(tenant_id, entity_id, id)`
- **book_transactions_tenant_id_entity_id_reversal_of_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, reversal_of_id) REFERENCES mizan.book_transactions(tenant_id, entity_id, id)`
- **book_transactions_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **book_transactions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **book_transactions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **book_transactions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.book_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('signed_amount', 'running_balance')`
- `CREATE TRIGGER dataset_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.book_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('dataset_id')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.book_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER source_belongs_to_dataset BEFORE INSERT OR UPDATE ON mizan.book_transactions FOR EACH ROW EXECUTE FUNCTION mizan.guard_same_parent_sources()`

## reconciliations

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| cutoff_date | date | Yes | `—` |
| bank_dataset_id | uuid | Yes | `—` |
| book_dataset_id | uuid | Yes | `—` |
| bank_opening_balance | mizan.exact_amount | No | `—` |
| bank_closing_balance | mizan.exact_amount | No | `—` |
| book_opening_balance | mizan.exact_amount | No | `—` |
| book_closing_balance | mizan.exact_amount | No | `—` |
| bank_complete | boolean | Yes | `false` |
| book_complete | boolean | Yes | `false` |
| bank_sign_policy | text | Yes | `—` |
| book_sign_policy | text | Yes | `—` |

Constraints:

- **reconciliations_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **reconciliations_bank_complete_not_null**: `NOT NULL bank_complete`
- **reconciliations_bank_dataset_id_not_null**: `NOT NULL bank_dataset_id`
- **reconciliations_bank_sign_policy_not_null**: `NOT NULL bank_sign_policy`
- **reconciliations_book_complete_not_null**: `NOT NULL book_complete`
- **reconciliations_book_dataset_id_not_null**: `NOT NULL book_dataset_id`
- **reconciliations_book_sign_policy_not_null**: `NOT NULL book_sign_policy`
- **reconciliations_created_at_not_null**: `NOT NULL created_at`
- **reconciliations_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **reconciliations_currency_code_not_null**: `NOT NULL currency_code`
- **reconciliations_cutoff_date_not_null**: `NOT NULL cutoff_date`
- **reconciliations_entity_id_not_null**: `NOT NULL entity_id`
- **reconciliations_id_not_null**: `NOT NULL id`
- **reconciliations_output_version_id_not_null**: `NOT NULL output_version_id`
- **reconciliations_pkey**: `PRIMARY KEY (id)`
- **reconciliations_tenant_id_entity_id_bank_account_id_curren_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_account_id, currency_code) REFERENCES mizan.bank_accounts(tenant_id, entity_id, id, currency_code)`
- **reconciliations_tenant_id_entity_id_bank_dataset_id_curren_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_dataset_id, currency_code) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id, currency_code)`
- **reconciliations_tenant_id_entity_id_bank_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **reconciliations_tenant_id_entity_id_book_dataset_id_curren_fkey**: `FOREIGN KEY (tenant_id, entity_id, book_dataset_id, currency_code) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id, currency_code)`
- **reconciliations_tenant_id_entity_id_book_dataset_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, book_dataset_id) REFERENCES mizan.dataset_versions(tenant_id, entity_id, id)`
- **reconciliations_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **reconciliations_tenant_id_entity_id_id_bank_account_id_curr_key**: `UNIQUE (tenant_id, entity_id, id, bank_account_id, currency_code)`
- **reconciliations_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **reconciliations_tenant_id_entity_id_output_version_id_curr_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id, currency_code) REFERENCES mizan.output_versions(tenant_id, entity_id, id, currency_code)`
- **reconciliations_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **reconciliations_tenant_id_entity_id_output_version_id_key**: `UNIQUE (tenant_id, entity_id, output_version_id)`
- **reconciliations_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **reconciliations_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **reconciliations_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.reconciliations FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('bank_opening_balance', 'bank_closing_balance', 'book_opening_balance', 'book_closing_balance')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.reconciliations FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.reconciliations FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## reconciliation_rule_bindings

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| reconciliation_id | uuid | Yes | `—` |
| rule_version_id | uuid | Yes | `—` |

Constraints:

- **reconciliation_rule_bindings_created_at_not_null**: `NOT NULL created_at`
- **reconciliation_rule_bindings_entity_id_not_null**: `NOT NULL entity_id`
- **reconciliation_rule_bindings_id_not_null**: `NOT NULL id`
- **reconciliation_rule_bindings_pkey**: `PRIMARY KEY (id)`
- **reconciliation_rule_bindings_reconciliation_id_not_null**: `NOT NULL reconciliation_id`
- **reconciliation_rule_bindings_rule_version_id_not_null**: `NOT NULL rule_version_id`
- **reconciliation_rule_bindings_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **reconciliation_rule_bindings_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **reconciliation_rule_bindings_tenant_id_entity_id_reconcili_fkey**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **reconciliation_rule_bindings_tenant_id_entity_id_reconcilia_key**: `UNIQUE (tenant_id, entity_id, reconciliation_id, rule_version_id)`
- **reconciliation_rule_bindings_tenant_id_entity_id_rule_vers_fkey**: `FOREIGN KEY (tenant_id, entity_id, rule_version_id) REFERENCES mizan.matching_rule_versions(tenant_id, entity_id, id)`
- **reconciliation_rule_bindings_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **reconciliation_rule_bindings_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **reconciliation_rule_bindings_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.reconciliation_rule_bindings FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.reconciliation_rule_bindings FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## match_groups

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| reconciliation_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| rule_version_id | uuid | No | `—` |
| match_kind | text | Yes | `—` |
| status | text | Yes | `'suggested'::text` |
| automatic | boolean | Yes | `false` |
| unique_candidate | boolean | Yes | `false` |
| reference_conflict | boolean | Yes | `false` |
| similarity_score | numeric | No | `—` |
| decided_by | uuid | No | `—` |
| decision_reason | text | No | `—` |
| supervisor_override_by | uuid | No | `—` |
| decided_at | timestamp with time zone | No | `—` |
| idempotency_key | text | Yes | `—` |

Constraints:

- **match_groups_automatic_not_null**: `NOT NULL automatic`
- **match_groups_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **match_groups_check**: `CHECK (NOT automatic OR match_kind = 'one_to_one'::text AND unique_candidate AND rule_version_id IS NOT NULL AND NOT reference_conflict)`
- **match_groups_check1**: `CHECK ((status = ANY (ARRAY['suggested'::text, 'ambiguous'::text])) OR decision_reason IS NOT NULL AND decided_at IS NOT NULL AND (decided_by IS NOT NULL OR automatic))`
- **match_groups_check2**: `CHECK (NOT reference_conflict OR status <> 'confirmed'::text OR supervisor_override_by IS NOT NULL AND length(TRIM(BOTH FROM decision_reason)) > 0)`
- **match_groups_created_at_not_null**: `NOT NULL created_at`
- **match_groups_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **match_groups_currency_code_not_null**: `NOT NULL currency_code`
- **match_groups_decided_by_fkey**: `FOREIGN KEY (decided_by) REFERENCES mizan.app_users(id)`
- **match_groups_entity_id_not_null**: `NOT NULL entity_id`
- **match_groups_id_not_null**: `NOT NULL id`
- **match_groups_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **match_groups_match_kind_check**: `CHECK (match_kind = ANY (ARRAY['one_to_one'::text, 'one_to_many'::text, 'many_to_one'::text, 'partial'::text]))`
- **match_groups_match_kind_not_null**: `NOT NULL match_kind`
- **match_groups_pkey**: `PRIMARY KEY (id)`
- **match_groups_reconciliation_id_not_null**: `NOT NULL reconciliation_id`
- **match_groups_reference_conflict_not_null**: `NOT NULL reference_conflict`
- **match_groups_similarity_score_check**: `CHECK (similarity_score >= 0::numeric AND similarity_score <= 1::numeric)`
- **match_groups_status_check**: `CHECK (status = ANY (ARRAY['suggested'::text, 'ambiguous'::text, 'confirmed'::text, 'rejected'::text, 'unmatched'::text]))`
- **match_groups_status_not_null**: `NOT NULL status`
- **match_groups_supervisor_override_by_fkey**: `FOREIGN KEY (supervisor_override_by) REFERENCES mizan.app_users(id)`
- **match_groups_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **match_groups_tenant_id_entity_id_id_bank_account_id_currenc_key**: `UNIQUE (tenant_id, entity_id, id, bank_account_id, currency_code)`
- **match_groups_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **match_groups_tenant_id_entity_id_reconciliation_id_bank_ac_fkey**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id, bank_account_id, currency_code) REFERENCES mizan.reconciliations(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **match_groups_tenant_id_entity_id_reconciliation_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **match_groups_tenant_id_entity_id_reconciliation_id_idempote_key**: `UNIQUE (tenant_id, entity_id, reconciliation_id, idempotency_key)`
- **match_groups_tenant_id_entity_id_rule_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, rule_version_id) REFERENCES mizan.matching_rule_versions(tenant_id, entity_id, id)`
- **match_groups_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **match_groups_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **match_groups_tenant_id_not_null**: `NOT NULL tenant_id`
- **match_groups_unique_candidate_not_null**: `NOT NULL unique_candidate`
- **meaningful_match_decision**: `CHECK ((status = ANY (ARRAY['suggested'::text, 'ambiguous'::text])) OR length(TRIM(BOTH FROM decision_reason)) > 0)`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.match_groups FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.match_groups FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER match_group_guard BEFORE INSERT OR DELETE OR UPDATE ON mizan.match_groups FOR EACH ROW EXECUTE FUNCTION mizan.guard_match_group()`
- `CREATE TRIGGER supervisor_override_permission BEFORE INSERT OR UPDATE ON mizan.match_groups FOR EACH ROW EXECUTE FUNCTION mizan.guard_supervisor_override()`

## match_group_members

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| match_group_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| bank_transaction_id | uuid | No | `—` |
| book_transaction_id | uuid | No | `—` |
| evidence | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **match_group_members_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **match_group_members_check**: `CHECK (num_nonnulls(bank_transaction_id, book_transaction_id) = 1)`
- **match_group_members_created_at_not_null**: `NOT NULL created_at`
- **match_group_members_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **match_group_members_currency_code_not_null**: `NOT NULL currency_code`
- **match_group_members_entity_id_not_null**: `NOT NULL entity_id`
- **match_group_members_evidence_check**: `CHECK (jsonb_typeof(evidence) = 'object'::text)`
- **match_group_members_evidence_not_null**: `NOT NULL evidence`
- **match_group_members_id_not_null**: `NOT NULL id`
- **match_group_members_match_group_id_not_null**: `NOT NULL match_group_id`
- **match_group_members_pkey**: `PRIMARY KEY (id)`
- **match_group_members_tenant_id_entity_id_bank_transaction_i_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_transaction_id, bank_account_id, currency_code) REFERENCES mizan.bank_transactions(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **match_group_members_tenant_id_entity_id_book_transaction_i_fkey**: `FOREIGN KEY (tenant_id, entity_id, book_transaction_id, bank_account_id, currency_code) REFERENCES mizan.book_transactions(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **match_group_members_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **match_group_members_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **match_group_members_tenant_id_entity_id_match_group_id_ban_fkey**: `FOREIGN KEY (tenant_id, entity_id, match_group_id, bank_account_id, currency_code) REFERENCES mizan.match_groups(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **match_group_members_tenant_id_entity_id_match_group_id_bank_key**: `UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, match_group_id, bank_transaction_id, book_transaction_id)`
- **match_group_members_tenant_id_entity_id_match_group_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, match_group_id) REFERENCES mizan.match_groups(tenant_id, entity_id, id)`
- **match_group_members_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **match_group_members_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **match_group_members_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.match_group_members FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.match_group_members FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER match_members_fixed BEFORE INSERT OR DELETE OR UPDATE ON mizan.match_group_members FOR EACH ROW EXECUTE FUNCTION mizan.guard_match_members()`

## allocations

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| match_group_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| bank_transaction_id | uuid | Yes | `—` |
| book_transaction_id | uuid | Yes | `—` |
| amount | mizan.exact_amount | Yes | `—` |
| allocated_by | uuid | Yes | `—` |
| idempotency_key | text | Yes | `—` |
| reversed_at | timestamp with time zone | No | `—` |
| reversed_by | uuid | No | `—` |
| reversal_reason | text | No | `—` |

Constraints:

- **allocations_allocated_by_fkey**: `FOREIGN KEY (allocated_by) REFERENCES mizan.app_users(id)`
- **allocations_allocated_by_not_null**: `NOT NULL allocated_by`
- **allocations_amount_check**: `CHECK (amount::numeric > 0::numeric)`
- **allocations_amount_not_null**: `NOT NULL amount`
- **allocations_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **allocations_bank_transaction_id_not_null**: `NOT NULL bank_transaction_id`
- **allocations_book_transaction_id_not_null**: `NOT NULL book_transaction_id`
- **allocations_check**: `CHECK (reversed_at IS NULL OR reversed_by IS NOT NULL AND length(TRIM(BOTH FROM reversal_reason)) > 0)`
- **allocations_created_at_not_null**: `NOT NULL created_at`
- **allocations_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **allocations_currency_code_not_null**: `NOT NULL currency_code`
- **allocations_entity_id_not_null**: `NOT NULL entity_id`
- **allocations_id_not_null**: `NOT NULL id`
- **allocations_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **allocations_match_group_id_not_null**: `NOT NULL match_group_id`
- **allocations_pkey**: `PRIMARY KEY (id)`
- **allocations_reversed_by_fkey**: `FOREIGN KEY (reversed_by) REFERENCES mizan.app_users(id)`
- **allocations_tenant_id_entity_id_bank_transaction_id_bank_a_fkey**: `FOREIGN KEY (tenant_id, entity_id, bank_transaction_id, bank_account_id, currency_code) REFERENCES mizan.bank_transactions(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **allocations_tenant_id_entity_id_book_transaction_id_bank_a_fkey**: `FOREIGN KEY (tenant_id, entity_id, book_transaction_id, bank_account_id, currency_code) REFERENCES mizan.book_transactions(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **allocations_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **allocations_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **allocations_tenant_id_entity_id_idempotency_key_key**: `UNIQUE (tenant_id, entity_id, idempotency_key)`
- **allocations_tenant_id_entity_id_match_group_id_bank_accoun_fkey**: `FOREIGN KEY (tenant_id, entity_id, match_group_id, bank_account_id, currency_code) REFERENCES mizan.match_groups(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **allocations_tenant_id_entity_id_match_group_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, match_group_id) REFERENCES mizan.match_groups(tenant_id, entity_id, id)`
- **allocations_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **allocations_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **allocations_tenant_id_not_null**: `NOT NULL tenant_id`
- **reversal_evidence_required**: `CHECK (reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL OR reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL AND length(TRIM(BOTH FROM reversal_reason)) > 0)`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.allocations FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER bounded_allocation BEFORE INSERT OR DELETE OR UPDATE ON mizan.allocations FOR EACH ROW EXECUTE FUNCTION mizan.guard_allocation()`
- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.allocations FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('amount')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.allocations FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## match_decisions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| match_group_id | uuid | Yes | `—` |
| actor_id | uuid | Yes | `—` |
| action | text | Yes | `—` |
| reason | text | Yes | `—` |
| previous_state | jsonb | Yes | `'{}'::jsonb` |
| new_state | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **match_decisions_action_not_null**: `NOT NULL action`
- **match_decisions_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **match_decisions_actor_id_not_null**: `NOT NULL actor_id`
- **match_decisions_created_at_not_null**: `NOT NULL created_at`
- **match_decisions_entity_id_not_null**: `NOT NULL entity_id`
- **match_decisions_id_not_null**: `NOT NULL id`
- **match_decisions_match_group_id_not_null**: `NOT NULL match_group_id`
- **match_decisions_new_state_check**: `CHECK (jsonb_typeof(new_state) = 'object'::text)`
- **match_decisions_new_state_not_null**: `NOT NULL new_state`
- **match_decisions_pkey**: `PRIMARY KEY (id)`
- **match_decisions_previous_state_check**: `CHECK (jsonb_typeof(previous_state) = 'object'::text)`
- **match_decisions_previous_state_not_null**: `NOT NULL previous_state`
- **match_decisions_reason_not_null**: `NOT NULL reason`
- **match_decisions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **match_decisions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **match_decisions_tenant_id_entity_id_match_group_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, match_group_id) REFERENCES mizan.match_groups(tenant_id, entity_id, id)`
- **match_decisions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **match_decisions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **match_decisions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT ON mizan.match_decisions FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.match_decisions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.match_decisions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## reconciling_items

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| origin_reconciliation_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| item_type | text | Yes | `—` |
| origin_date | date | Yes | `—` |
| signed_amount | mizan.exact_amount | Yes | `—` |
| effect_side | text | Yes | `—` |
| owner_id | uuid | Yes | `—` |
| source_row_id | uuid | No | `—` |
| description | text | Yes | `—` |

Constraints:

- **reconciling_items_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **reconciling_items_created_at_not_null**: `NOT NULL created_at`
- **reconciling_items_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **reconciling_items_currency_code_not_null**: `NOT NULL currency_code`
- **reconciling_items_description_not_null**: `NOT NULL description`
- **reconciling_items_effect_side_check**: `CHECK (effect_side = ANY (ARRAY['bank'::text, 'books'::text, 'none'::text]))`
- **reconciling_items_effect_side_not_null**: `NOT NULL effect_side`
- **reconciling_items_entity_id_not_null**: `NOT NULL entity_id`
- **reconciling_items_id_not_null**: `NOT NULL id`
- **reconciling_items_item_type_not_null**: `NOT NULL item_type`
- **reconciling_items_origin_date_not_null**: `NOT NULL origin_date`
- **reconciling_items_origin_reconciliation_id_not_null**: `NOT NULL origin_reconciliation_id`
- **reconciling_items_owner_id_fkey**: `FOREIGN KEY (owner_id) REFERENCES mizan.app_users(id)`
- **reconciling_items_owner_id_not_null**: `NOT NULL owner_id`
- **reconciling_items_pkey**: `PRIMARY KEY (id)`
- **reconciling_items_signed_amount_check**: `CHECK (signed_amount::numeric <> 0::numeric)`
- **reconciling_items_signed_amount_not_null**: `NOT NULL signed_amount`
- **reconciling_items_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **reconciling_items_tenant_id_entity_id_id_bank_account_id_cu_key**: `UNIQUE (tenant_id, entity_id, id, bank_account_id, currency_code)`
- **reconciling_items_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **reconciling_items_tenant_id_entity_id_origin_reconciliati_fkey1**: `FOREIGN KEY (tenant_id, entity_id, origin_reconciliation_id, bank_account_id, currency_code) REFERENCES mizan.reconciliations(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **reconciling_items_tenant_id_entity_id_origin_reconciliatio_fkey**: `FOREIGN KEY (tenant_id, entity_id, origin_reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **reconciling_items_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **reconciling_items_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **reconciling_items_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **reconciling_items_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.reconciling_items FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.reconciling_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('signed_amount')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.reconciling_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## reconciliation_items

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| reconciliation_id | uuid | Yes | `—` |
| item_id | uuid | Yes | `—` |
| bank_account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| status | text | Yes | `'outstanding'::text` |
| carried_from_reconciliation_id | uuid | No | `—` |
| clearance_source_row_id | uuid | No | `—` |
| decision_reason | text | No | `—` |

Constraints:

- **item_decision_reason_required**: `CHECK (status = 'outstanding'::text OR decision_reason IS NOT NULL AND length(TRIM(BOTH FROM decision_reason)) > 0)`
- **reconciliation_items_bank_account_id_not_null**: `NOT NULL bank_account_id`
- **reconciliation_items_check**: `CHECK (status = 'outstanding'::text OR length(TRIM(BOTH FROM decision_reason)) > 0)`
- **reconciliation_items_created_at_not_null**: `NOT NULL created_at`
- **reconciliation_items_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **reconciliation_items_currency_code_not_null**: `NOT NULL currency_code`
- **reconciliation_items_entity_id_not_null**: `NOT NULL entity_id`
- **reconciliation_items_id_not_null**: `NOT NULL id`
- **reconciliation_items_item_id_not_null**: `NOT NULL item_id`
- **reconciliation_items_pkey**: `PRIMARY KEY (id)`
- **reconciliation_items_reconciliation_id_not_null**: `NOT NULL reconciliation_id`
- **reconciliation_items_status_check**: `CHECK (status = ANY (ARRAY['outstanding'::text, 'cleared'::text, 'excluded'::text]))`
- **reconciliation_items_status_not_null**: `NOT NULL status`
- **reconciliation_items_tenant_id_entity_id_carried_from_reco_fkey**: `FOREIGN KEY (tenant_id, entity_id, carried_from_reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **reconciliation_items_tenant_id_entity_id_clearance_source__fkey**: `FOREIGN KEY (tenant_id, entity_id, clearance_source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **reconciliation_items_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **reconciliation_items_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **reconciliation_items_tenant_id_entity_id_item_id_bank_acco_fkey**: `FOREIGN KEY (tenant_id, entity_id, item_id, bank_account_id, currency_code) REFERENCES mizan.reconciling_items(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **reconciliation_items_tenant_id_entity_id_reconciliation_i_fkey1**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id, bank_account_id, currency_code) REFERENCES mizan.reconciliations(tenant_id, entity_id, id, bank_account_id, currency_code)`
- **reconciliation_items_tenant_id_entity_id_reconciliation_id__key**: `UNIQUE (tenant_id, entity_id, reconciliation_id, item_id)`
- **reconciliation_items_tenant_id_entity_id_reconciliation_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **reconciliation_items_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **reconciliation_items_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **reconciliation_items_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.reconciliation_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER carry_forward_guard BEFORE INSERT OR UPDATE ON mizan.reconciliation_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_carry_forward()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.reconciliation_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## proposed_entries

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| reconciliation_id | uuid | Yes | `—` |
| item_id | uuid | Yes | `—` |
| description | text | Yes | `—` |
| recorded_ledger_entry_id | uuid | No | `—` |
| status | text | Yes | `'proposed'::text` |
| created_by | uuid | Yes | `—` |

Constraints:

- **proposed_entries_check**: `CHECK ((status = 'linked_to_imported_entry'::text) = (recorded_ledger_entry_id IS NOT NULL))`
- **proposed_entries_created_at_not_null**: `NOT NULL created_at`
- **proposed_entries_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **proposed_entries_created_by_not_null**: `NOT NULL created_by`
- **proposed_entries_description_not_null**: `NOT NULL description`
- **proposed_entries_entity_id_not_null**: `NOT NULL entity_id`
- **proposed_entries_id_not_null**: `NOT NULL id`
- **proposed_entries_item_id_not_null**: `NOT NULL item_id`
- **proposed_entries_pkey**: `PRIMARY KEY (id)`
- **proposed_entries_reconciliation_id_not_null**: `NOT NULL reconciliation_id`
- **proposed_entries_status_check**: `CHECK (status = ANY (ARRAY['proposed'::text, 'linked_to_imported_entry'::text, 'withdrawn'::text]))`
- **proposed_entries_status_not_null**: `NOT NULL status`
- **proposed_entries_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **proposed_entries_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **proposed_entries_tenant_id_entity_id_item_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, item_id) REFERENCES mizan.reconciling_items(tenant_id, entity_id, id)`
- **proposed_entries_tenant_id_entity_id_reconciliation_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **proposed_entries_tenant_id_entity_id_reconciliation_id_item_key**: `UNIQUE (tenant_id, entity_id, reconciliation_id, item_id)`
- **proposed_entries_tenant_id_entity_id_recorded_ledger_entry_fkey**: `FOREIGN KEY (tenant_id, entity_id, recorded_ledger_entry_id) REFERENCES mizan.ledger_entries(tenant_id, entity_id, id)`
- **proposed_entries_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **proposed_entries_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **proposed_entries_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.proposed_entries FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.proposed_entries FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## proposed_entry_lines

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| proposed_entry_id | uuid | Yes | `—` |
| account_id | uuid | Yes | `—` |
| currency_code | text | Yes | `—` |
| debit | mizan.exact_amount | Yes | `0` |
| credit | mizan.exact_amount | Yes | `0` |

Constraints:

- **proposed_entry_lines_account_id_not_null**: `NOT NULL account_id`
- **proposed_entry_lines_check**: `CHECK (debit::numeric > 0::numeric AND credit::numeric = 0::numeric OR credit::numeric > 0::numeric AND debit::numeric = 0::numeric)`
- **proposed_entry_lines_created_at_not_null**: `NOT NULL created_at`
- **proposed_entry_lines_credit_check**: `CHECK (credit::numeric >= 0::numeric)`
- **proposed_entry_lines_credit_not_null**: `NOT NULL credit`
- **proposed_entry_lines_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **proposed_entry_lines_currency_code_not_null**: `NOT NULL currency_code`
- **proposed_entry_lines_debit_check**: `CHECK (debit::numeric >= 0::numeric)`
- **proposed_entry_lines_debit_not_null**: `NOT NULL debit`
- **proposed_entry_lines_entity_id_not_null**: `NOT NULL entity_id`
- **proposed_entry_lines_id_not_null**: `NOT NULL id`
- **proposed_entry_lines_pkey**: `PRIMARY KEY (id)`
- **proposed_entry_lines_proposed_entry_id_not_null**: `NOT NULL proposed_entry_id`
- **proposed_entry_lines_tenant_id_entity_id_account_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, account_id) REFERENCES mizan.accounts(tenant_id, entity_id, id)`
- **proposed_entry_lines_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **proposed_entry_lines_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **proposed_entry_lines_tenant_id_entity_id_proposed_entry_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, proposed_entry_id) REFERENCES mizan.proposed_entries(tenant_id, entity_id, id)`
- **proposed_entry_lines_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **proposed_entry_lines_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **proposed_entry_lines_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.proposed_entry_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()`
- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.proposed_entry_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('debit', 'credit')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.proposed_entry_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## matching_quality_runs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| reconciliation_id | uuid | Yes | `—` |
| rule_version_id | uuid | No | `—` |
| ground_truth_reference | text | No | `—` |
| sample_size | bigint | No | `—` |
| precision_value | numeric | No | `—` |
| confidence_lower | numeric | No | `—` |
| confidence_upper | numeric | No | `—` |
| coverage_counts | jsonb | Yes | `'{}'::jsonb` |
| coverage_absolute_amounts | jsonb | Yes | `'{}'::jsonb` |
| denominators | jsonb | Yes | `'{}'::jsonb` |
| strata | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **matching_quality_runs_check**: `CHECK (precision_value IS NULL OR ground_truth_reference IS NOT NULL AND sample_size IS NOT NULL)`
- **matching_quality_runs_confidence_lower_check**: `CHECK (confidence_lower >= 0::numeric AND confidence_lower <= 1::numeric)`
- **matching_quality_runs_confidence_upper_check**: `CHECK (confidence_upper >= 0::numeric AND confidence_upper <= 1::numeric)`
- **matching_quality_runs_coverage_absolute_amounts_check**: `CHECK (jsonb_typeof(coverage_absolute_amounts) = 'object'::text)`
- **matching_quality_runs_coverage_absolute_amounts_not_null**: `NOT NULL coverage_absolute_amounts`
- **matching_quality_runs_coverage_counts_check**: `CHECK (jsonb_typeof(coverage_counts) = 'object'::text)`
- **matching_quality_runs_coverage_counts_not_null**: `NOT NULL coverage_counts`
- **matching_quality_runs_created_at_not_null**: `NOT NULL created_at`
- **matching_quality_runs_denominators_check**: `CHECK (jsonb_typeof(denominators) = 'object'::text)`
- **matching_quality_runs_denominators_not_null**: `NOT NULL denominators`
- **matching_quality_runs_entity_id_not_null**: `NOT NULL entity_id`
- **matching_quality_runs_id_not_null**: `NOT NULL id`
- **matching_quality_runs_pkey**: `PRIMARY KEY (id)`
- **matching_quality_runs_precision_value_check**: `CHECK (precision_value >= 0::numeric AND precision_value <= 1::numeric)`
- **matching_quality_runs_reconciliation_id_not_null**: `NOT NULL reconciliation_id`
- **matching_quality_runs_sample_size_check**: `CHECK (sample_size > 0)`
- **matching_quality_runs_strata_check**: `CHECK (jsonb_typeof(strata) = 'object'::text)`
- **matching_quality_runs_strata_not_null**: `NOT NULL strata`
- **matching_quality_runs_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **matching_quality_runs_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **matching_quality_runs_tenant_id_entity_id_reconciliation_i_fkey**: `FOREIGN KEY (tenant_id, entity_id, reconciliation_id) REFERENCES mizan.reconciliations(tenant_id, entity_id, id)`
- **matching_quality_runs_tenant_id_entity_id_rule_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, rule_version_id) REFERENCES mizan.matching_rule_versions(tenant_id, entity_id, id)`
- **matching_quality_runs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **matching_quality_runs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **matching_quality_runs_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.matching_quality_runs FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.matching_quality_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## review_submissions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| content_fingerprint | text | Yes | `—` |
| submitted_by | uuid | Yes | `—` |
| reviewer_id | uuid | Yes | `—` |
| withdrawn_at | timestamp with time zone | No | `—` |
| withdrawal_reason | text | No | `—` |

Constraints:

- **review_submissions_check**: `CHECK (submitted_by <> reviewer_id)`
- **review_submissions_check1**: `CHECK (withdrawn_at IS NULL OR length(TRIM(BOTH FROM withdrawal_reason)) > 0)`
- **review_submissions_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **review_submissions_created_at_not_null**: `NOT NULL created_at`
- **review_submissions_entity_id_not_null**: `NOT NULL entity_id`
- **review_submissions_id_not_null**: `NOT NULL id`
- **review_submissions_output_version_id_not_null**: `NOT NULL output_version_id`
- **review_submissions_pkey**: `PRIMARY KEY (id)`
- **review_submissions_reviewer_id_fkey**: `FOREIGN KEY (reviewer_id) REFERENCES mizan.app_users(id)`
- **review_submissions_reviewer_id_not_null**: `NOT NULL reviewer_id`
- **review_submissions_submitted_by_fkey**: `FOREIGN KEY (submitted_by) REFERENCES mizan.app_users(id)`
- **review_submissions_submitted_by_not_null**: `NOT NULL submitted_by`
- **review_submissions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **review_submissions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **review_submissions_tenant_id_entity_id_output_version_id_co_key**: `UNIQUE (tenant_id, entity_id, output_version_id, content_fingerprint)`
- **review_submissions_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **review_submissions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **review_submissions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **review_submissions_tenant_id_not_null**: `NOT NULL tenant_id`
- **withdrawal_reason_required**: `CHECK (withdrawn_at IS NULL OR withdrawal_reason IS NOT NULL AND length(TRIM(BOTH FROM withdrawal_reason)) > 0)`

Triggers:

- `CREATE TRIGGER apply_withdrawal AFTER UPDATE ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.apply_withdrawal()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER review_submission AFTER INSERT ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.submit_review()`
- `CREATE TRIGGER submission_immutable BEFORE DELETE OR UPDATE ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.guard_review_submission_update()`

## review_decisions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| submission_id | uuid | Yes | `—` |
| output_version_id | uuid | Yes | `—` |
| reviewed_fingerprint | text | Yes | `—` |
| actor_id | uuid | Yes | `—` |
| decision | text | Yes | `—` |
| reason | text | Yes | `—` |
| mfa_session_id | uuid | Yes | `—` |

Constraints:

- **review_decisions_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **review_decisions_actor_id_not_null**: `NOT NULL actor_id`
- **review_decisions_created_at_not_null**: `NOT NULL created_at`
- **review_decisions_decision_check**: `CHECK (decision = ANY (ARRAY['approve'::text, 'reject'::text, 'request_changes'::text]))`
- **review_decisions_decision_not_null**: `NOT NULL decision`
- **review_decisions_entity_id_not_null**: `NOT NULL entity_id`
- **review_decisions_id_not_null**: `NOT NULL id`
- **review_decisions_mfa_session_id_fkey**: `FOREIGN KEY (mfa_session_id) REFERENCES mizan.user_sessions(id)`
- **review_decisions_mfa_session_id_not_null**: `NOT NULL mfa_session_id`
- **review_decisions_output_version_id_not_null**: `NOT NULL output_version_id`
- **review_decisions_pkey**: `PRIMARY KEY (id)`
- **review_decisions_reason_not_null**: `NOT NULL reason`
- **review_decisions_reviewed_fingerprint_not_null**: `NOT NULL reviewed_fingerprint`
- **review_decisions_submission_id_not_null**: `NOT NULL submission_id`
- **review_decisions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **review_decisions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **review_decisions_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **review_decisions_tenant_id_entity_id_submission_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, submission_id) REFERENCES mizan.review_submissions(tenant_id, entity_id, id)`
- **review_decisions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **review_decisions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **review_decisions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER apply_review_decision AFTER INSERT ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.apply_review_decision()`
- `CREATE TRIGGER b_approval_financials BEFORE INSERT ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.guard_approval_financials()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER review_decision BEFORE INSERT ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.review_decision_guard()`

## reopen_events

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| previous_output_id | uuid | Yes | `—` |
| new_output_id | uuid | Yes | `—` |
| actor_id | uuid | Yes | `—` |
| reason | text | Yes | `—` |
| change_summary | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **reopen_events_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **reopen_events_actor_id_not_null**: `NOT NULL actor_id`
- **reopen_events_change_summary_check**: `CHECK (jsonb_typeof(change_summary) = 'object'::text)`
- **reopen_events_change_summary_not_null**: `NOT NULL change_summary`
- **reopen_events_check**: `CHECK (previous_output_id <> new_output_id)`
- **reopen_events_created_at_not_null**: `NOT NULL created_at`
- **reopen_events_entity_id_not_null**: `NOT NULL entity_id`
- **reopen_events_id_not_null**: `NOT NULL id`
- **reopen_events_new_output_id_not_null**: `NOT NULL new_output_id`
- **reopen_events_pkey**: `PRIMARY KEY (id)`
- **reopen_events_previous_output_id_not_null**: `NOT NULL previous_output_id`
- **reopen_events_reason_not_null**: `NOT NULL reason`
- **reopen_events_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **reopen_events_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **reopen_events_tenant_id_entity_id_new_output_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, new_output_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **reopen_events_tenant_id_entity_id_new_output_id_key**: `UNIQUE (tenant_id, entity_id, new_output_id)`
- **reopen_events_tenant_id_entity_id_previous_output_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, previous_output_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **reopen_events_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **reopen_events_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **reopen_events_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.reopen_events FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.reopen_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## export_artifacts

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| content_fingerprint | text | Yes | `—` |
| format | text | Yes | `—` |
| job_id | uuid | Yes | `—` |
| object_key | text | Yes | `—` |
| object_version | text | Yes | `—` |
| sha256 | text | Yes | `—` |
| output_status_at_generation | text | Yes | `—` |
| generated_by | uuid | Yes | `—` |
| expires_at | timestamp with time zone | No | `—` |
| deleted_at | timestamp with time zone | No | `—` |

Constraints:

- **export_artifacts_content_fingerprint_not_null**: `NOT NULL content_fingerprint`
- **export_artifacts_created_at_not_null**: `NOT NULL created_at`
- **export_artifacts_entity_id_not_null**: `NOT NULL entity_id`
- **export_artifacts_format_check**: `CHECK (format = ANY (ARRAY['pdf'::text, 'xlsx'::text, 'csv'::text]))`
- **export_artifacts_format_not_null**: `NOT NULL format`
- **export_artifacts_generated_by_fkey**: `FOREIGN KEY (generated_by) REFERENCES mizan.app_users(id)`
- **export_artifacts_generated_by_not_null**: `NOT NULL generated_by`
- **export_artifacts_id_not_null**: `NOT NULL id`
- **export_artifacts_job_id_not_null**: `NOT NULL job_id`
- **export_artifacts_object_key_not_null**: `NOT NULL object_key`
- **export_artifacts_object_version_not_null**: `NOT NULL object_version`
- **export_artifacts_output_status_at_generation_not_null**: `NOT NULL output_status_at_generation`
- **export_artifacts_output_version_id_not_null**: `NOT NULL output_version_id`
- **export_artifacts_pkey**: `PRIMARY KEY (id)`
- **export_artifacts_sha256_not_null**: `NOT NULL sha256`
- **export_artifacts_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **export_artifacts_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **export_artifacts_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **export_artifacts_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **export_artifacts_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **export_artifacts_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **export_artifacts_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.export_artifacts FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## comments

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| author_id | uuid | Yes | `—` |
| body | text | Yes | `—` |
| parent_id | uuid | No | `—` |

Constraints:

- **comments_author_id_fkey**: `FOREIGN KEY (author_id) REFERENCES mizan.app_users(id)`
- **comments_author_id_not_null**: `NOT NULL author_id`
- **comments_body_not_null**: `NOT NULL body`
- **comments_created_at_not_null**: `NOT NULL created_at`
- **comments_entity_id_not_null**: `NOT NULL entity_id`
- **comments_id_not_null**: `NOT NULL id`
- **comments_output_version_id_not_null**: `NOT NULL output_version_id`
- **comments_pkey**: `PRIMARY KEY (id)`
- **comments_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **comments_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **comments_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **comments_tenant_id_entity_id_parent_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, parent_id) REFERENCES mizan.comments(tenant_id, entity_id, id)`
- **comments_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **comments_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **comments_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.comments FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.comments FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## attachments

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| source_file_id | uuid | Yes | `—` |
| output_version_id | uuid | No | `—` |
| comment_id | uuid | No | `—` |
| item_id | uuid | No | `—` |
| attached_by | uuid | Yes | `—` |

Constraints:

- **attachments_attached_by_fkey**: `FOREIGN KEY (attached_by) REFERENCES mizan.app_users(id)`
- **attachments_attached_by_not_null**: `NOT NULL attached_by`
- **attachments_check**: `CHECK (num_nonnulls(output_version_id, comment_id, item_id) = 1)`
- **attachments_created_at_not_null**: `NOT NULL created_at`
- **attachments_entity_id_not_null**: `NOT NULL entity_id`
- **attachments_id_not_null**: `NOT NULL id`
- **attachments_pkey**: `PRIMARY KEY (id)`
- **attachments_source_file_id_not_null**: `NOT NULL source_file_id`
- **attachments_tenant_id_entity_id_comment_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, comment_id) REFERENCES mizan.comments(tenant_id, entity_id, id)`
- **attachments_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **attachments_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **attachments_tenant_id_entity_id_item_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, item_id) REFERENCES mizan.reconciling_items(tenant_id, entity_id, id)`
- **attachments_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **attachments_tenant_id_entity_id_source_file_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_file_id) REFERENCES mizan.source_files(tenant_id, entity_id, id)`
- **attachments_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **attachments_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **attachments_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.attachments FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.attachments FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## notifications

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| recipient_id | uuid | Yes | `—` |
| entity_id | uuid | No | `—` |
| output_version_id | uuid | No | `—` |
| notification_type | text | Yes | `—` |
| safe_template_code | text | Yes | `—` |
| read_at | timestamp with time zone | No | `—` |

Constraints:

- **notifications_check**: `CHECK (output_version_id IS NULL OR entity_id IS NOT NULL)`
- **notifications_created_at_not_null**: `NOT NULL created_at`
- **notifications_id_not_null**: `NOT NULL id`
- **notifications_notification_type_not_null**: `NOT NULL notification_type`
- **notifications_pkey**: `PRIMARY KEY (id)`
- **notifications_recipient_id_fkey**: `FOREIGN KEY (recipient_id) REFERENCES mizan.app_users(id)`
- **notifications_recipient_id_not_null**: `NOT NULL recipient_id`
- **notifications_safe_template_code_not_null**: `NOT NULL safe_template_code`
- **notifications_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **notifications_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **notifications_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **notifications_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **notifications_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.notifications FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## notification_deliveries

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| notification_id | uuid | Yes | `—` |
| channel | text | Yes | `—` |
| idempotency_key | text | Yes | `—` |
| status | text | Yes | `'queued'::text` |
| provider_message_id | text | No | `—` |
| attempt_count | integer | Yes | `0` |
| last_error_code | text | No | `—` |

Constraints:

- **notification_deliveries_attempt_count_check**: `CHECK (attempt_count >= 0)`
- **notification_deliveries_attempt_count_not_null**: `NOT NULL attempt_count`
- **notification_deliveries_channel_check**: `CHECK (channel = ANY (ARRAY['email'::text, 'in_app'::text]))`
- **notification_deliveries_channel_not_null**: `NOT NULL channel`
- **notification_deliveries_created_at_not_null**: `NOT NULL created_at`
- **notification_deliveries_id_not_null**: `NOT NULL id`
- **notification_deliveries_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **notification_deliveries_notification_id_not_null**: `NOT NULL notification_id`
- **notification_deliveries_pkey**: `PRIMARY KEY (id)`
- **notification_deliveries_status_check**: `CHECK (status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text]))`
- **notification_deliveries_status_not_null**: `NOT NULL status`
- **notification_deliveries_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **notification_deliveries_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **notification_deliveries_tenant_id_idempotency_key_key**: `UNIQUE (tenant_id, idempotency_key)`
- **notification_deliveries_tenant_id_not_null**: `NOT NULL tenant_id`
- **notification_deliveries_tenant_id_notification_id_fkey**: `FOREIGN KEY (tenant_id, notification_id) REFERENCES mizan.notifications(tenant_id, id)`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.notification_deliveries FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## audit_events

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| entity_id | uuid | No | `—` |
| actor_id | uuid | No | `—` |
| action | text | Yes | `—` |
| object_type | text | Yes | `—` |
| object_id | uuid | No | `—` |
| object_version | integer | No | `—` |
| reason | text | No | `—` |
| request_id | uuid | No | `—` |
| job_id | uuid | No | `—` |
| event_hash | text | Yes | `—` |
| previous_event_hash | text | No | `—` |
| redacted_metadata | jsonb | Yes | `'{}'::jsonb` |

Constraints:

- **audit_events_action_not_null**: `NOT NULL action`
- **audit_events_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **audit_events_check**: `CHECK (job_id IS NULL OR entity_id IS NOT NULL)`
- **audit_events_created_at_not_null**: `NOT NULL created_at`
- **audit_events_event_hash_not_null**: `NOT NULL event_hash`
- **audit_events_id_not_null**: `NOT NULL id`
- **audit_events_object_type_not_null**: `NOT NULL object_type`
- **audit_events_pkey**: `PRIMARY KEY (id)`
- **audit_events_redacted_metadata_check**: `CHECK (jsonb_typeof(redacted_metadata) = 'object'::text)`
- **audit_events_redacted_metadata_not_null**: `NOT NULL redacted_metadata`
- **audit_events_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **audit_events_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **audit_events_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **audit_events_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **audit_events_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.audit_events FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.audit_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## plan_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| code | text | Yes | `—` |
| version | integer | Yes | `—` |
| name | text | Yes | `—` |
| limits | jsonb | Yes | `—` |
| price_amount | mizan.exact_amount | No | `—` |
| price_currency | text | No | `—` |
| billing_interval | text | No | `—` |
| published_at | timestamp with time zone | No | `—` |

Constraints:

- **plan_versions_check**: `CHECK ((price_amount IS NULL) = (price_currency IS NULL))`
- **plan_versions_code_not_null**: `NOT NULL code`
- **plan_versions_code_version_key**: `UNIQUE (code, version)`
- **plan_versions_id_not_null**: `NOT NULL id`
- **plan_versions_limits_check**: `CHECK (jsonb_typeof(limits) = 'object'::text)`
- **plan_versions_limits_not_null**: `NOT NULL limits`
- **plan_versions_name_not_null**: `NOT NULL name`
- **plan_versions_pkey**: `PRIMARY KEY (id)`
- **plan_versions_price_amount_check**: `CHECK (price_amount::numeric >= 0::numeric)`
- **plan_versions_price_currency_fkey**: `FOREIGN KEY (price_currency) REFERENCES mizan.currencies(code)`
- **plan_versions_version_check**: `CHECK (version > 0)`
- **plan_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.plan_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`

## subscriptions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| plan_version_id | uuid | Yes | `—` |
| provider | text | No | `—` |
| provider_subscription_id | text | No | `—` |
| status | text | Yes | `'trial'::text` |
| current_period_start | timestamp with time zone | No | `—` |
| current_period_end | timestamp with time zone | No | `—` |
| ended_at | timestamp with time zone | No | `—` |

Constraints:

- **subscriptions_check**: `CHECK (current_period_end IS NULL OR current_period_end > current_period_start)`
- **subscriptions_created_at_not_null**: `NOT NULL created_at`
- **subscriptions_id_not_null**: `NOT NULL id`
- **subscriptions_pkey**: `PRIMARY KEY (id)`
- **subscriptions_plan_version_id_fkey**: `FOREIGN KEY (plan_version_id) REFERENCES mizan.plan_versions(id)`
- **subscriptions_plan_version_id_not_null**: `NOT NULL plan_version_id`
- **subscriptions_provider_provider_subscription_id_key**: `UNIQUE (provider, provider_subscription_id)`
- **subscriptions_status_check**: `CHECK (status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'cancelled'::text]))`
- **subscriptions_status_not_null**: `NOT NULL status`
- **subscriptions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **subscriptions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **subscriptions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.subscriptions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## invoices

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| subscription_id | uuid | Yes | `—` |
| provider | text | Yes | `—` |
| provider_invoice_id | text | Yes | `—` |
| currency_code | text | Yes | `—` |
| total | mizan.exact_amount | Yes | `—` |
| status | text | Yes | `'draft'::text` |
| period_start | date | Yes | `—` |
| period_end | date | Yes | `—` |

Constraints:

- **invoices_check**: `CHECK (period_end >= period_start)`
- **invoices_created_at_not_null**: `NOT NULL created_at`
- **invoices_currency_code_fkey**: `FOREIGN KEY (currency_code) REFERENCES mizan.currencies(code)`
- **invoices_currency_code_not_null**: `NOT NULL currency_code`
- **invoices_id_not_null**: `NOT NULL id`
- **invoices_period_end_not_null**: `NOT NULL period_end`
- **invoices_period_start_not_null**: `NOT NULL period_start`
- **invoices_pkey**: `PRIMARY KEY (id)`
- **invoices_provider_invoice_id_not_null**: `NOT NULL provider_invoice_id`
- **invoices_provider_not_null**: `NOT NULL provider`
- **invoices_provider_provider_invoice_id_key**: `UNIQUE (provider, provider_invoice_id)`
- **invoices_status_check**: `CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text]))`
- **invoices_status_not_null**: `NOT NULL status`
- **invoices_subscription_id_not_null**: `NOT NULL subscription_id`
- **invoices_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **invoices_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **invoices_tenant_id_not_null**: `NOT NULL tenant_id`
- **invoices_tenant_id_subscription_id_fkey**: `FOREIGN KEY (tenant_id, subscription_id) REFERENCES mizan.subscriptions(tenant_id, id)`
- **invoices_total_check**: `CHECK (total::numeric >= 0::numeric)`
- **invoices_total_not_null**: `NOT NULL total`

Triggers:

- `CREATE TRIGGER currency_precision BEFORE INSERT OR UPDATE ON mizan.invoices FOR EACH ROW EXECUTE FUNCTION mizan.guard_currency_precision('total')`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.invoices FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## payment_events

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| provider | text | Yes | `—` |
| provider_event_id | text | Yes | `—` |
| event_type | text | Yes | `—` |
| provider_created_at | timestamp with time zone | Yes | `—` |
| verified_at | timestamp with time zone | Yes | `—` |
| payload_hash | text | Yes | `—` |
| status | text | Yes | `'received'::text` |
| processed_at | timestamp with time zone | No | `—` |
| last_error_code | text | No | `—` |

Constraints:

- **payment_events_created_at_not_null**: `NOT NULL created_at`
- **payment_events_event_type_not_null**: `NOT NULL event_type`
- **payment_events_id_not_null**: `NOT NULL id`
- **payment_events_payload_hash_not_null**: `NOT NULL payload_hash`
- **payment_events_pkey**: `PRIMARY KEY (id)`
- **payment_events_provider_created_at_not_null**: `NOT NULL provider_created_at`
- **payment_events_provider_event_id_not_null**: `NOT NULL provider_event_id`
- **payment_events_provider_not_null**: `NOT NULL provider`
- **payment_events_provider_provider_event_id_key**: `UNIQUE (provider, provider_event_id)`
- **payment_events_status_check**: `CHECK (status = ANY (ARRAY['received'::text, 'processed'::text, 'ignored'::text, 'failed'::text]))`
- **payment_events_status_not_null**: `NOT NULL status`
- **payment_events_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **payment_events_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **payment_events_tenant_id_not_null**: `NOT NULL tenant_id`
- **payment_events_verified_at_not_null**: `NOT NULL verified_at`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.payment_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## usage_buckets

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| unit | text | Yes | `—` |
| window_start | timestamp with time zone | Yes | `—` |
| window_end | timestamp with time zone | Yes | `—` |
| quota_limit | bigint | Yes | `—` |
| reserved | bigint | Yes | `0` |
| consumed | bigint | Yes | `0` |

Constraints:

- **usage_buckets_check**: `CHECK (window_end > window_start)`
- **usage_buckets_check1**: `CHECK ((reserved + consumed) <= quota_limit)`
- **usage_buckets_consumed_check**: `CHECK (consumed >= 0)`
- **usage_buckets_consumed_not_null**: `NOT NULL consumed`
- **usage_buckets_created_at_not_null**: `NOT NULL created_at`
- **usage_buckets_id_not_null**: `NOT NULL id`
- **usage_buckets_pkey**: `PRIMARY KEY (id)`
- **usage_buckets_quota_limit_check**: `CHECK (quota_limit >= 0)`
- **usage_buckets_quota_limit_not_null**: `NOT NULL quota_limit`
- **usage_buckets_reserved_check**: `CHECK (reserved >= 0)`
- **usage_buckets_reserved_not_null**: `NOT NULL reserved`
- **usage_buckets_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **usage_buckets_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **usage_buckets_tenant_id_not_null**: `NOT NULL tenant_id`
- **usage_buckets_tenant_id_unit_window_start_window_end_key**: `UNIQUE (tenant_id, unit, window_start, window_end)`
- **usage_buckets_unit_not_null**: `NOT NULL unit`
- **usage_buckets_window_end_not_null**: `NOT NULL window_end`
- **usage_buckets_window_start_not_null**: `NOT NULL window_start`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.usage_buckets FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## usage_events

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| bucket_id | uuid | Yes | `—` |
| entity_id | uuid | No | `—` |
| job_id | uuid | No | `—` |
| idempotency_key | text | Yes | `—` |
| event_type | text | Yes | `—` |
| quantity | bigint | Yes | `—` |

Constraints:

- **usage_events_bucket_id_not_null**: `NOT NULL bucket_id`
- **usage_events_check**: `CHECK (job_id IS NULL OR entity_id IS NOT NULL)`
- **usage_events_created_at_not_null**: `NOT NULL created_at`
- **usage_events_event_type_check**: `CHECK (event_type = ANY (ARRAY['reserve'::text, 'consume'::text, 'release'::text]))`
- **usage_events_event_type_not_null**: `NOT NULL event_type`
- **usage_events_id_not_null**: `NOT NULL id`
- **usage_events_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **usage_events_pkey**: `PRIMARY KEY (id)`
- **usage_events_quantity_check**: `CHECK (quantity > 0)`
- **usage_events_quantity_not_null**: `NOT NULL quantity`
- **usage_events_tenant_id_bucket_id_fkey**: `FOREIGN KEY (tenant_id, bucket_id) REFERENCES mizan.usage_buckets(tenant_id, id)`
- **usage_events_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **usage_events_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **usage_events_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **usage_events_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **usage_events_tenant_id_idempotency_key_key**: `UNIQUE (tenant_id, idempotency_key)`
- **usage_events_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.usage_events FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER atomic_usage AFTER INSERT ON mizan.usage_events FOR EACH ROW EXECUTE FUNCTION mizan.apply_usage_event()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.usage_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## retention_policy_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| policy_code | text | Yes | `—` |
| version | integer | Yes | `—` |
| category | text | Yes | `—` |
| retention_days | integer | No | `—` |
| trigger_event | text | Yes | `—` |
| approved_by | uuid | No | `—` |
| approved_at | timestamp with time zone | No | `—` |
| legal_basis | text | Yes | `—` |

Constraints:

- **retention_policy_versions_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **retention_policy_versions_category_not_null**: `NOT NULL category`
- **retention_policy_versions_created_at_not_null**: `NOT NULL created_at`
- **retention_policy_versions_id_not_null**: `NOT NULL id`
- **retention_policy_versions_legal_basis_not_null**: `NOT NULL legal_basis`
- **retention_policy_versions_pkey**: `PRIMARY KEY (id)`
- **retention_policy_versions_policy_code_not_null**: `NOT NULL policy_code`
- **retention_policy_versions_retention_days_check**: `CHECK (retention_days >= 0)`
- **retention_policy_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **retention_policy_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **retention_policy_versions_tenant_id_not_null**: `NOT NULL tenant_id`
- **retention_policy_versions_tenant_id_policy_code_version_key**: `UNIQUE (tenant_id, policy_code, version)`
- **retention_policy_versions_trigger_event_not_null**: `NOT NULL trigger_event`
- **retention_policy_versions_version_check**: `CHECK (version > 0)`
- **retention_policy_versions_version_not_null**: `NOT NULL version`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.retention_policy_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.retention_policy_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## data_lifecycle_requests

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| entity_id | uuid | No | `—` |
| request_type | text | Yes | `—` |
| requested_by | uuid | Yes | `—` |
| authorized_by | uuid | No | `—` |
| reauth_session_id | uuid | No | `—` |
| authority_verified_at | timestamp with time zone | No | `—` |
| status | text | Yes | `'requested'::text` |
| idempotency_key | text | Yes | `—` |
| scope_definition | jsonb | Yes | `—` |
| completed_at | timestamp with time zone | No | `—` |
| reason | text | Yes | `—` |

Constraints:

- **data_lifecycle_requests_authorized_by_fkey**: `FOREIGN KEY (authorized_by) REFERENCES mizan.app_users(id)`
- **data_lifecycle_requests_created_at_not_null**: `NOT NULL created_at`
- **data_lifecycle_requests_id_not_null**: `NOT NULL id`
- **data_lifecycle_requests_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **data_lifecycle_requests_pkey**: `PRIMARY KEY (id)`
- **data_lifecycle_requests_reason_not_null**: `NOT NULL reason`
- **data_lifecycle_requests_reauth_session_id_fkey**: `FOREIGN KEY (reauth_session_id) REFERENCES mizan.user_sessions(id)`
- **data_lifecycle_requests_request_type_check**: `CHECK (request_type = ANY (ARRAY['export'::text, 'delete'::text, 'terminate'::text]))`
- **data_lifecycle_requests_request_type_not_null**: `NOT NULL request_type`
- **data_lifecycle_requests_requested_by_fkey**: `FOREIGN KEY (requested_by) REFERENCES mizan.app_users(id)`
- **data_lifecycle_requests_requested_by_not_null**: `NOT NULL requested_by`
- **data_lifecycle_requests_scope_definition_not_null**: `NOT NULL scope_definition`
- **data_lifecycle_requests_status_check**: `CHECK (status = ANY (ARRAY['requested'::text, 'authorized'::text, 'running'::text, 'partially_completed'::text, 'completed'::text, 'rejected'::text]))`
- **data_lifecycle_requests_status_not_null**: `NOT NULL status`
- **data_lifecycle_requests_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **data_lifecycle_requests_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **data_lifecycle_requests_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **data_lifecycle_requests_tenant_id_idempotency_key_key**: `UNIQUE (tenant_id, idempotency_key)`
- **data_lifecycle_requests_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.data_lifecycle_requests FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## legal_holds

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| entity_id | uuid | No | `—` |
| scope_definition | jsonb | Yes | `—` |
| reason | text | Yes | `—` |
| authority | text | Yes | `—` |
| authorized_by | uuid | Yes | `—` |
| review_due_at | timestamp with time zone | Yes | `—` |
| released_at | timestamp with time zone | No | `—` |
| release_reason | text | No | `—` |

Constraints:

- **legal_holds_authority_not_null**: `NOT NULL authority`
- **legal_holds_authorized_by_fkey**: `FOREIGN KEY (authorized_by) REFERENCES mizan.app_users(id)`
- **legal_holds_authorized_by_not_null**: `NOT NULL authorized_by`
- **legal_holds_check**: `CHECK (released_at IS NULL OR release_reason IS NOT NULL)`
- **legal_holds_created_at_not_null**: `NOT NULL created_at`
- **legal_holds_id_not_null**: `NOT NULL id`
- **legal_holds_pkey**: `PRIMARY KEY (id)`
- **legal_holds_reason_not_null**: `NOT NULL reason`
- **legal_holds_review_due_at_not_null**: `NOT NULL review_due_at`
- **legal_holds_scope_definition_not_null**: `NOT NULL scope_definition`
- **legal_holds_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **legal_holds_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **legal_holds_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **legal_holds_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.legal_holds FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## deletion_manifest

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| request_id | uuid | Yes | `—` |
| entity_id | uuid | No | `—` |
| resource_type | text | Yes | `—` |
| resource_locator_hash | text | Yes | `—` |
| provider | text | Yes | `—` |
| deleted_at | timestamp with time zone | No | `—` |
| backup_expiry_at | timestamp with time zone | No | `—` |
| reapply_on_restore | boolean | Yes | `true` |
| status | text | Yes | `'pending'::text` |

Constraints:

- **deletion_manifest_created_at_not_null**: `NOT NULL created_at`
- **deletion_manifest_id_not_null**: `NOT NULL id`
- **deletion_manifest_pkey**: `PRIMARY KEY (id)`
- **deletion_manifest_provider_not_null**: `NOT NULL provider`
- **deletion_manifest_reapply_on_restore_not_null**: `NOT NULL reapply_on_restore`
- **deletion_manifest_request_id_not_null**: `NOT NULL request_id`
- **deletion_manifest_resource_locator_hash_not_null**: `NOT NULL resource_locator_hash`
- **deletion_manifest_resource_type_not_null**: `NOT NULL resource_type`
- **deletion_manifest_status_check**: `CHECK (status = ANY (ARRAY['pending'::text, 'deleted'::text, 'held'::text, 'failed'::text]))`
- **deletion_manifest_status_not_null**: `NOT NULL status`
- **deletion_manifest_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **deletion_manifest_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **deletion_manifest_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **deletion_manifest_tenant_id_not_null**: `NOT NULL tenant_id`
- **deletion_manifest_tenant_id_request_id_fkey**: `FOREIGN KEY (tenant_id, request_id) REFERENCES mizan.data_lifecycle_requests(tenant_id, id)`
- **deletion_manifest_tenant_id_request_id_resource_type_resour_key**: `UNIQUE (tenant_id, request_id, resource_type, resource_locator_hash, provider)`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.deletion_manifest FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## backup_restore_runs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| backup_reference | text | Yes | `—` |
| restored_at | timestamp with time zone | Yes | `—` |
| deletions_reapplied_at | timestamp with time zone | No | `—` |
| access_revocations_reapplied_at | timestamp with time zone | No | `—` |
| released_at | timestamp with time zone | No | `—` |
| operator_id | uuid | Yes | `—` |

Constraints:

- **backup_restore_runs_backup_reference_not_null**: `NOT NULL backup_reference`
- **backup_restore_runs_check**: `CHECK (released_at IS NULL OR deletions_reapplied_at IS NOT NULL AND access_revocations_reapplied_at IS NOT NULL)`
- **backup_restore_runs_created_at_not_null**: `NOT NULL created_at`
- **backup_restore_runs_id_not_null**: `NOT NULL id`
- **backup_restore_runs_operator_id_fkey**: `FOREIGN KEY (operator_id) REFERENCES mizan.app_users(id)`
- **backup_restore_runs_operator_id_not_null**: `NOT NULL operator_id`
- **backup_restore_runs_pkey**: `PRIMARY KEY (id)`
- **backup_restore_runs_restored_at_not_null**: `NOT NULL restored_at`
- **backup_restore_runs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **backup_restore_runs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **backup_restore_runs_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.backup_restore_runs FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.backup_restore_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## support_requests

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| entity_id | uuid | No | `—` |
| requested_by | uuid | Yes | `—` |
| subject | text | Yes | `—` |
| description | text | Yes | `—` |
| status | text | Yes | `'open'::text` |

Constraints:

- **support_requests_created_at_not_null**: `NOT NULL created_at`
- **support_requests_description_not_null**: `NOT NULL description`
- **support_requests_id_not_null**: `NOT NULL id`
- **support_requests_pkey**: `PRIMARY KEY (id)`
- **support_requests_requested_by_fkey**: `FOREIGN KEY (requested_by) REFERENCES mizan.app_users(id)`
- **support_requests_requested_by_not_null**: `NOT NULL requested_by`
- **support_requests_status_check**: `CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))`
- **support_requests_status_not_null**: `NOT NULL status`
- **support_requests_subject_not_null**: `NOT NULL subject`
- **support_requests_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **support_requests_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **support_requests_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **support_requests_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.support_requests FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## support_access_grants

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| support_request_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| support_user_id | uuid | Yes | `—` |
| approved_by | uuid | Yes | `—` |
| permission_codes | text[] | Yes | `—` |
| reason | text | Yes | `—` |
| valid_from | timestamp with time zone | Yes | `—` |
| expires_at | timestamp with time zone | Yes | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **support_access_grants_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **support_access_grants_approved_by_not_null**: `NOT NULL approved_by`
- **support_access_grants_check**: `CHECK (expires_at > valid_from)`
- **support_access_grants_check1**: `CHECK (support_user_id <> approved_by)`
- **support_access_grants_created_at_not_null**: `NOT NULL created_at`
- **support_access_grants_entity_id_not_null**: `NOT NULL entity_id`
- **support_access_grants_expires_at_not_null**: `NOT NULL expires_at`
- **support_access_grants_id_not_null**: `NOT NULL id`
- **support_access_grants_permission_codes_not_null**: `NOT NULL permission_codes`
- **support_access_grants_pkey**: `PRIMARY KEY (id)`
- **support_access_grants_reason_not_null**: `NOT NULL reason`
- **support_access_grants_support_request_id_not_null**: `NOT NULL support_request_id`
- **support_access_grants_support_user_id_fkey**: `FOREIGN KEY (support_user_id) REFERENCES mizan.app_users(id)`
- **support_access_grants_support_user_id_not_null**: `NOT NULL support_user_id`
- **support_access_grants_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **support_access_grants_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **support_access_grants_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **support_access_grants_tenant_id_not_null**: `NOT NULL tenant_id`
- **support_access_grants_tenant_id_support_request_id_fkey**: `FOREIGN KEY (tenant_id, support_request_id) REFERENCES mizan.support_requests(tenant_id, id)`
- **support_access_grants_valid_from_not_null**: `NOT NULL valid_from`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.support_access_grants FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## support_access_events

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| grant_id | uuid | Yes | `—` |
| actor_id | uuid | Yes | `—` |
| action | text | Yes | `—` |
| object_type | text | Yes | `—` |
| object_id | uuid | Yes | `—` |

Constraints:

- **support_access_events_action_not_null**: `NOT NULL action`
- **support_access_events_actor_id_fkey**: `FOREIGN KEY (actor_id) REFERENCES mizan.app_users(id)`
- **support_access_events_actor_id_not_null**: `NOT NULL actor_id`
- **support_access_events_created_at_not_null**: `NOT NULL created_at`
- **support_access_events_grant_id_not_null**: `NOT NULL grant_id`
- **support_access_events_id_not_null**: `NOT NULL id`
- **support_access_events_object_id_not_null**: `NOT NULL object_id`
- **support_access_events_object_type_not_null**: `NOT NULL object_type`
- **support_access_events_pkey**: `PRIMARY KEY (id)`
- **support_access_events_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **support_access_events_tenant_id_grant_id_fkey**: `FOREIGN KEY (tenant_id, grant_id) REFERENCES mizan.support_access_grants(tenant_id, id)`
- **support_access_events_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **support_access_events_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER active_support_grant BEFORE INSERT ON mizan.support_access_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_support_access_event()`
- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.support_access_events FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.support_access_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## integration_connections

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| provider | text | Yes | `—` |
| credential_secret_reference | text | Yes | `—` |
| granted_scopes | text[] | Yes | `—` |
| read_only | boolean | Yes | `true` |
| status | text | Yes | `'disabled'::text` |
| consented_by | uuid | Yes | `—` |
| consented_at | timestamp with time zone | Yes | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **integration_connections_consented_at_not_null**: `NOT NULL consented_at`
- **integration_connections_consented_by_fkey**: `FOREIGN KEY (consented_by) REFERENCES mizan.app_users(id)`
- **integration_connections_consented_by_not_null**: `NOT NULL consented_by`
- **integration_connections_created_at_not_null**: `NOT NULL created_at`
- **integration_connections_credential_secret_reference_not_null**: `NOT NULL credential_secret_reference`
- **integration_connections_entity_id_not_null**: `NOT NULL entity_id`
- **integration_connections_granted_scopes_not_null**: `NOT NULL granted_scopes`
- **integration_connections_id_not_null**: `NOT NULL id`
- **integration_connections_pkey**: `PRIMARY KEY (id)`
- **integration_connections_provider_not_null**: `NOT NULL provider`
- **integration_connections_read_only_check**: `CHECK (read_only)`
- **integration_connections_read_only_not_null**: `NOT NULL read_only`
- **integration_connections_status_check**: `CHECK (status = ANY (ARRAY['disabled'::text, 'active'::text, 'revoked'::text, 'failed'::text]))`
- **integration_connections_status_not_null**: `NOT NULL status`
- **integration_connections_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **integration_connections_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **integration_connections_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **integration_connections_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **integration_connections_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.integration_connections FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## sync_runs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| connection_id | uuid | Yes | `—` |
| job_id | uuid | Yes | `—` |
| cursor_before | text | No | `—` |
| cursor_after | text | No | `—` |
| idempotency_key | text | Yes | `—` |
| status | text | Yes | `'queued'::text` |

Constraints:

- **sync_runs_connection_id_not_null**: `NOT NULL connection_id`
- **sync_runs_created_at_not_null**: `NOT NULL created_at`
- **sync_runs_entity_id_not_null**: `NOT NULL entity_id`
- **sync_runs_id_not_null**: `NOT NULL id`
- **sync_runs_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **sync_runs_job_id_not_null**: `NOT NULL job_id`
- **sync_runs_pkey**: `PRIMARY KEY (id)`
- **sync_runs_status_check**: `CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text]))`
- **sync_runs_status_not_null**: `NOT NULL status`
- **sync_runs_tenant_id_entity_id_connection_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, connection_id) REFERENCES mizan.integration_connections(tenant_id, entity_id, id)`
- **sync_runs_tenant_id_entity_id_connection_id_idempotency_key_key**: `UNIQUE (tenant_id, entity_id, connection_id, idempotency_key)`
- **sync_runs_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **sync_runs_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **sync_runs_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **sync_runs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **sync_runs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **sync_runs_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.sync_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## external_record_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| connection_id | uuid | Yes | `—` |
| external_id | text | Yes | `—` |
| external_version | text | Yes | `—` |
| source_row_id | uuid | No | `—` |
| deleted_in_source | boolean | Yes | `false` |
| conflict_reason | text | No | `—` |
| sync_run_id | uuid | Yes | `—` |

Constraints:

- **external_record_versions_connection_id_not_null**: `NOT NULL connection_id`
- **external_record_versions_created_at_not_null**: `NOT NULL created_at`
- **external_record_versions_deleted_in_source_not_null**: `NOT NULL deleted_in_source`
- **external_record_versions_entity_id_not_null**: `NOT NULL entity_id`
- **external_record_versions_external_id_not_null**: `NOT NULL external_id`
- **external_record_versions_external_version_not_null**: `NOT NULL external_version`
- **external_record_versions_id_not_null**: `NOT NULL id`
- **external_record_versions_pkey**: `PRIMARY KEY (id)`
- **external_record_versions_sync_run_id_not_null**: `NOT NULL sync_run_id`
- **external_record_versions_tenant_id_entity_id_connection_id__key**: `UNIQUE (tenant_id, entity_id, connection_id, external_id, external_version)`
- **external_record_versions_tenant_id_entity_id_connection_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, connection_id) REFERENCES mizan.integration_connections(tenant_id, entity_id, id)`
- **external_record_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **external_record_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **external_record_versions_tenant_id_entity_id_source_row_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_row_id) REFERENCES mizan.source_rows(tenant_id, entity_id, id)`
- **external_record_versions_tenant_id_entity_id_sync_run_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, sync_run_id) REFERENCES mizan.sync_runs(tenant_id, entity_id, id)`
- **external_record_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **external_record_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **external_record_versions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON mizan.external_record_versions FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.external_record_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## api_clients

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| name | text | Yes | `—` |
| credential_hash | text | Yes | `—` |
| permission_codes | text[] | Yes | `—` |
| rate_limit_policy | jsonb | Yes | `—` |
| expires_at | timestamp with time zone | No | `—` |
| revoked_at | timestamp with time zone | No | `—` |
| created_by | uuid | Yes | `—` |

Constraints:

- **api_clients_created_at_not_null**: `NOT NULL created_at`
- **api_clients_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **api_clients_created_by_not_null**: `NOT NULL created_by`
- **api_clients_credential_hash_key**: `UNIQUE (credential_hash)`
- **api_clients_credential_hash_not_null**: `NOT NULL credential_hash`
- **api_clients_id_not_null**: `NOT NULL id`
- **api_clients_name_not_null**: `NOT NULL name`
- **api_clients_permission_codes_not_null**: `NOT NULL permission_codes`
- **api_clients_pkey**: `PRIMARY KEY (id)`
- **api_clients_rate_limit_policy_not_null**: `NOT NULL rate_limit_policy`
- **api_clients_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **api_clients_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **api_clients_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.api_clients FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## api_client_entities

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| api_client_id | uuid | Yes | `—` |

Constraints:

- **api_client_entities_api_client_id_not_null**: `NOT NULL api_client_id`
- **api_client_entities_created_at_not_null**: `NOT NULL created_at`
- **api_client_entities_entity_id_not_null**: `NOT NULL entity_id`
- **api_client_entities_id_not_null**: `NOT NULL id`
- **api_client_entities_pkey**: `PRIMARY KEY (id)`
- **api_client_entities_tenant_id_api_client_id_fkey**: `FOREIGN KEY (tenant_id, api_client_id) REFERENCES mizan.api_clients(tenant_id, id)`
- **api_client_entities_tenant_id_entity_id_api_client_id_key**: `UNIQUE (tenant_id, entity_id, api_client_id)`
- **api_client_entities_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **api_client_entities_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **api_client_entities_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **api_client_entities_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **api_client_entities_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.api_client_entities FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## api_idempotency_keys

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| api_client_id | uuid | Yes | `—` |
| idempotency_key | text | Yes | `—` |
| request_hash | text | Yes | `—` |
| response_code | integer | No | `—` |
| response_object_id | uuid | No | `—` |
| expires_at | timestamp with time zone | Yes | `—` |

Constraints:

- **api_idempotency_keys_api_client_id_not_null**: `NOT NULL api_client_id`
- **api_idempotency_keys_created_at_not_null**: `NOT NULL created_at`
- **api_idempotency_keys_expires_at_not_null**: `NOT NULL expires_at`
- **api_idempotency_keys_id_not_null**: `NOT NULL id`
- **api_idempotency_keys_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **api_idempotency_keys_pkey**: `PRIMARY KEY (id)`
- **api_idempotency_keys_request_hash_not_null**: `NOT NULL request_hash`
- **api_idempotency_keys_tenant_id_api_client_id_fkey**: `FOREIGN KEY (tenant_id, api_client_id) REFERENCES mizan.api_clients(tenant_id, id)`
- **api_idempotency_keys_tenant_id_api_client_id_idempotency_ke_key**: `UNIQUE (tenant_id, api_client_id, idempotency_key)`
- **api_idempotency_keys_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **api_idempotency_keys_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **api_idempotency_keys_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.api_idempotency_keys FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## webhook_endpoints

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| url | text | Yes | `—` |
| signing_secret_reference | text | Yes | `—` |
| event_types | text[] | Yes | `—` |
| status | text | Yes | `'disabled'::text` |
| created_by | uuid | Yes | `—` |

Constraints:

- **webhook_endpoints_created_at_not_null**: `NOT NULL created_at`
- **webhook_endpoints_created_by_fkey**: `FOREIGN KEY (created_by) REFERENCES mizan.app_users(id)`
- **webhook_endpoints_created_by_not_null**: `NOT NULL created_by`
- **webhook_endpoints_event_types_not_null**: `NOT NULL event_types`
- **webhook_endpoints_id_not_null**: `NOT NULL id`
- **webhook_endpoints_pkey**: `PRIMARY KEY (id)`
- **webhook_endpoints_signing_secret_reference_not_null**: `NOT NULL signing_secret_reference`
- **webhook_endpoints_status_check**: `CHECK (status = ANY (ARRAY['disabled'::text, 'active'::text]))`
- **webhook_endpoints_status_not_null**: `NOT NULL status`
- **webhook_endpoints_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **webhook_endpoints_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **webhook_endpoints_tenant_id_not_null**: `NOT NULL tenant_id`
- **webhook_endpoints_url_check**: `CHECK (url ~~ 'https://%'::text)`
- **webhook_endpoints_url_not_null**: `NOT NULL url`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## webhook_deliveries

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| endpoint_id | uuid | Yes | `—` |
| event_id | uuid | Yes | `—` |
| idempotency_key | text | Yes | `—` |
| attempt_count | integer | Yes | `0` |
| next_attempt_at | timestamp with time zone | No | `—` |
| status | text | Yes | `'queued'::text` |
| payload_hash | text | Yes | `—` |
| last_http_status | integer | No | `—` |

Constraints:

- **webhook_deliveries_attempt_count_check**: `CHECK (attempt_count >= 0)`
- **webhook_deliveries_attempt_count_not_null**: `NOT NULL attempt_count`
- **webhook_deliveries_created_at_not_null**: `NOT NULL created_at`
- **webhook_deliveries_endpoint_id_not_null**: `NOT NULL endpoint_id`
- **webhook_deliveries_event_id_not_null**: `NOT NULL event_id`
- **webhook_deliveries_id_not_null**: `NOT NULL id`
- **webhook_deliveries_idempotency_key_not_null**: `NOT NULL idempotency_key`
- **webhook_deliveries_payload_hash_not_null**: `NOT NULL payload_hash`
- **webhook_deliveries_pkey**: `PRIMARY KEY (id)`
- **webhook_deliveries_status_check**: `CHECK (status = ANY (ARRAY['queued'::text, 'delivered'::text, 'failed'::text, 'dead_letter'::text]))`
- **webhook_deliveries_status_not_null**: `NOT NULL status`
- **webhook_deliveries_tenant_id_endpoint_id_event_id_key**: `UNIQUE (tenant_id, endpoint_id, event_id)`
- **webhook_deliveries_tenant_id_endpoint_id_fkey**: `FOREIGN KEY (tenant_id, endpoint_id) REFERENCES mizan.webhook_endpoints(tenant_id, id)`
- **webhook_deliveries_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **webhook_deliveries_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **webhook_deliveries_tenant_id_idempotency_key_key**: `UNIQUE (tenant_id, idempotency_key)`
- **webhook_deliveries_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## webhook_receipts

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| provider | text | Yes | `—` |
| provider_event_id | text | Yes | `—` |
| signature_verified_at | timestamp with time zone | Yes | `—` |
| provider_timestamp | timestamp with time zone | Yes | `—` |
| payload_hash | text | Yes | `—` |
| nonce_hash | text | Yes | `—` |
| status | text | Yes | `'received'::text` |

Constraints:

- **webhook_receipts_created_at_not_null**: `NOT NULL created_at`
- **webhook_receipts_id_not_null**: `NOT NULL id`
- **webhook_receipts_nonce_hash_not_null**: `NOT NULL nonce_hash`
- **webhook_receipts_payload_hash_not_null**: `NOT NULL payload_hash`
- **webhook_receipts_pkey**: `PRIMARY KEY (id)`
- **webhook_receipts_provider_event_id_not_null**: `NOT NULL provider_event_id`
- **webhook_receipts_provider_not_null**: `NOT NULL provider`
- **webhook_receipts_provider_timestamp_not_null**: `NOT NULL provider_timestamp`
- **webhook_receipts_signature_verified_at_not_null**: `NOT NULL signature_verified_at`
- **webhook_receipts_status_check**: `CHECK (status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text]))`
- **webhook_receipts_status_not_null**: `NOT NULL status`
- **webhook_receipts_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **webhook_receipts_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **webhook_receipts_tenant_id_not_null**: `NOT NULL tenant_id`
- **webhook_receipts_tenant_id_provider_nonce_hash_key**: `UNIQUE (tenant_id, provider, nonce_hash)`
- **webhook_receipts_tenant_id_provider_provider_event_id_key**: `UNIQUE (tenant_id, provider, provider_event_id)`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.webhook_receipts FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## provider_approvals

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| provider | text | Yes | `—` |
| service_type | text | Yes | `—` |
| processing_region | text | Yes | `—` |
| contract_reference | text | Yes | `—` |
| no_training | boolean | Yes | `false` |
| approved_by | uuid | Yes | `—` |
| approved_at | timestamp with time zone | Yes | `—` |
| revoked_at | timestamp with time zone | No | `—` |

Constraints:

- **provider_approvals_approved_at_not_null**: `NOT NULL approved_at`
- **provider_approvals_approved_by_fkey**: `FOREIGN KEY (approved_by) REFERENCES mizan.app_users(id)`
- **provider_approvals_approved_by_not_null**: `NOT NULL approved_by`
- **provider_approvals_contract_reference_not_null**: `NOT NULL contract_reference`
- **provider_approvals_created_at_not_null**: `NOT NULL created_at`
- **provider_approvals_id_not_null**: `NOT NULL id`
- **provider_approvals_no_training_not_null**: `NOT NULL no_training`
- **provider_approvals_pkey**: `PRIMARY KEY (id)`
- **provider_approvals_processing_region_not_null**: `NOT NULL processing_region`
- **provider_approvals_provider_not_null**: `NOT NULL provider`
- **provider_approvals_service_type_check**: `CHECK (service_type = ANY (ARRAY['ocr'::text, 'ai'::text]))`
- **provider_approvals_service_type_not_null**: `NOT NULL service_type`
- **provider_approvals_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **provider_approvals_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **provider_approvals_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.provider_approvals FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER provider_approval_revision BEFORE DELETE OR UPDATE ON mizan.provider_approvals FOR EACH ROW EXECUTE FUNCTION mizan.guard_provider_approval_revision()`

## ocr_runs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| source_file_id | uuid | Yes | `—` |
| provider_approval_id | uuid | Yes | `—` |
| job_id | uuid | Yes | `—` |
| model_version | text | Yes | `—` |
| status | text | Yes | `'queued'::text` |

Constraints:

- **ocr_runs_created_at_not_null**: `NOT NULL created_at`
- **ocr_runs_entity_id_not_null**: `NOT NULL entity_id`
- **ocr_runs_id_not_null**: `NOT NULL id`
- **ocr_runs_job_id_not_null**: `NOT NULL job_id`
- **ocr_runs_model_version_not_null**: `NOT NULL model_version`
- **ocr_runs_pkey**: `PRIMARY KEY (id)`
- **ocr_runs_provider_approval_id_not_null**: `NOT NULL provider_approval_id`
- **ocr_runs_source_file_id_not_null**: `NOT NULL source_file_id`
- **ocr_runs_status_check**: `CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'needs_review'::text, 'succeeded'::text, 'failed'::text]))`
- **ocr_runs_status_not_null**: `NOT NULL status`
- **ocr_runs_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **ocr_runs_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **ocr_runs_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **ocr_runs_tenant_id_entity_id_source_file_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, source_file_id) REFERENCES mizan.source_files(tenant_id, entity_id, id)`
- **ocr_runs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **ocr_runs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **ocr_runs_tenant_id_not_null**: `NOT NULL tenant_id`
- **ocr_runs_tenant_id_provider_approval_id_fkey**: `FOREIGN KEY (tenant_id, provider_approval_id) REFERENCES mizan.provider_approvals(tenant_id, id)`

Triggers:

- `CREATE TRIGGER approved_ocr_provider BEFORE INSERT ON mizan.ocr_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_provider_run()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.ocr_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## ocr_fields

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| ocr_run_id | uuid | Yes | `—` |
| page_number | integer | Yes | `—` |
| field_name | text | Yes | `—` |
| extracted_value_ciphertext | text | Yes | `—` |
| confidence | numeric | No | `—` |
| reviewed_by | uuid | No | `—` |
| reviewed_at | timestamp with time zone | No | `—` |
| corrected_value_ciphertext | text | No | `—` |

Constraints:

- **ocr_fields_check**: `CHECK (reviewed_at IS NULL OR reviewed_by IS NOT NULL)`
- **ocr_fields_confidence_check**: `CHECK (confidence >= 0::numeric AND confidence <= 1::numeric)`
- **ocr_fields_created_at_not_null**: `NOT NULL created_at`
- **ocr_fields_entity_id_not_null**: `NOT NULL entity_id`
- **ocr_fields_extracted_value_ciphertext_not_null**: `NOT NULL extracted_value_ciphertext`
- **ocr_fields_field_name_not_null**: `NOT NULL field_name`
- **ocr_fields_id_not_null**: `NOT NULL id`
- **ocr_fields_ocr_run_id_not_null**: `NOT NULL ocr_run_id`
- **ocr_fields_page_number_check**: `CHECK (page_number > 0)`
- **ocr_fields_page_number_not_null**: `NOT NULL page_number`
- **ocr_fields_pkey**: `PRIMARY KEY (id)`
- **ocr_fields_reviewed_by_fkey**: `FOREIGN KEY (reviewed_by) REFERENCES mizan.app_users(id)`
- **ocr_fields_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **ocr_fields_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **ocr_fields_tenant_id_entity_id_ocr_run_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, ocr_run_id) REFERENCES mizan.ocr_runs(tenant_id, entity_id, id)`
- **ocr_fields_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **ocr_fields_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **ocr_fields_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.ocr_fields FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`

## ai_narrative_runs

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| provider_approval_id | uuid | Yes | `—` |
| job_id | uuid | Yes | `—` |
| model_version | text | Yes | `—` |
| prompt_template_version | text | Yes | `—` |
| source_references | jsonb | Yes | `'{}'::jsonb` |
| minimized_request_hash | text | Yes | `—` |
| status | text | Yes | `'queued'::text` |

Constraints:

- **ai_narrative_runs_created_at_not_null**: `NOT NULL created_at`
- **ai_narrative_runs_entity_id_not_null**: `NOT NULL entity_id`
- **ai_narrative_runs_id_not_null**: `NOT NULL id`
- **ai_narrative_runs_job_id_not_null**: `NOT NULL job_id`
- **ai_narrative_runs_minimized_request_hash_not_null**: `NOT NULL minimized_request_hash`
- **ai_narrative_runs_model_version_not_null**: `NOT NULL model_version`
- **ai_narrative_runs_output_version_id_not_null**: `NOT NULL output_version_id`
- **ai_narrative_runs_pkey**: `PRIMARY KEY (id)`
- **ai_narrative_runs_prompt_template_version_not_null**: `NOT NULL prompt_template_version`
- **ai_narrative_runs_provider_approval_id_not_null**: `NOT NULL provider_approval_id`
- **ai_narrative_runs_source_references_check**: `CHECK (jsonb_typeof(source_references) = 'object'::text)`
- **ai_narrative_runs_source_references_not_null**: `NOT NULL source_references`
- **ai_narrative_runs_status_check**: `CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text]))`
- **ai_narrative_runs_status_not_null**: `NOT NULL status`
- **ai_narrative_runs_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **ai_narrative_runs_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **ai_narrative_runs_tenant_id_entity_id_job_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, job_id) REFERENCES mizan.processing_jobs(tenant_id, entity_id, id)`
- **ai_narrative_runs_tenant_id_entity_id_output_version_id_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **ai_narrative_runs_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **ai_narrative_runs_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **ai_narrative_runs_tenant_id_not_null**: `NOT NULL tenant_id`
- **ai_narrative_runs_tenant_id_provider_approval_id_fkey**: `FOREIGN KEY (tenant_id, provider_approval_id) REFERENCES mizan.provider_approvals(tenant_id, id)`

Triggers:

- `CREATE TRIGGER approved_ai_provider BEFORE INSERT ON mizan.ai_narrative_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_provider_run()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.ai_narrative_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.ai_narrative_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## output_budget_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| budget_version_id | uuid | Yes | `—` |

Constraints:

- **output_budget_versions_budget_version_id_not_null**: `NOT NULL budget_version_id`
- **output_budget_versions_created_at_not_null**: `NOT NULL created_at`
- **output_budget_versions_entity_id_not_null**: `NOT NULL entity_id`
- **output_budget_versions_id_not_null**: `NOT NULL id`
- **output_budget_versions_output_version_id_not_null**: `NOT NULL output_version_id`
- **output_budget_versions_pkey**: `PRIMARY KEY (id)`
- **output_budget_versions_tenant_id_entity_id_budget_version__fkey**: `FOREIGN KEY (tenant_id, entity_id, budget_version_id) REFERENCES mizan.budget_versions(tenant_id, entity_id, id)`
- **output_budget_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **output_budget_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **output_budget_versions_tenant_id_entity_id_output_version__fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **output_budget_versions_tenant_id_entity_id_output_version_i_key**: `UNIQUE (tenant_id, entity_id, output_version_id, budget_version_id)`
- **output_budget_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **output_budget_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **output_budget_versions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER budget_binding_compatible BEFORE INSERT OR UPDATE ON mizan.output_budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_budget_binding()`
- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.output_budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.output_budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`

## output_planning_versions

| Column | Type | Required | Default |
|---|---|---|---|
| id | uuid | Yes | `gen_random_uuid()` |
| tenant_id | uuid | Yes | `—` |
| entity_id | uuid | Yes | `—` |
| created_at | timestamp with time zone | Yes | `now()` |
| output_version_id | uuid | Yes | `—` |
| planning_version_id | uuid | Yes | `—` |

Constraints:

- **output_planning_versions_created_at_not_null**: `NOT NULL created_at`
- **output_planning_versions_entity_id_not_null**: `NOT NULL entity_id`
- **output_planning_versions_id_not_null**: `NOT NULL id`
- **output_planning_versions_output_version_id_not_null**: `NOT NULL output_version_id`
- **output_planning_versions_pkey**: `PRIMARY KEY (id)`
- **output_planning_versions_planning_version_id_not_null**: `NOT NULL planning_version_id`
- **output_planning_versions_tenant_id_entity_id_fkey**: `FOREIGN KEY (tenant_id, entity_id) REFERENCES mizan.legal_entities(tenant_id, id)`
- **output_planning_versions_tenant_id_entity_id_id_key**: `UNIQUE (tenant_id, entity_id, id)`
- **output_planning_versions_tenant_id_entity_id_output_versio_fkey**: `FOREIGN KEY (tenant_id, entity_id, output_version_id) REFERENCES mizan.output_versions(tenant_id, entity_id, id)`
- **output_planning_versions_tenant_id_entity_id_output_version_key**: `UNIQUE (tenant_id, entity_id, output_version_id, planning_version_id)`
- **output_planning_versions_tenant_id_entity_id_planning_vers_fkey**: `FOREIGN KEY (tenant_id, entity_id, planning_version_id) REFERENCES mizan.planning_versions(tenant_id, entity_id, id)`
- **output_planning_versions_tenant_id_fkey**: `FOREIGN KEY (tenant_id) REFERENCES mizan.tenants(id)`
- **output_planning_versions_tenant_id_id_key**: `UNIQUE (tenant_id, id)`
- **output_planning_versions_tenant_id_not_null**: `NOT NULL tenant_id`

Triggers:

- `CREATE TRIGGER identity_immutable BEFORE UPDATE ON mizan.output_planning_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_identity()`
- `CREATE TRIGGER output_editable BEFORE INSERT OR DELETE OR UPDATE ON mizan.output_planning_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_child('output_version_id')`
