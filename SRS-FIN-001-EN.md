# Software Requirements Specification (SRS)
## Financial Analysis, Reporting, and Bank Reconciliation SaaS Platform

| Field | Details |
|---|---|
| Document ID | SRS-FIN-001 |
| Version | 1.0 |
| Date | 29 October 2026 |
| Status | Complete draft for review and approval |
| Business reference | [BRD-FIN-001](BRD-FIN-001-EN.md) |
| Audience | Product, Engineering, Accounting, Security, Quality Assurance, Operations |
| Classification | Confidential — Internal use |

> All numerical limits, prices, retention policies, and performance targets in these documents are preliminary proposals, not approved decisions or measured results.

## 1. Purpose and Specification Conventions

This document defines the platform’s expected behavior, data and calculation constraints, security controls, and acceptance requirements.

- “Must” indicates a mandatory requirement within its designated release stage.
- **M:** Required for launch.
- **S:** Subsequent release; excluded from initial-release acceptance unless brought into scope through change control.
- FR identifies functional requirements, NFR non-functional requirements, and DR data and calculation rules.
- The acceptance criteria below are minimum criteria and must be expanded into test cases without changing their meaning.

BRD assumptions A-01 through A-15 apply. Every operational numerical target in this document requires approval before establishment of a contractual baseline.

## 2. Terminology

| Term | Definition |
|---|---|
| Tenant | A subscribing organization with an isolated data scope |
| Entity | A legal entity within a tenant |
| Dataset | Imported records with a defined source, version, and scope |
| Mapping | Assigning source columns or accounts to standardized fields and line items |
| Matching | Linking a full or partial amount between bank and book transactions |
| Suggestion | A matching candidate requiring a human decision |
| Reconciliation | Explaining the difference between bank and book balances at a specified date |
| Locking | Freezing an approved version and preventing direct changes |
| Ground truth | Correct outcomes prepared and reviewed by specialists for system testing |
| Traceability | Navigating from an outcome to its sources, formulas, and decisions |

## 3. System Boundaries

### 3.1 Inside the System

Identity and permissions; entities and periods; imports; data quality; mappings; financial calculations; matching; review; exports; audit trail; subscriptions; and data lifecycle management.

### 3.2 External Parties

Identity and email providers, payment gateway, storage and key management, monitoring, and OCR, AI, or accounting-system providers when enabled.

### 3.3 Trust Boundaries

- The browser is untrusted; authorization and validation are enforced on the server.
- Uploaded files remain untrusted; their formulas and executable content are not run.
- Extraction and AI outputs may contain errors.
- The payment provider is authoritative for payment status after its messages are verified.
- An uploaded ledger does not automatically establish that accounting records are complete.

## 4. Roles and Permissions

| Action | Subscription Owner | Entity Administrator | Preparer | Approver | Viewer / Reviewer |
|---|---|---|---|---|---|
| Manage plan and billing | Yes | No | No | No | No |
| Manage entities and users | Within administrative scope | Within assigned entity | No | No | No |
| Upload and map data | Additional grant | Additional grant | Yes | Additional grant | No |
| Prepare reports or reconciliations | Additional grant | Additional grant | Yes | Additional grant | No |
| Review and comment | Financial-access grant | Financial-access grant | Yes | Yes | Comments if granted |
| Approve and lock | Approval grant | Approval grant | Cannot approve own work | Yes, if not the preparer | No |
| Reopen | Separate grant | Separate grant | No | Separate grant | No |
| Export | Separate grant | Separate grant | Separate grant | Separate grant | Separate grant |

Rules:

1. Roles may be combined, but the prohibition on approving one’s own work remains effective.
2. Permissions cover tenant, entity, and action, with optional restrictions by bank account.
3. Subscription ownership does not automatically grant access to financial content.
4. Platform support has no default access. Exceptional access is temporary, justified, scoped, client-approved, and audited.
5. Without a second approver, outputs remain drafts unless a documented exception is subsequently approved through scope change.

## 5. Functional Requirements and Acceptance Criteria

### 5.1 Identity and Organizations

| ID | Requirement | Stage | Acceptance criterion |
|---|---|---|---|
| FR-001 | Authentication, account recovery, invitations, and MFA | M | Invitations expire after a configured period and are single-use; administrative and approval accounts require MFA; recovery does not disclose whether an email exists |
| FR-002 | Manage tenants, entities, and memberships | M | A user cannot access an unauthorized entity, including by changing a request identifier |
| FR-003 | Enforce action and data permissions | M | Unauthorized viewing, downloading, editing, and approval are blocked, with every access path tested |
| FR-004 | Configure fiscal year, currency, calendar, and bank accounts | M | Settings affecting a locked version cannot change without a new version and an impact plan |
| FR-005 | Manage accounting periods and locks | M | A locked period rejects direct changes; reopening requires authorization and a reason and creates a new version |

### 5.2 Import and Data Quality

