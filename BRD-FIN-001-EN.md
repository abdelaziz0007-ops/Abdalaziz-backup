# Business Requirements Document (BRD)
## Financial Analysis, Reporting, and Bank Reconciliation SaaS Platform

| Field | Details |
|---|---|
| Document ID | BRD-FIN-001 |
| Version | 1.0 |
| Date | 29 October 2026 |
| Status | Complete draft for review and approval |
| Proposed business owner | Product Manager / Executive Sponsor |
| Reviewers | Finance, Accounting, Technology, Security, Privacy, Operations, Legal |
| Classification | Confidential — Internal use |
| Related document | [SRS-FIN-001](SRS-FIN-001-EN.md) |

> All numerical limits, prices, retention policies, and performance targets in these documents are preliminary proposals, not approved decisions or measured results.

## 1. Executive Summary

The project will establish a subscription-based web platform that enables businesses and accounting firms to convert accounting files and bank statements into traceable financial reports and analysis, and to perform automated bank reconciliations with exception management and human review.

The platform accepts inputs such as trial balances, general ledgers, bank statements, and bank-account transactions recorded in accounting systems. It validates the files, standardizes their data, maps accounts to reporting line items, and produces:

- Management financial reports covering profitability, liquidity, trends, and variances.
- Financial statements subject to sufficient input data and an approved accounting policy.
- Bank reconciliation statements showing matches, outstanding items, and proposed adjustments.
- An audit trail linking each result to its source, transformations, and approvals.

**Core value:** Reduce manual effort and closing time while improving reviewability and transparency of results.

Platform-generated outputs are not audited financial statements or an independent professional opinion merely because they have been generated. In this project, “technical analysis” means data-quality checks, pattern analysis, and accounting-exception analysis unless a different scope is explicitly approved.

## 2. Problem and Opportunity

### 2.1 Assumed Current State

1. Data is exported from accounting systems and banks in inconsistent formats.
2. Files are cleaned and consolidated manually in spreadsheets.
3. Account classification and transaction matching depend on individual expertise.
4. Report figures are difficult to trace to original source rows.
5. Bank differences require repetitive investigation each period.
6. Management lacks a unified view of data quality and closing status.

These discovery assumptions require validation through interviews and actual samples. No evidence is currently available to establish the scale of the problem or the expected savings.

### 2.2 Opportunity

Provide a consistent workflow from import to approved deliverable, with reusable mappings and matching rules, while retaining the accountant’s responsibility for professional judgment and approval.

## 3. Business Objectives

| ID | Objective | Expected value |
|---|---|---|
| BO-01 | Reduce report-preparation and reconciliation time | Higher finance-team productivity |
| BO-02 | Improve output reliability and traceability | Fewer transfer and transformation errors |
| BO-03 | Increase correct automated matching | Accountants focus on exceptions |
| BO-04 | Support multiple entities with separate access permissions | Serve accounting firms and business groups |
| BO-05 | Establish recurring subscription revenue with sustainable margins | Scalable business model |
| BO-06 | Protect financial and personal data | Trust and reduced operational risk |

## 4. Target Segments and Stakeholders

| Segment / stakeholder | Need | Responsibility |
|---|---|---|
| Small and medium-sized businesses | Affordable recurring reports and reconciliations | Supply data and review results |
| Accounting and outsourced finance firms | Manage multiple clients and reuse templates | Prepare outputs for each client |
| CFO / Financial Controller | Performance visibility and closing approval | Approve policies and outputs |
| Accountant / Analyst | Import, classification, and exception handling | Prepare drafts |
| Authorized internal or external reviewer | Evidence and audit trail | Review and comment within granted scope |
| Subscription owner | Users, plans, and invoices | Manage the contractual relationship |
| Platform team | Operations, support, and security | Deliver the service without default access to client content |
| Accounting and legal advisers | Accounting framework and local obligations | Review launch requirements |

**Organizational distinction:** A tenant is the subscribing organization’s account and may contain multiple legal entities. Tenant membership does not automatically grant access to all its entities.

## 5. Value Proposition and Product

### 5.1 Financial Reporting Workflow

Create entity and period → Upload data → Validate data quality → Map accounts → Calculate metrics and reports → Review exceptions → Approve an immutable version → Export.

### 5.2 Bank Reconciliation Workflow

Select account and period → Upload bank statement and book transactions → Confirm balances and sign conventions → Match transactions → Review suggestions → Classify differences → Prepare reconciliation statement → Approve and lock.

