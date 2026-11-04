# Exact tabular reader and mapping foundation

This batch implements a bounded, read-only CSV/XLSX reader and field-mapping core. It is **not yet a deployed import worker or an API that processes uploaded sources**. Public source processing must first verify a real clean scan and run the parser inside a properly isolated, resource-limited worker. No source is marked clean or published by these modules.

## Original values and limits

`server/parser/tabular-core.mjs` preserves original text, worksheet name, row number and CSV physical start line. XLSX numeric XML values remain decimal/scientific strings, including digits beyond JavaScript's safe integer range; the implementation never converts financial amounts through `Number`. Shared/inline/rich text and sparse row/column references are supported. Workbook date-system metadata remains explicit. Formulas, workbook errors, macros, embedded objects, external workbook references, DTD/entity declarations and active query parts are rejected rather than evaluated or silently replaced by stale cached results.

The reader supports files up to 50 MiB, 100,000 rows across worksheets and 256 columns. A field is limited to 64 KiB; preview output has at most 200 rows per sheet and 512 Ki characters across previews. Limits are conservative implementation bounds and do not prove SRS performance acceptance. Large text previews require fewer rows. All rows are checked even when only the bounded preview is returned.

XLSX ZIP central/local metadata is checked before inflation: no encrypted/multi-volume/ZIP64 archives, unsafe/duplicate paths, symlinks or unsupported compression. Declared expanded content is limited to 200 MiB and a 100:1 expansion ratio. Used parts are inflated individually using Node's `maxOutputLength`; their actual sizes and CRC32 are verified. A forged small declared size cannot cause unlimited inflation. These controls complement OS resource/network isolation; they do not substitute for it.

## Explicit mapping and corrections

`server/parser/field-mapping.mjs` previews trial balances, general ledgers and bank/book ledgers. Users must choose sheet/header row, explicit one-based column positions, number separators and date interpretation. Original fields and source coordinates remain separate from derived values. Invalid rows return blocking field/row errors; potential duplicate identities produce warnings without removing rows.

Decimal/thousands separators must be distinct and consistent. Grouping is validated; arbitrary rounding is rejected. Canonical XLSX numeric notation is expanded exactly before currency-precision validation. Trailing zero removal is exact. Dates support explicit ISO, day/month/year, month/day/year or numeric Excel serial interpretation. The fictitious 1900-02-29, fractional posting dates and invalid calendar days are rejected; both Excel date systems use UTC calculations independent of host timezone.

Required template headers are bound to explicit field/column positions. Renamed, missing or moved required columns cause `TEMPLATE_COLUMN_DRIFT`; no name-search remapping occurs. Added unmapped columns do not silently alter mapped fields. Template persistence/versioning, actor/reason records for corrections, complete-file quality totals and publication are subsequent backend work.

## Evidence and remaining work

`server/parser/tabular-core.test.mjs` and `field-mapping.test.mjs` exercise real generated XLSX ZIP/XML fixtures and raw CSV sources: exact numeric text, scientific notation, locale grouping, multiline source coordinates, calendar/date-system cases, template drift, duplicates, blocking ledger errors, formulas beyond the visible preview, external/active content, malformed XML/ZIP, CRC corruption, lying inflation metadata and preview limits.

Existing `saxes@5.0.1` is now declared as a direct runtime dependency and existing `jszip@3.10.2` as a development fixture dependency; no installed transitive package versions changed. The reader itself uses bounded Node zlib inflation, not JSZip's whole-archive async decompression. Dependency audit currently reports eight moderate findings in the existing ExcelJS dependency tree (minimatch/uuid and affected parents), zero high and zero critical. No forced downgrade or unverified override was applied. Full security/call-path assessment and export-library remediation remain tracked work.

Remaining acceptance: scan-first authenticated preview/job APIs; credential-free parser isolation with network/resource controls; real scanner and isolated parser end-to-end acceptance; full-file normalized ingestion and balanced journal groups; persistent versioned templates/corrections; exclusion reports and before/after totals; asynchronous cancellation/retry/publication; large-file/concurrency/security tests. The core tests do not close FR-006–013 by themselves.