| ID | Requirement | Stage | Acceptance criterion |
|---|---|---|---|
| FR-006 | Upload XLSX and CSV with type, size, and malware checks | M | Invalid or infected files are rejected; analysis starts only after checks pass; file content is not executed |
| FR-007 | Preview worksheets and rows and map columns | M | The user selects the worksheet, header row, date format, and decimal separator; transformed values are previewed before confirmation |
| FR-008 | Save versioned import templates | M | Reuse detects changes to required columns and requests review instead of silently remapping |
| FR-009 | Import trial balances, general ledgers, and bank-account ledgers | M | Mandatory fields are validated for each file type, and errors identify source row numbers |
| FR-010 | Detect duplicates and overlapping periods | M | Re-uploading the same file does not duplicate data; similar records are flagged without automatically deleting legitimate transactions |
| FR-011 | Produce a data-quality report | M | Blocking errors and warnings are separate; record counts, rejection reasons, and totals before and after exclusions are shown |
| FR-012 | Correct and map data without altering the original | M | Original values, changes, actor, and reason are retained; affected validations and calculations rerun |
| FR-013 | Manage asynchronous processing jobs | M | Progress, failure, and cancellation are visible; retries do not duplicate imports or outputs |
| FR-014 | Extract text PDFs and images through OCR | S | Critical financial fields and low-confidence pages are reviewed; OCR scores alone cannot authorize approval |

### 5.3 Reporting and Analysis

| ID | Requirement | Stage | Acceptance criterion |
|---|---|---|---|
| FR-015 | Map accounts to reporting line items | M | Every unmapped account is visible; splitting an account across line items requires a rule that defines totals and prevents duplication |
| FR-016 | Produce an income statement and statement of financial position | M | Results match ground truth; approval is blocked if balance, mapping, or scope validations fail |
| FR-017 | Present comparisons and variances | M | Period, currency, entity scope, and policies are disclosed; zero denominators do not generate misleading percentages |
| FR-018 | Calculate financial metrics | M | Each metric shows its formula, contributing accounts, and period; missing required inputs produce “Unavailable” |
| FR-019 | Trace figures to source data | M | Reviewers can navigate from a line item to available accounts, transactions, or trial-balance rows; the interface does not imply unavailable transaction detail |
| FR-020 | Detect exceptions through explainable rules | M | Alerts show the rule, threshold, and affected data; exceptions are not labeled as proven fraud |
| FR-021 | Generate numerical analysis and rule-based explanations | M | Each quantitative statement links to a calculated metric; arithmetic changes are distinguished from causal explanations |
| FR-022 | Prepare a statement of cash flows | S | Approval requires sufficient supporting data, complete classifications, and reconciliation of cash |
| FR-023 | Provide optional AI-assisted narrative | S | The model cannot alter figures or matches; claims link to sources, and unsupported statements are prevented |
| FR-024 | Compare budgets and cost centers | S | Dimensions, periods, and currencies must be compatible; non-comparable items are disclosed |

### 5.4 Bank Reconciliation

| ID | Requirement | Stage | Acceptance criterion |
|---|---|---|---|
| FR-025 | Create a reconciliation for an account, currency, and cutoff date | M | Mixed accounts or currencies are blocked; overlapping reconciliations trigger a warning; opening and closing balance versions are identified |
| FR-026 | Normalize bank and book signs and validate balances | M | Opening balance plus transactions reconciles to closing balance; inconsistent sign interpretation is not accepted |
| FR-027 | Confirm one-to-one matches using approved rules | M | Automatic confirmation requires a unique candidate meeting all rule conditions; the reason and rule version are recorded |
| FR-028 | Suggest matches using date, description, and reference | M | Amounts, dates, evidence, and conflicts are shown; ambiguous cases require review |
| FR-029 | Suggest one-to-many and many-to-one matches | M | Group members, total, and residual are shown; groups are not automatically approved at launch |
| FR-030 | Support partial matching and allocation | M | Total allocations cannot exceed a transaction’s amount; the unallocated balance remains visible |
| FR-031 | Manually accept, reject, and unmatch | M | User and reason are recorded; overriding a clear reference conflict requires a reason and supervisor permission |
| FR-032 | Classify differences and attach evidence | M | Each item has a type, status, owner, amount, sign, reconciliation effect, and supporting source |
| FR-033 | Prepare the reconciliation statement and proposed entries | M | Both adjusted balances and the residual difference are calculated; no posted entry is created and source records remain unchanged |
| FR-034 | Carry forward outstanding items and track their age | M | Each item retains its identity and origination date; duplicate inclusion and reuse of previously reconciled transactions are prevented |
| FR-035 | Display matching coverage and result quality | M | Counts, absolute values, and denominators are shown; coverage is distinguished from precision, which requires ground truth |

### 5.5 Review and Export

