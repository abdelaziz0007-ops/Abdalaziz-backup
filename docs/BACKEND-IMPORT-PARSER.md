# Exact tabular reader and mapping foundation

The source panel exposes a read-only CSV/XLSX preview through `POST /api/v1/tenants/:tenantId/entities/:entityId/source-files/:sourceId/preview`. The endpoint requires `imports.manage`, recent MFA, and a completed scan for that source. It verifies the encrypted original against its stored hash and size before parsing. Before returning rows, it checks access and scan evidence again and records a preview audit event. A mapped preview uses the selected accounting period's currency precision.

## Local preview runtime

Build the preview image from the project root on a host with a local Linux Docker engine.

```powershell
docker build -f server/parser/Dockerfile -t mizan-import-preview:local .
docker image inspect mizan-import-preview:local --format '{{.Id}}'
```

Set `IMPORT_PREVIEW_IMAGE` in the server environment to the returned `sha256:...` image ID and restart the app. A running ClamAV scan worker must independently process the source before the preview is available. Open **Sources and scan jobs**, select a source that passed scanning, and choose **Read source rows**. The mapping form appears after the raw preview loads.

The app starts one preview at a time per server process. It uses a local, prebuilt image and transfers source bytes through stdin. The container has no network access or host mounts and receives no app credentials. It runs as a non-root user with a read-only filesystem and limits on memory, CPU, processes, execution time, and response size. Docker logging is disabled for these containers to keep plaintext rows out of daemon logs. [Docker run options](https://docs.docker.com/reference/cli/docker/container/run/)

## Original values and limits

`server/parser/tabular-core.mjs` preserves original text, worksheet name, row number and CSV physical start line. XLSX numeric XML values remain decimal/scientific strings, including digits beyond JavaScript's safe integer range; the implementation never converts financial amounts through `Number`. Shared/inline/rich text and sparse row/column references are supported. Workbook date-system metadata remains explicit. Formulas, workbook errors, macros, embedded objects, external workbook references, DTD/entity declarations and active query parts are rejected rather than evaluated or silently replaced by stale cached results.

The reader supports files up to 50 MiB, 100,000 rows across worksheets and 256 columns. A field is limited to 64 KiB; preview output has at most 200 rows per sheet and 512 Ki characters across previews. Limits are conservative implementation bounds and do not prove SRS performance acceptance. Large text previews require fewer rows. All rows are checked even when only the bounded preview is returned.

XLSX ZIP central/local metadata is checked before inflation: no encrypted/multi-volume/ZIP64 archives, unsafe/duplicate paths, symlinks or unsupported compression. Declared expanded content is limited to 200 MiB and a 100:1 expansion ratio. Used parts are inflated individually using Node's `maxOutputLength`; their actual sizes and CRC32 are verified. A forged small declared size cannot cause unlimited inflation. These controls complement OS resource/network isolation; they do not substitute for it.

## Explicit mapping and corrections

`server/parser/field-mapping.mjs` previews trial balances, general ledgers and bank/book ledgers. Users must choose sheet/header row, explicit one-based column positions, number separators and date interpretation. Original fields and source coordinates remain separate from derived values. Invalid rows return blocking field/row errors; potential duplicate identities produce warnings without removing rows.

Decimal/thousands separators must be distinct and consistent. Grouping is validated; arbitrary rounding is rejected. Canonical XLSX numeric notation is expanded exactly before currency-precision validation. Trailing zero removal is exact. Dates support explicit ISO, day/month/year, month/day/year or numeric Excel serial interpretation. The fictitious 1900-02-29, fractional posting dates and invalid calendar days are rejected; both Excel date systems use UTC calculations independent of host timezone.

After reviewing explicitly mapped rows, the user can save the mapping as an independent template or as a new version of a previous template. The server reruns the mapping and records the validated headers. Each save appends an immutable row in the existing template table. Retries of the same request return the saved version. A concurrent edit against an older version prompts the user to reload the latest version.

The template selector lists the latest version of each template in the current entity. A template binds each mapped field to its header and column position. Renamed, missing or moved mapped columns cause `TEMPLATE_COLUMN_DRIFT` and ask the user to review the mapping. Unmapped columns may be added if the mapped headers remain in place. The user selects a period when applying the template, so amount precision comes from that period.

## Staging and row review

After a template preview, **Stage all worksheet rows for review** reads every data row after the selected header. The import uses the same scan and permission gates as preview and requires an open period. This first staging path supports up to 5,000 physical rows per selected sheet, 512 Ki characters of source text and the existing 8 MiB parser response bound. Requests outside those limits return an error.

The source bytes remain in encrypted object storage. Original row cells and mapped values are encrypted in the database. A repeat request for the same source, template version and period returns the existing batch. The review panel displays original and current mapped values, blocking issues, warning messages, record counts, and exact before and after totals. Missing amounts are counted separately.

Corrections use the selected template's input format and record the actor, reason and row version. A user can also exclude or reinstate a row. All these actions append a transformation and a fresh quality run. The checks cover duplicate row identities, posting dates outside the period, classifications, trial-balance totals, and the balance of each general-ledger journal. A stale edit asks the user to reload. Apply migration `018_staged_import_corrections.sql` before serving the review endpoints.

## Dataset publication

The review panel can publish complete period trial balances and general ledgers after the user confirms completeness and supplies a reason. Publication requires recent MFA, an open period, current scan evidence, and the exact latest validation reviewed by the user. The first publication policy requires every source data row to be accepted. An exclusion therefore keeps the batch in review. An existing ledger account must be active, and a trial-balance account must agree with the recorded account type.

Publication creates typed rows and links them to their source rows, then publishes the dataset and freezes the import and row history in one database transaction. Retrying returns the existing dataset. Prior quality runs remain available in the database. Apply migration `019_staged_dataset_publication.sql` before enabling publication.

Bank statements and bank ledgers also require an active bank account in the period currency, explicit opening and closing balances, and confirmation of cash-increase-positive signs. The service checks each supplied running balance and the exact period roll-forward. The database repeats these checks before publication and rejects overlapping periods for the same account and source type. Each side is limited to 1,000 movements, in line with the connected reconciliation workspace. Migration `020_staged_bank_publication.sql` adds the immutable balance records.

In **Connected bank reconciliation**, choose **Create reconciliation from published datasets** to pair published versions for the same account, currency, period and sign policy. The workflow creates a draft at the period end with matching suggestions. The exact pair reopens its existing reconciliation when retried. It retains the separate matching and review steps.

## Reports from a published trial balance

Choose **Reports from a published trial balance** in the connected financial workspace and confirm the period earnings basis. With recent MFA and reporting and preparation permissions, an open-period version generates one set of income statement, financial position and analysis drafts. The same input returns the existing set on retry. A period with approved reports requires a separate reopening before preparing a replacement.

The calculation uses exact signed closing balances and the classifications from the frozen source history. The database checks the source scan and publishes the complete account mapping through a restricted function in migration `021_published_trial_balance_reports.sql`. Report lines link to source rows and to the correction used in the calculation. Independent review is required for approval. Cash flow and comparative analysis require separate sources and policies.

## Evidence and remaining work

`server/parser/tabular-core.test.mjs` and `field-mapping.test.mjs` exercise real generated XLSX ZIP/XML fixtures and raw CSV sources: exact numeric text, scientific notation, locale grouping, multiline source coordinates, calendar/date-system cases, template drift, duplicates, blocking ledger errors, formulas beyond the visible preview, external/active content, malformed XML/ZIP, CRC corruption, lying inflation metadata and preview limits.

Existing `saxes@5.0.1` is now declared as a direct runtime dependency and existing `jszip@3.10.2` as a development fixture dependency; no installed transitive package versions changed. The reader itself uses bounded Node zlib inflation, not JSZip's whole-archive async decompression. Dependency audit currently reports eight moderate findings in the existing ExcelJS dependency tree (minimatch/uuid and affected parents), zero high and zero critical. No forced downgrade or unverified override was applied. Full security/call-path assessment and export-library remediation remain tracked work.

`server/source-preview-routes.test.mjs` exercises the HTTP scan gate, permission revocation during processing, period currency precision, and the parser process protocol. It also covers idempotent template saves, appended versions, stale-version conflicts and column drift. These checks use a fixture for database and scanner state. All eight preview and template SQL statements were also prepared and planned with application credentials in a read-only transaction on the Neon test branch. The production path requires Docker and a successful real scan. Docker was unavailable on the development host, so container build and live scan-to-preview acceptance remain pending.

The rollback-only Neon test in `verification/staged-imports-api.mjs` covers whole-sheet staging, retry, versioned corrections, preserved originals, exact revalidation, exclusions, stale publication requests, typed publication, financial draft generation with corrected evidence, and pairing published bank datasets. It uses synthetic scan evidence, MFA session state and source bytes inside the transaction.

Remaining work includes live scan-to-import verification, independent acceptance for published financial reports, final reconciliation validation and approval, asynchronous cancellation and retry, and large-file, concurrency, and security acceptance.