### 5.3 Product Principles

- Never invent figures to replace missing data.
- A similarity score does not become an approved match without explicit rules.
- Surface data-quality issues before presenting affected results.
- Every figure and match must be explainable and reproducible from the relevant input and rule versions.
- The initial release does not alter accounting records or post journal entries to external systems.
- Client data must not be used to train a general-purpose model or serve another client without an appropriate contractual basis and specific consent where required.

## 6. Scope and Priorities

Classification: **M = Mandatory for launch; S = Important for a subsequent release; C = Optional; X = Outside the current scope.**

| Capability | Priority | Implementation boundaries |
|---|---|---|
| Tenant, entity, user, and permission management | M | Data isolation by tenant and entity |
| XLSX and CSV imports | M | Published templates and a column-mapping wizard |
| Data validation, correction, and source traceability | M | No silent data changes |
| Chart-of-accounts mapping to reporting line items | M | Versioned, reviewable templates |
| Income statement, statement of financial position, and detailed reports | M | Subject to sufficient input data |
| Profitability, liquidity, and variance analysis | M | Visible formulas and limitations |
| Bank reconciliation and one-to-one matching | M | Confirmed matches separate from suggestions |
| One-to-many and many-to-one matching | M | Grouped suggestions requiring human review |
| Carry-forward and aging of outstanding items | M | No duplicate use of transactions |
| Review, approval, locking, and audit trail | M | Separation of preparer and approver |
| PDF and XLSX exports | M | Consistent values and version identity |
| Subscriptions, billing, and usage limits | M | External payment gateway |
| Statement of cash flows | S | Additional data and classifications required |
| Budget-versus-actual and cost-center analysis | S | Compatible dimensions required |
| Text-based PDF extraction and image OCR | S | Approved templates and review of critical fields |
| AI-assisted narrative explanations | S | Disabled by default pending privacy and quality approval |
| Direct accounting-system connectors | S | Read-only initially |
| Direct bank connectivity | C | Subject to provider coverage and local requirements |
| Group consolidation and intercompany eliminations | X | Separate scope initiative |
| Payment execution or holding client funds | X | Not included |
| Tax returns or statutory audit | X | Not included |
| Trading recommendations or securities price analysis | X | Not included |
| Automatic posting of journal entries | X | Proposed-entry exports only |

## 7. Inputs and Outputs

| Input | Minimum required data | Possible output | Limitation |
|---|---|---|---|
| Trial balance | Account code, name, period, debit and credit amounts or documented balances | Income statement and statement of financial position after mapping | An unadjusted trial balance may produce a draft requiring adjustments |
| General ledger | Account, date, journal reference, debit and credit | Transaction analysis and drill-down | Ledger completeness and period continuity are required |
| Comparative periods | Consistent scope and mapping policy | Variances and trends | Differences in scope and policy must be disclosed |
| Budget | Account, period, amount, and dimensions | Actual versus budget | Subsequent release |
| Bank statement | Account, currency, period, transactions, opening and closing balances | Bank side of reconciliation | Balance roll-forward must be checked |
| Bank-account ledger | Transactions and balances for the same account and period | Book side of reconciliation | A partial receipts-and-payments list may be insufficient |
| Prior outstanding items | Amount, type, source, and origination date | Continuous reconciliation across periods | Opening approval and duplicate prevention required |
| Supporting data | Opening balances, non-cash transactions, and classifications | Cash flow statement when sufficient | A complete statement cannot be inferred from profit alone |

## 8. Business Requirements

| ID | Requirement | Verification evidence |
|---|---|---|
| BR-01 | Support multiple entities with explicit permissions | A user cannot view an unauthorized entity |
| BR-02 | Convert files into standardized, source-documented data | Each record links to its original file and row |
| BR-03 | Detect incomplete and unbalanced data | A quality report blocks approval on critical errors |
| BR-04 | Produce reports using approved mapping and calculation policies | Sample review against an accounting reference model |
| BR-05 | Provide explainable analysis | Each metric exposes its formula and inputs |
| BR-06 | Match bank and book transactions while managing ambiguity | Multiple-candidate cases are not approved automatically |
| BR-07 | Produce a reconciliation explaining both balances | Visible residual difference and documented adjustments |
| BR-08 | Control review, approval, and reopening | Complete approval and version history |
| BR-09 | Produce client-ready deliverables | Fixed-version exports show status and version |
| BR-10 | Protect data and manage its lifecycle | Successful isolation, deletion, and recovery tests |
| BR-11 | Collect subscriptions and control consumption | Invoices and usage limits without duplicate charges |
| BR-12 | Operate the service and support clients | Monitoring, support procedures, and escalation |