| ID | Requirement | Stage | Acceptance criterion |
|---|---|---|---|
| FR-036 | Support review, approval, and rejection | M | Preparers cannot approve their own version; approval fails if critical validation fails or the version changed after submission |
| FR-037 | Freeze approved versions and document reopening | M | Previous versions remain retrievable; new versions explain their reason and differences |
| FR-038 | Export PDF and XLSX | M | Values match the selected version; entity, period, currency, status, version, and generation date are displayed |
| FR-039 | Support comments, attachments, and notifications | M | Comments link to an object and version; email notifications do not contain financial files or sensitive data by default |
| FR-040 | Provide a searchable, exportable audit trail | M | Imports, edits, matching, approval, downloads, and permission changes are recorded; client users cannot modify the trail |

### 5.6 Subscriptions, Privacy, and Integration

| ID | Requirement | Stage | Acceptance criterion |
|---|---|---|---|
| FR-041 | Manage plans, billing, and usage quotas | M | Limits are enforced before jobs start; duplicate payment events do not duplicate subscriptions or invoices; capacity rejection reasons are shown |
| FR-042 | Export, delete, and retain client data | M | Request authority and scope are verified; policies cover originals, derivatives, indexes, and providers |
| FR-043 | Manage support requests and temporary access | M | Support cannot access financial content without time-limited, scoped authorization; access is logged |
| FR-044 | Connect accounting systems in read-only mode | S | Permissions are restricted to granted scope; resynchronization does not duplicate records, and source-update conflicts are visible |
| FR-045 | Provide external APIs and webhooks | S | Authentication, scopes, authorization, rate limits, signatures, replay prevention, and idempotency keys are enforced |

## 6. Data Requirements and Logical Model

### 6.1 Core Entities

| Entity | Key fields |
|---|---|
| Tenant | ID, name, status, data region, plan |
| LegalEntity | Tenant, legal name, functional currency, fiscal year, framework, policies |
| User / Membership | Identity, role, entity and account scopes, status |
| AccountingPeriod | Start, end, status, version |
| SourceFile | Fingerprint, type, location, size, uploader, upload time, scan result |
| ImportBatch | File, template, parser version, data type, period scope, status |
| SourceRow | File, worksheet, row, original values, acceptance status |
| Account / MappingVersion | Account code, type, reporting line item, mapping rule, effective version |
| LedgerEntry | Journal and line references, date, account, debit, credit, currency, dimensions, source |
| TrialBalanceRow | Account, balance type, opening balance, movements, and closing balance where available |
| BankAccount | Entity, protected identifier, currency, linked ledger account |
| BankTransaction | Posting date, value date, reference, description, normalized amount, balance, source |
| Reconciliation | Account, period, balances, data and rule versions, status |
| MatchGroup / Allocation | Members, allocated amounts, rule, decision, reason |
| ReconcilingItem | Type, sign, amount, origin, origination date, status, evidence |
| ReportVersion | Type, period, data, policies, formulas, status, reviews |
| Approval / AuditEvent | Actor, action, time, object and version, reason |
| Subscription / UsageEvent | Plan, billing status, consumption unit, idempotency key |

### 6.2 Data Integrity Rules

- **DR-001:** All client data carries tenant and entity scope where applicable; relationships validate both scopes.
- **DR-002:** Monetary values use exact decimal arithmetic with sufficient precision for transformations; floating-point arithmetic is not used for balances.
- **DR-003:** Currency-specific precision is respected; two decimal places are not assumed universally.
- **DR-004:** Accounting dates are stored as dates; system events use a common time standard and are displayed in the relevant time zone.
- **DR-005:** Original files and source values are immutable; corrections form a derived layer.
- **DR-006:** Every import and rerun is associated with fingerprints, versions, and idempotency keys.
- **DR-007:** Bank identifiers, references, and account codes are text fields preserving leading zeros.
- **DR-008:** Missing, zero, and not applicable are distinct states.
- **DR-009:** Exclusion does not delete a record; its reason and effect on counts and totals are retained.
- **DR-010:** Concurrent allocations exceeding the available amount are prevented through atomic transactions and version checks.
- **DR-011:** Amounts in different currencies are not aggregated without an approved rate source, date, and conversion policy.
- **DR-012:** Templates, formulas, policies, and rules are versioned and do not retrospectively alter locked results.

## 7. Data Flows

### 7.1 Reporting Flow

1. Verify the user, entity, and subscription plan.
2. Upload through a restricted direct-upload mechanism into quarantine storage.
3. Check the file, limits, and content.
4. Extract records without executing formulas or code.
5. Normalize numbers, dates, and accounts.
6. Check quality, duplication, and completeness.
7. Obtain user confirmation of the active dataset.
8. Apply the selected account-mapping version.
9. Run the deterministic calculation engine.
10. Create a draft report and validation results.
11. Review and approve a fixed version.
12. Export the version with its source record.

Partially imported data must not be published as a complete dataset. Valid portions may be previewed with explicit labeling, but affected outputs cannot be approved.