## 9. Processes and Business Rules

### 9.1 Initial Setup

1. Create the subscription and tenant.
2. Create the entity and define its fiscal year, currency, calendar, and accounting framework.
3. Invite users and assign roles.
4. Configure the chart of accounts and import templates.
5. Register bank accounts and document their corresponding ledger accounts.
6. Confirm matching, retention, and approval policies.

### 9.2 Report Preparation

1. The accountant selects the entity, period, and input type.
2. Files are checked and previewed before import.
3. Errors and duplicates are resolved, and exclusions documented.
4. Account mappings are reviewed and saved as a version.
5. Only supported reports and metrics are calculated.
6. The accountant reviews variances and alerts.
7. A different authorized user approves the final version.
8. The version is locked together with its inputs, formulas, and template.

**Governing rules:**

- A report must not be approved as complete while material accounts affecting it remain unmapped.
- The system must not automatically create a balancing account to conceal an imbalance.
- A metric must not treat unavailable inputs as zero.
- Comparisons must not be presented as consistent where currency, duration, or scope differs without disclosed treatment.
- Management outputs must not be marketed as fully compliant with an accounting framework without independent accounting verification of presentation, disclosures, and policies.

### 9.3 Bank Reconciliation

1. Verify account identity, currency, period, and balances.
2. Normalize transactions as increases or decreases in the entity’s cash.
3. Run matching rules in priority order.
4. Display confirmed matches, suggestions, and unmatched transactions separately.
5. Resolve grouped matches, fees, reversals, and timing differences.
6. Classify items as timing differences, book adjustments, bank errors, or under investigation.
7. Calculate adjusted balances and the final difference.
8. Approve and lock the reconciliation, carrying forward relevant outstanding items.

**Governing rules:**

- A transaction must not be allocated more than its available amount.
- Amount equality alone is insufficient when multiple candidates exist.
- Matching transactions is distinct from approving the reconciliation statement.
- A proposed journal entry is not a posted entry.
- Documented and classified timing items may remain outstanding in an approved reconciliation; unexplained differences block final approval.
- Identified bank fees or interest require evidence and approval before inclusion as proposed adjustments.

## 10. Main Scenarios

| ID | Scenario | Required outcome |
|---|---|---|
| UC-01 | First upload of a valid trial balance | Map accounts and produce a traceable draft |
| UC-02 | Upload of an incomplete or unbalanced file | Identify errors and block affected approval |
| UC-03 | Compare a month with the preceding month | Show absolute and percentage variances after comparability checks |
| UC-04 | A unique confirmed bank-to-book match | Create a match and show the applied rule |
| UC-05 | Two transactions share an amount and ambiguous references | Suggest review without automatic approval |
| UC-06 | A bank deposit combines several receipts | Suggest a group with total and member details |
| UC-07 | Unrecorded bank fees | Propose a book adjustment with evidence |
| UC-08 | A prior-period outstanding check clears at the bank | Clear it while preserving its origination date |
| UC-09 | A corrected file is uploaded after report approval | Create a new version through documented reopening |
| UC-10 | An accounting firm serves multiple clients | Reuse templates without sharing client data |
| UC-11 | Subscription cancellation and data-export request | Authorized export followed by retention and deletion policy |
| UC-12 | Processing interruption or external-provider failure | Safe recovery without duplicate results or charges |

## 11. Revenue and Cost Model

### 11.1 Proposed Plan Structure

| Plan | Target client | Potential pricing units |
|---|---|---|
| Basic | Single entity | Entities, users, monthly transactions |
| Professional | Finance team | Additional bank accounts, higher capacity, reviews, and analysis |
| Accounting Firms | Multi-client practice | Active entities with pooled capacity |
| Enterprise | Contract-specific needs | Capacity, federated identity, support, and service agreement |

This document does not establish final prices. Pricing will follow willingness-to-pay interviews and measurement of processing and support costs.

### 11.2 Additional Revenue

- Account setup and custom templates.
- Training and workshops.
- Custom connectors and contractual support.
- OCR or intensive processing through disclosed usage units.

### 11.3 Billing Rules