### 7.2 Reconciliation Flow

1. Select the bank account, currency, and cutoff date.
2. Load bank data, book data, and approved prior outstanding items.
3. Normalize signs and validate both sets of balances.
4. Isolate duplicates, out-of-scope transactions, and rejected data.
5. Run deterministic rules in priority order.
6. Generate suggestions for remaining transactions.
7. Allocate amounts following permitted automatic decisions or human decisions.
8. Classify differences and review evidence.
9. Calculate adjusted balances and the unexplained difference.
10. Review, approve, and lock.
11. Carry outstanding items into the next period using their original identities.

## 8. Financial Calculation Engine

### 8.1 Input Checks

- For a trial balance with debit and credit columns, total debits must equal total credits within the approved source precision.
- Where opening balances, movements, and closing balances exist, validate the roll-forward for each account and in total.
- Separate total rows from transaction rows to prevent double counting.
- Identify whether a trial balance is period-specific or cumulative from the fiscal-year start.
- Do not combine a closing trial balance and a general ledger as independent sources for the same balance.
- Do not infer period results from cumulative balances without sufficient prior balances or movements and an explicit policy.
- A balanced trial balance does not establish completeness or correct classification.

### 8.2 Preliminary Formulas

| Metric | Formula | Controls |
|---|---|---|
| Gross profit | Net revenue − Cost of revenue | Subject to classification policy |
| Gross profit margin | Gross profit ÷ Net revenue × 100 | Unavailable when denominator is zero |
| Net profit margin | Net profit ÷ Net revenue × 100 | Disclose zero or negative revenue effects |
| Working capital | Current assets − Current liabilities | Approved classifications required |
| Current ratio | Current assets ÷ Current liabilities | Do not show infinite values |
| Quick ratio | (Cash and cash equivalents + Eligible short-term investments + Eligible net receivables) ÷ Current liabilities | Sufficient detail and an approved definition required |
| Total liabilities to equity | Total liabilities ÷ Equity | Identify the numerator as total liabilities; warn for zero or negative equity |
| ROA | Net profit ÷ Average assets | Opening and closing balances required; do not silently substitute closing assets for the average |
| Absolute variance | Current − Comparative | Consistent periods and currencies |
| Percentage variance | (Current − Comparative) ÷ Absolute value of Comparative × 100 | Explain treatment of a negative base; unavailable for a zero base |

Metric definitions must be approved before implementation. Do not present turnover ratios, receivable aging, EBITDA, or cash flows that cannot be reliably derived from available inputs.

### 8.3 Cash Flows — Subsequent Release

Implementation requires an agreed method, supporting data, identification of non-cash transactions, necessary classifications, and cash reconciliation. It must align with the accounting framework and standard version applicable to the reporting period.

Conceptual reference: IAS 7 classifies cash flows into operating, investing, and financing activities; its requirements cannot be reduced to subtracting two balances. [IFRS Foundation — IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/).

## 9. Bank Matching Specification

### 9.1 Sign Normalization

The engine uses the entity’s perspective:

- An increase in entity cash is positive.
- A decrease in cash is negative.
- In the cash ledger account, a debit increases cash and a credit decreases it.
- For bank statements, derive direction from the source format and balances, not from “debit/credit” labels alone.
- Negative overdraft balances are permitted without reversing sign rules.

The following must hold:

**Opening balance + Sum of signed transactions = Closing balance.**

If validation is impossible because balances are missing or data scope differs, disclose the data-quality limitation and prevent labeling the reconciliation as complete and approved.

### 9.2 Rule Priority

| Rule | Conditions | Outcome |
|---|---|---|
| R-01 | Same account and currency, exact amount, compatible trusted reference, date within window, unique candidate | Automatically confirmed match |
| R-02 | Trusted reference and exact amount, but date outside window | Suggestion explaining the exception |
| R-03 | Exact amount, nearby date, similar description, insufficient reference | Suggestion |
| R-04 | Exact amount and multiple candidates | Ambiguous; no automatic match |
| R-05 | A group totals to the opposite transaction with aggregation evidence | One-to-many or many-to-one suggestion |
| R-06 | Difference potentially explained by fees or deductions | Suggestion requiring a documented difference item |
| R-07 | Reversed amount and related reference | Potential reversal; no silent deletion or netting |

A trusted reference is a defined reference type tested for a source template, not merely any numeric text.

### 9.3 Preliminary Settings

- Date window: ±3 calendar days, configurable through versioning.
- Automatic amount tolerance: zero by default at the currency’s precision.
- Default comparison date: posting date; using value date requires an explicit policy.
- Suggested group size: up to 10 transactions within ±7 days as an initial limit.
- If the search space exceeds limits, stop grouped searching explicitly and leave affected transactions for review.
- Automated many-to-many matching is not supported at launch.
- An applied rule cannot change without a new version and an assessment of rerun effects.
- Similarity scores rank suggestions; they are not displayed as probabilities of correctness unless statistically calibrated and tested.