- Define the consumption unit before purchase and display used and remaining capacity.
- Do not charge again for retries caused by platform errors.
- Do not count rerunning matching against the same data as a new import.
- Do not exceed the financial cap without explicit selection of additional capacity.
- Disclose renewal, cancellation, refund, and tax terms for the contracting jurisdiction.
- Payment failure must not trigger immediate data deletion; apply an approved grace period and access policy.

### 11.4 Cost Components

Storage, processing, backups, monitoring, document extraction, AI providers, payment fees, support, security, and compliance.

**Proposed gross-margin measure:**  
(Recognized revenue − Direct service-delivery costs) ÷ Recognized revenue.

Finance must agree on the inclusion of support and provider costs as direct costs and on treatment of periods without revenue.

## 12. Success Metrics and Measurement Plan

Collect a baseline during an initial pilot before fixing targets. The figures below must not be used as marketing promises.

### 12.1 Primary Metrics

| Metric | Definition and formula | Source and cadence | Preliminary target |
|---|---|---|---|
| Task-completion time reduction | Median percentage reduction per task against a comparable manual task; reporting and reconciliation measured separately | Pilot sessions and workflow logs; monthly | 30–50% after baseline confirmation |
| Automated matching precision | Correct automated matches ÷ All automated matches in a ground-truth dataset | Accounting test set and re-review; each release | ≥99.5% preliminary acceptance target, with sample size disclosed |
| Paid retention | Tenants paying at the start of a period whose subscriptions remain paid at its end ÷ Paying tenants at the start | Billing; monthly and by subscription cohort | Set after an appropriate operating period |

Task time runs from the start of input preparation to an accepted output, distinguishing active work from review waiting time. Compare tasks of similar size and complexity.

### 12.2 Supporting Metrics and Guardrails

- **Activation:** Percentage of new tenants producing their first approved output within 14 days; exclude internal test accounts.
- **Matching coverage:** Automatically matched bank transactions ÷ All valid in-scope bank transactions before matching. Also show coverage by absolute monetary value; do not remove difficult cases from the denominator.
- **Rework:** Percentage of approved outputs reopened because of a confirmed product defect.
- **Precision guardrail:** Do not improve coverage at the expense of precision; monitor errors by monetary amount and complexity.
- **Safety guardrail:** Zero unauthorized-access incidents or unresolved critical financial errors is a launch condition.
- **Economic guardrail:** Direct service cost per tenant and per processing volume.

Owners: Product for activation, Finance for output correctness, Engineering for performance, Security for incidents, and Commercial Finance for retention and margin.

## 13. Compliance and Governance Requirements

### 13.1 Applicability Assessment Before Launch

Maintain a compliance register recording the operating company’s jurisdiction, target markets, data locations, data types, each party’s role, potential obligations, accountable owners, and evidence of fulfillment.

Do not assume that a particular privacy law or financial license applies before confirming the market and operating model. GDPR is an example of a conditional requirement whose applicability depends on factors including EU establishment or targeting individuals in the EU under its conditions. Reference: [European Commission — Application of the GDPR](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en).

### 13.2 Contractual and Regulatory Requirements

- Service agreement, privacy notice, and data-processing agreement where applicable.
- Determine controller and processor roles for each purpose; roles may differ between client files and billing data.
- Maintain a subprocessor register and document processing locations and international transfers.
- Define retention by data category, jurisdiction, and contract.
- Establish incident-response and notification procedures meeting applicable deadlines.
- Support access, correction, export, and deletion requests with identity verification.
- Review rights to use uploaded files, templates, and bank data.
- Conduct a separate assessment before adding bank connectivity or services that may change the regulatory classification.
- Use hosted payment processing and minimize exposure to card data; review payment-compliance scope with the provider.
- Review the accounting framework and versions applicable to reported periods without claiming unearned accreditation or certification.

## 14. Assumptions and Decisions Requiring Confirmation

| ID | Working assumption | Confirmation owner | Impact |
|---|---|---|---|
| A-01 | The product provides analysis and reconciliation, without payments or custody of funds | Sponsor and Legal | Product and regulatory boundaries |
| A-02 | Initial segments are SMEs and accounting firms | Business | Pricing and user experience |
| A-03 | Arabic-first with support for future English localization | Product | Design and exports |
| A-04 | One functional currency per entity; bank accounts retain their own currencies | Finance | Calculations and reports |
| A-05 | No consolidated reporting or automatic multi-currency conversion at launch | Finance and Product | Scope |
| A-06 | XLSX and CSV are mandatory; OCR comes later | Product | Coverage and cost |
| A-07 | Inputs are legally authorized and sufficient for accounting purposes | Client and Legal | Feasibility of producing outputs |
| A-08 | Final approval is performed by a person other than the preparer | Finance | Seat requirements and workflow |
| A-09 | Accounts and reports require an accounting policy approved by a specialist | Finance | Formulas and presentation |
| A-10 | File and performance limits in the SRS are preliminary | Technology | Architecture and cost |
| A-11 | Launch jurisdiction and hosting location are undecided | Sponsor and Legal | Blocks production-compliance approval |
| A-12 | Retention, deletion, and backup follow a provisional policy | Privacy and Legal | Contracts and operations |
| A-13 | AI narrative is optional and does not calculate figures | Product and Security | Provider selection and privacy |
| A-14 | Payments use an external provider without storing sensitive card data | Finance and Technology | Billing |
| A-15 | Prices, demand, and savings have not yet been validated | Business | Feasibility |

**Critical decisions before design approval:** Launch jurisdiction, accounting framework, data location, file samples, approval policy, usage volumes, currency scope, and retention.

## 15. Risks and Mitigations

| Risk | Preliminary likelihood / impact | Mitigation | Owner |
|---|---|---|---|
| Incomplete data produces a misleading report | High / High | Quality gates, draft labeling, and approval blocks | Finance and Product |
| An incorrect match appears valid | Medium / High | Conservative rules, ambiguity prevention, and reference tests | Finance and Engineering |
| Cross-client data leakage | Low / Critical | Comprehensive isolation, negative tests, and monitoring | Security |
| Varying bank and file formats | High / Medium | Approved templates, mapping wizard, and sample tests | Product |
| Scope expands into a full accounting system | High / High | Scope control and documented change requests | Sponsor |
| New services alter legal classification | Medium / High | Review before each banking or financial expansion | Legal |
| Unsupported generated narrative | Medium / High | Metric-linked claims and human review | Product and Finance |
| Processing cost exceeds revenue | Medium / High | Usage measurement, fair limits, and pricing tests | Commercial Finance |
| Data loss or processing outage | Medium / High | Backups, recovery, and resumable jobs | Operations |
| Excessive dependence on one provider | Medium / Medium | Isolated provider interfaces and contingency plan | Technology |

These preliminary assessments must be reviewed after the pilot.

## 16. Delivery Phases and Transition Gates

1. **Discovery:** Confirm critical decisions, collect anonymized samples, and prepare a ground-truth dataset.
2. **Foundation:** Identity, isolation, import, quality, traceability, and permissions.
3. **Initial product:** Core reports, reconciliation, review, exports, and billing.
4. **Controlled pilot:** Limited clients; measure time, precision, coverage, and cost.
5. **Launch:** Close critical defects, demonstrate recovery, and approve contracts and operations.
6. **Expansion:** OCR, cash flows, integrations, and AI narrative based on usage findings.

Do not commit contractual dates before estimating effort against the approved SRS and actual data samples.

## 17. Business Acceptance Criteria

- Complete reporting and reconciliation workflows succeed on reference data approved by an accounting specialist.
- Every financial value and match is traceable to its source, rule, and version.
- Materially incomplete reports and reconciliations with unexplained differences cannot be approved.
- Tenant and entity isolation is demonstrated.
- Permissions and preparer–approver separation operate correctly.
- Exported outputs agree with approved versions.
- Agreed SRS precision and performance targets are met.
- No critical financial or security defects remain open.
- Privacy, retention, data-location policy, and the compliance register are approved.
- Operations and support are trained; recovery and incident handling are documented.

## 18. Approval and Change Management

The Executive Sponsor, Product Owner, Finance Lead, Technology Lead, and Security and Privacy Lead approve this document.

Every material change must state its rationale, affected requirements, cost, schedule, security and compliance impact, and revised acceptance criteria. Update the BRD, SRS, and traceability matrix together.

| Approver | Name | Decision | Date |
|---|---|---|---|
| Executive Sponsor | To be assigned | Approved / Conditionally approved / Rejected | To be assigned |
| Finance Lead | To be assigned | To be determined | To be assigned |
| Technology Lead | To be assigned | To be determined | To be assigned |
| Security and Privacy Lead | To be assigned | To be determined | To be assigned |