### 9.4 Allocation and Concurrency

Each transaction has an available amount. Full and partial allocations are permitted, with the residual recorded.

If two users attempt to consume the same amount, one transaction succeeds and the other fails with a conflict message and refreshed availability. Rerunning rules must not automatically remove approved human matches.

### 9.5 Reconciliation Statement Equations

After sign normalization:

**Adjusted bank balance = Bank statement balance + Signed bank-side reconciling adjustments.**

Examples include adding deposits in transit, subtracting outstanding checks or payments, and correcting bank errors according to their effect.

**Adjusted book balance = Bank-account ledger balance + Signed book adjustments.**

Examples include adding unrecorded interest, subtracting unrecorded fees, and correcting book errors.

**Unexplained difference = Adjusted bank balance − Adjusted book balance.**

The final difference must be zero at the approved account precision. Any permitted rounding difference must appear as an explicit item under an approved policy; it must not be silently erased.

### 9.6 Accounting Acceptance Example

All values are in the same currency unit:

| Item | Value |
|---|---:|
| Bank statement balance | 100,000 |
| Deposits in transit | +5,000 |
| Outstanding checks | −3,000 |
| Adjusted bank balance | 102,000 |
| Book balance | 102,200 |
| Unrecorded bank fees | −200 |
| Adjusted book balance | 102,000 |
| Unexplained difference | 0 |

The reconciliation is eligible for approval after evidence review. Fees remain a proposed entry until the client records them outside the platform. When that recorded entry is later imported, link it to the original item and prevent counting the fee twice.

## 10. System States and Transitions

### 10.1 Import

Uploaded → Scanning → Extracting → Needs review / Failed → Ready → Published.

- Cancellation stops publication without leaving partially published data.
- Failure retains diagnostic information and supports safe retry.
- Replacing a file creates a new version rather than overwriting the previous one.

### 10.2 Report and Reconciliation

Draft → Ready for review → Under review → Approved and locked.

Additional paths: Rejected with reason, Withdrawn from review, and New version after reopening.

- Changing inputs, mappings, or decisions after submission invalidates approval eligibility for the old version.
- Approval is bound to a specific content fingerprint and version.
- Reopening preserves prior signatures and approvals.
- An incomplete draft may be exported with a warning, but it cannot be labeled “Final and approved.”

## 11. Proposed Architecture

### 11.1 Components

1. Arabic web interface supporting RTL.
2. API layer enforcing identity, permissions, and consumption limits.
3. Logical modules for organizations, imports, reporting, reconciliation, and billing.
4. Job queue and separate workers for files, calculations, and exports.
5. Relational database for records, transactions, and allocations.
6. Private object storage for files, outputs, and backups.
7. Tamper-resistant audit log.
8. Key and secret management, monitoring, and security events.
9. Isolated external-provider interfaces.

Start with a modular monolith and independent processing workers. Microservices are not required unless justified by scale, isolation, or independent deployment needs.

### 11.2 Mandatory Architectural Decisions

- Deterministic financial calculations and matching are separate from generated narrative.
- Financial operations and allocations use atomic transactions.
- Jobs safely handle duplicate queue delivery.
- Tenant protection is enforced by server and data layers, not interface filtering alone.
- Cache keys, queues, and indexes include tenant scope.
- Every version fixes its datasets, rules, formulas, parsers, and templates.
- No public storage links; downloads require valid, short-lived authorization.
- Untrusted-file processing is isolated from identity services and sensitive data services.

## 12. Security and Privacy

### 12.1 Identity and Access

- MFA for administration and approval, with optional tenant-wide enforcement.
- Rate limiting and detection of abusive login attempts.
- Revocable sessions when membership is removed or compromise is suspected.
- Reauthentication for sensitive operations, including deletion, MFA changes, and exceptional access.
- Authorization on every request, file, export, and background job.
- Unguessable identifiers are not a substitute for access control.

### 12.2 Data Protection

- Encrypt transport using TLS 1.2 or later, preferring 1.3 where supported.
- Encrypt storage and backups using centrally managed keys.
- Separate production and test environments; do not copy real data into testing without an approved procedure.
- Mask account numbers and personal information in displays and logs as appropriate.
- Do not log complete files or full financial descriptions in diagnostic logs.
- Keep secrets outside source code, rotate them, and restrict access.

### 12.3 File and Export Security

- Validate actual content, extension, size, and excessive compression.
- Reject executable and password-protected files with clear reasons; do not attempt to bypass protection.
- Do not execute macros, external links, or spreadsheet formulas.
- If a financial cell contains a formula without a verifiable cached value, request a recalculated values-only file instead of executing the formula.
- Prevent spreadsheet formula injection in exports while preserving valid financial values.
- Isolate parsers, constrain processing time and memory, and maintain current libraries.

### 12.4 AI Usage

- AI is unnecessary for core calculation and matching correctness.
- It remains disabled until provider, processing location, contract, and no-training policy are approved.
- Send only necessary data and remove personal identifiers where feasible.
- Treat instructions embedded in files as untrusted content, not system commands.
- Models cannot modify data, approvals, or integrations.
- Record model and prompt-template versions and sources while minimizing retained sensitive text.
- If the model fails, numerical reports remain available without generated narrative.

### 12.5 Data Lifecycle

Preliminary policy requiring confirmation:

| Category | Initial policy |
|---|---|
| Quarantined files or failed imports | Delete within 7 days unless a documented investigation requires retention |
| Active data and outputs | Retain during the subscription, subject to market-specific accounting and contractual periods |
| Subscription termination | 30-day export window, then deletion from active systems within a further 30 days |
| Backups | Copies containing deleted data expire within 35 days of active-system deletion |
| Audit log | Initially 12 months or an approved period, minimizing personal data |
| Legal hold | Documented exception specifying data, reason, authorized authority, and review date |

When restoring a backup, reapply deletion instructions and access revocations before making it available.

### 12.6 Security Verification Basis

Use relevant OWASP ASVS 5.0.0 requirements as a proposed verification baseline at Level 2, with a control mapping approved by the Security Lead. This is a project verification target, not a certification claim. Reference: [OWASP ASVS](https://asvs.owasp.org/).

## 13. User Experience and Accessibility

### 13.1 Main Screens

- Entity and period dashboard with job status.
- Upload, preview, and column-mapping wizard.
- Data-quality center.
- Account-mapping workspace.
- Reports and metrics with source drill-down.
- Two-panel reconciliation workspace for bank and books.
- Exception and outstanding-item lists.
- Review and approval inbox.
- Audit trail.
- Users, subscription, and privacy settings.

### 13.2 Usability Requirements

- Display entity, period, currency, and status on every financial screen.
- Distinguish “Confirmed match,” “Suggestion,” “Unmatched,” and “Excluded” with clear labels, not color alone.
- Explain each error, required action, and source-record location.
- Save drafts and warn before leaving unsaved changes.
- Preview bulk-operation effects and allow reversal before locking.
- Separate viewing from approval; do not preselect all suggestions.
- Support search, sorting, filtering, and pagination for large tables.
- Support Arabic, local numerals, separators, and date formats without changing stored values.
- Produce Arabic exports without clipped text or reversed columns.
- Support mobile viewing and basic approvals while indicating that intensive processing is designed for desktop use.

Target WCAG 2.2 Level AA for core workflows, including keyboard access, focus visibility, contrast, and field labels. Reference: [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 14. Non-Functional Requirements

Proposed initial test workload: files up to 50 MB and 100,000 data rows; reconciliations up to 100,000 transactions per side; 50 concurrent users; and 10 concurrent processing jobs across 5 tenants. Review after receiving samples.

| ID | Requirement | Initial measurement and acceptance criterion |
|---|---|---|
| NFR-001 | Availability | 99.9% monthly for core workflow interfaces; the service agreement defines measurement and exclusions |
| NFR-002 | Response time | p95 ≤2 seconds for ordinary reads and ≤3 seconds for saves under the workload; upload and background processing excluded |
| NFR-003 | Report processing | A standard 100,000-row file reaches draft report within 5 minutes at p95, including queue wait but excluding upload and review |
| NFR-004 | Reconciliation processing | One-to-one matching at the workload limit completes within 10 minutes at p95; grouped search has a separate resource budget and discloses unsearched cases |
| NFR-005 | Calculation correctness | All mandatory accounting reference cases pass; amounts agree at currency precision, with no hidden unexplained difference |
| NFR-006 | Matching precision | ≥99.5% on an independent representative dataset, reporting sample size, strata, and confidence interval; zero critical errors under the approved definition |
| NFR-007 | Isolation | Zero successful cross-scope access in API, file, export, queue, and cache tests |
| NFR-008 | Recovery | RPO ≤15 minutes and RTO ≤4 hours; quarterly recovery test covers databases, files, and keys |
| NFR-009 | Job reliability | Redelivery and retry do not duplicate data, allocations, or consumption |
| NFR-010 | Scalability | Workers can scale without changing financial logic; quotas prevent one tenant from exhausting shared resources |
| NFR-011 | Observability | Trace IDs for requests and jobs; alerts for failed imports and exports, queue delays, and isolation errors |
| NFR-012 | Maintainability | Documented interface contracts, testable migrations, and deployment rollback plans |
| NFR-013 | Security | No unresolved critical or high vulnerabilities without a formally approved risk exception before launch |
| NFR-014 | Accessibility and localization | Core workflows pass the targeted WCAG checks, RTL tests, and Arabic-export tests |
| NFR-015 | Compatibility | Latest two stable Chrome, Edge, and Firefox versions at test time; mobile matrix documented |
| NFR-016 | Reproducibility | Identical data and versions produce identical numerical outputs and deterministic matches regardless of run time |
| NFR-017 | Usage fairness | Limits are disclosed before upload; an otherwise valid job does not lose its data because quota expires during publication |

A critical financial error includes mixing entities or currencies, allocating an amount twice, approving a hidden difference, or approving output based on data different from the reviewed version.

## 15. Edge Cases and Expected Behavior

| Case | Required behavior |
|---|---|
| Empty file or multiple tables and totals | Require explicit range selection and reject undefined imports |
| Arabic numerals or ambiguous decimal separators | Preview conversion and request confirmation where ambiguous |
| A date such as 03/04 without a known format | Do not silently infer the date |
| Hijri calendar or unsupported dates | Require explicit documented conversion or clearly reject |
| Same account name with different codes | Keep accounts separate |
| Leading zeros in account codes or references | Preserve as text |
| Partial overlap with an earlier import | Identify overlap and prevent duplicate consolidation |
| Two apparently identical but legitimate transactions | Do not delete based on similarity alone |
| Missing bank-statement pages | Warn about coverage and prevent claims of completeness |
| Statement gaps or failed balance roll-forward | Block approval as a complete reconciliation |
| Missing opening balance or prior outstanding items | Permit drafts and matching, but do not approve unverified completeness |
| Receipts-and-payments list excludes fees or other entries | Request the full account ledger or disclose the limitation |
| Value date differs from posting date | Retain both and apply the disclosed policy |
| A post-cutoff transaction clears a prior item | Use as subsequent evidence without changing the cutoff balance |
| Reversal or returned transaction | Preserve and link original and reversal without deletion |
| Negative bank balance | Apply normal sign rules without reversing them |
| Aggregated deposit net of fees | Suggest a group and a documented fee item without ignoring the difference |
| Bank and book currencies differ | Block cross-currency matching at launch |
| Concurrent matching of the same transaction | Reject conflicts atomically and show current state |
| File changes after approval | Create a new version and invalidate affected approval readiness |
| Unmatching in a locked period | Reject until authorized reopening |
| Zero denominator or negative equity | Show “Unavailable” or an appropriate warning with explanation |
| OCR or narrative generation fails | Preserve other correct processing and disclose the limitation |
| Uploaded content contains model instructions | Treat as data; do not alter system instructions or permissions |
| Deletion request conflicts with legal retention | Execute the permitted portion and document the exception |
| Backup restoration contains previously deleted data | Reapply deletion records before making data available |

## 16. Integrations and Interface Contracts

| Integration | Stage | Requirements |
|---|---|---|
| Payments and billing | M | Signature verification, unique event ID, and handling of delayed, duplicate, and out-of-order events |
| Email | M | Transactional messages, secure links, no sensitive financial content |
| Storage and key management | M | Scoped permissions, short-lived links, encryption, and access logs |
| Monitoring | M | Sensitive-data masking, operational permissions, and retention limits |
| OCR | S | Approved processing location, data agreement, and documented page- and field-level output |
| Accounting systems | S | Limited authorization, read-only access, incremental sync, and handling of source updates and deletions |
| Banking services | C | Explicit consent, authorized provider where required, and no storage of bank passwords |
| Language-model provider | S | Data minimization, contractual no-training terms, cost limits, and disable capability |

Interface rules:

- Versioned interfaces with documented request and response schemas.
- Derive entity identity and scope from authorization; do not trust client-supplied scope alone.
- Pagination, rate limits, and consistent errors without internal information leakage.
- Bounded exponential-backoff retries and dead-letter handling.
- Idempotency keys for operations with side effects.
- Webhook signatures, timestamps, and replay prevention.
- External updates cannot cancel or alter locked outputs without a new-version workflow.

## 17. Test Plan

### 17.1 Test Data

Prepare anonymized or synthetic datasets covering valid and invalid files, different accounts, banks, dates and currencies, and duplicate, grouped, reversed, and partially allocated transactions.

An accountant prepares ground truth and a second accountant reviews it. Separate rule-tuning samples from independent acceptance samples to avoid overstating precision.

### 17.2 Test Levels

1. **Unit and calculation tests:** Signs, precision, rounding, ratios, and allocations.
2. **Contract and integration tests:** Files, queues, storage, payments, and providers.
3. **Accounting reference tests:** Reports, reconciliation statements, and carried items.
4. **Property tests:** Preservation of totals, allocation bounds, and rerun determinism.
5. **End-to-end tests:** Upload through approval and export.
6. **Security and isolation:** Authorization bypass, direct access, malicious files, formula injection, and support sessions.
7. **Concurrency and reliability:** Concurrent edits, duplicate messages, worker interruption, and retries.
8. **Performance:** Workload, limits, and competition among tenants.
9. **Recovery and deletion:** Full restore and reapplication of deletion and access restrictions.
10. **Usability and localization:** Arabic, RTL, keyboard use, and printed outputs.
11. **User acceptance:** Accountant, reviewer, CFO, and accounting-firm representative.

### 17.3 Critical Acceptance Tests

| Test | Input or action | Required result |
|---|---|---|
| T-01 | Balanced trial balance with approved mappings | Reports agree with reference results |
| T-02 | Unbalanced trial balance or material unmapped account | Approval blocked with explanation |
| T-03 | Two equal-amount candidates without a distinguishing reference | No automatic match |
| T-04 | Trusted reference, compatible amount and date, unique candidate | Confirmed match with audit evidence |
| T-05 | Three receipts correspond to one deposit | Group suggestion without automatic approval |
| T-06 | Partial allocation followed by an attempt to exceed residual | Excess rejected; valid allocation retained |
| T-07 | Reconciliation example in Section 9.6 | Both adjusted balances equal 102,000; difference is zero |
| T-08 | Import a fee entry previously proposed | No double counting of the fee |
| T-09 | Another tenant’s user requests a file or export | Rejection without data leakage |
| T-10 | Preparer attempts to approve own work | Rejection |
| T-11 | Data changes after submission for review | Old-version approval blocked |
| T-12 | Repeat file upload and duplicate payment message | No duplicate records or charges |
| T-13 | Restore after client deletion | Deletion reapplied before access |
| T-14 | PDF and XLSX from an approved version | Identical values and clear status and version |

### 17.4 Release Gate

- All M requirements and critical acceptance tests pass.
- Performance and precision targets are met using approved test datasets and load environments.
- No critical financial or security errors remain open.
- Other defects, their impacts, and acceptance decisions are documented by the accountable owner.
- Recovery is demonstrated through an actual restore, not merely the existence of a backup.
- Finance approves reference results, Security approves isolation, and Product approves workflows.
- Market, hosting, retention, and contractual decisions are complete before production launch.

## 18. Traceability Matrix

| Business requirements | Functional requirements | Principal verification evidence |
|---|---|---|
| BR-01 | FR-001–005 | Permissions, locking, and T-09 |
| BR-02 | FR-006–010, FR-012–013 | Import, traceability, and T-12 |
| BR-03 | FR-011, FR-015–016, FR-026 | Quality tests and T-02 |
| BR-04 | FR-015–017, FR-022 | Ground truth and T-01 |
| BR-05 | FR-018–024 | Formula, limitation, and explanation review |
| BR-06 | FR-027–031, FR-035 | T-03–06 and precision tests |
| BR-07 | FR-025–026, FR-032–034 | T-07–08 and carry-forward tests |
| BR-08 | FR-005, FR-036–037, FR-040 | T-10–11 and version history |
| BR-09 | FR-019, FR-038–039 | T-14 and traceability |
| BR-10 | FR-002–003, FR-040, FR-042–043 | T-09, T-13, and recovery tests |
| BR-11 | FR-041 | Usage limits and duplicate-payment-event tests |
| BR-12 | FR-013, FR-039, FR-043–045 | Failure, monitoring, and operational tests |

Stage S requirements do not become mandatory for launch merely because they appear in this matrix.

## 19. Required Implementation Deliverables

- Detailed data model and field dictionary.
- Approved screen designs and review workflows.
- Versioned financial-formula and matching-rule catalog.
- File templates and valid and invalid samples.
- API and integration contracts.
- Threat model and security-verification mapping.
- Ground-truth datasets and test results.
- Arabic user guide and operations and support guides.
- Backup, recovery, deletion, and incident procedures.
- Deployment and rollback guide and environment-configuration matrix.
- Decision log, exceptions, and residual risks.
- Acceptance report linking each requirement to its result and evidence.

## 20. Open Decisions and Approval

Before design and implementation planning are finalized, confirm:

1. Launch and target jurisdictions and processing locations.
2. Accounting framework, policies, and required report formulas.
3. The actual structure of available trial balances and bank-account ledgers.
4. Priority bank and accounting-system samples.
5. Currency policy, rounding precision, and date windows.
6. File sizes, workloads, and service levels.
7. Retention, deletion, and legal holds.
8. Segregation of duties and minimum user count.
9. Payment provider, taxes, and billing approach.
10. Timing of OCR, AI, and integrations.

**Current approval status:** A reviewable and estimable specification with explicit assumptions. Describing the document as complete does not approve unresolved decisions or commit cost or schedule.

| Approving function | Responsibility |
|---|---|
| Product Owner | Scope, priorities, and user experience |
| Finance Lead | Formulas, classifications, matching, and output-correctness criteria |
| Technology Lead | Architecture, capacity, and performance |
| Security and Privacy | Isolation, access, and data lifecycle |
| Quality Assurance | Testability and acceptance coverage |
| Executive Sponsor | Commercial decisions, risks, and cost |
