# Fineprint Retrofit, Compliance, Dashboard, and Evidence Binder Roadmap

## Objective

Build a more reliable and professional Fineprint data/product layer that does four things:

1. Creates a reliable retrofit cost and savings data layer.
2. Normalizes NYC-specific retrofit sources, REMDB/OpenEI data, and ResStock data.
3. Ensures every supported law has a visible dashboard output and consistent naming across the app.
4. Adds a customer-facing compliance binder so owners can store proof, assign obligations, track completion, and export a defensible compliance record.

The final app should not just calculate risk or fines. It should help a building owner understand what applies, what is missing, what to do next, who is responsible, what evidence has been filed, and how to prove compliance later.

# PHASE 1: Set up data folders and shared schemas

Create or confirm these folders exist:

```text
data/remdb/
data/nrel/resstock/
data/nyc_cost_sources/
data/normalized/
data/exports/
```

Create a shared normalized retrofit measure schema with these fields:

```text
measure_id
measure_name
category
building_type
applies_to_residential
applies_to_commercial
cost_low
cost_mid
cost_high
cost_unit
energy_savings
carbon_savings
annual_energy_savings_low
annual_energy_savings_mid
annual_energy_savings_high
annual_utility_savings_low
annual_utility_savings_mid
annual_utility_savings_high
lifetime_years
source_name
source_file
source_page
confidence_level
notes
```

Use `null` for missing fields. Do not invent values.

# PHASE 2: OpenEI / REMDB fetcher

I have an OpenEI API key stored in `.env.local` as:

```text
OPENEI_API_KEY
```

Use this key for any OpenEI/NREL API calls. Do not hardcode the key.

Create a REMDB fetcher that pulls retrofit measure data and saves a normalized local file at:

```text
data/remdb/remdb_measures.json
```

Also create a debug report at:

```text
data/normalized/remdb_fetch_report.md
```

The report should include:

```text
whether OPENEI_API_KEY was found
endpoint/source attempted
number of measures fetched
fields successfully mapped
fields missing
any errors or assumptions
```

Important requirements:

```text
Do not hardcode API keys.
Do not invent missing measure values.
If the REMDB endpoint fails, report the exact failure in the debug report.
```

# PHASE 3: NYC retrofit cost PDF extraction

I added three NYC retrofit cost PDFs to the project.

The PDFs should be in:

```text
data/nyc_cost_sources/
```

Please inspect them and extract useful measure-level retrofit cost tables only where the source supports it.

Normalize the extracted data into:

```text
data/normalized/nyc_retrofit_cost_tables.json
```

Use these fields:

```text
measure_name
building_type
cost_low
cost_mid
cost_high
cost_unit
energy_savings
carbon_savings
lifetime_years
source_pdf
page_number
notes
```

If a field is missing, leave it `null`. Preserve source PDF and page number for every extracted measure. Do not invent costs or savings.

Also create a debug report at:

```text
data/normalized/nyc_pdf_extract_report.md
```

The report should include:

```text
PDFs inspected
pages/tables extracted
measures found
fields successfully mapped
fields missing
any skipped tables and why
```

Important requirements:

```text
Do not infer a cost unless the PDF actually supports it.
Do not treat narrative recommendations as numeric cost data unless a table or explicit estimate supports it.
Preserve source file and page number.
```

# PHASE 4: ResStock NY parser

I have completed the ResStock NY data download.

The folder is:

```text
data/nrel/resstock/
```

It contains:

```text
NY_upgrade0.csv.gz through NY_upgrade32.csv.gz
upgrades_lookup.json
data_dictionary.tsv
measure_name_crosswalk_res_2025_1.xlsx
```

Important: the measure name crosswalk is an Excel `.xlsx` file named exactly:

```text
measure_name_crosswalk_res_2025_1.xlsx
```

Read it using an Excel parser such as `xlsx` / `exceljs` if working in Node, or `openpyxl` if working in Python. Do not assume it is a CSV.

Build the ResStock parser.

Requirements:

```text
1. Read the compressed .csv.gz files directly.
2. Inspect upgrades_lookup.json to map each upgrade number to the actual upgrade name.
3. Confirm whether NY_upgrade0.csv.gz is the baseline/no-upgrade file.
4. Use data_dictionary.tsv to understand the columns.
5. Use measure_name_crosswalk_res_2025_1.xlsx if useful for cleaner measure naming, but do not depend on it if the format is inconvenient.
6. Join each upgrade file to the baseline by building ID.
7. Filter to climate zone 4A if a climate-zone column exists.
8. For each upgrade, calculate:
   - median annual energy savings
   - p25 annual energy savings
   - p75 annual energy savings
   - median annual utility cost savings, if cost/bill columns exist
   - p25 annual utility cost savings
   - p75 annual utility cost savings
   - affected end uses, if detectable
   - applicable building types, if detectable
9. Save the output to data/normalized/resstock_upgrade_curves.json.
```

Create a debug report at:

```text
data/normalized/resstock_parse_report.md
```

The report should list:

```text
files found
baseline file detected
number of upgrade files processed
building ID column used
climate-zone column used, if any
energy columns used
utility cost columns used
whether measure_name_crosswalk_res_2025_1.xlsx was used
any skipped files or missing fields
```

Important requirements:

```text
Do not manually unzip .csv.gz files.
Do not assume upgrade0 is baseline unless upgrades_lookup.json confirms it.
If a climate zone column cannot be found, report that clearly.
If utility cost columns cannot be found, still calculate energy savings and report the missing cost fields.
```

# PHASE 5: Master retrofit measure merge file

Only after Phases 2, 3, and 4 work, create:

```text
data/normalized/measure_cost_savings_master.json
```

Use this priority order:

```text
1. NYC-specific cost data from the NYSERDA / Urban Green PDFs when available.
2. REMDB cost data when NYC-specific cost data is missing.
3. ResStock savings estimates for residential energy and utility savings.
4. Generic fallback assumptions only if clearly labeled as fallback.
```

The master file should preserve source references and confidence level for every measure. Do not overwrite a source-specific value without keeping the original source in the notes or sources field.

The retrofit measure data should support the law-specific dashboard outputs, especially laws that need cost/savings/fine mitigation recommendations. Keep retrofit measures separate from law applicability logic, but make sure they can be referenced by `law_id` where relevant.

Create a debug report at:

```text
data/normalized/measure_master_merge_report.md
```

The report should include:

```text
number of REMDB measures loaded
number of NYC PDF measures loaded
number of ResStock upgrade curves loaded
number of final master measures created
duplicate measure names found
source priority decisions
fields still missing
fallback assumptions used, if any
```

Important requirements:

```text
Do not blend laws and retrofit measures into the same table.
Laws are compliance obligations.
Measures are possible retrofit/corrective actions.
A measure may support a law, but it is not itself a law.
```

# PHASE 6: Law registry, naming consistency, and dashboard outputs

After the data pipelines are working, audit the app to make sure every supported law has a visible dashboard output and is named consistently everywhere.

Create a single canonical law registry file, for example:

```text
src/lib/laws/lawRegistry.ts
```

or use the existing equivalent if one already exists.

Each law should have one canonical object with:

```text
law_id
slug
display_name
short_name
jurisdiction
category
description
applies_to_logic
dashboard_output_key
source_data_keys
enabled
sort_order
```

Every law must use the same canonical values everywhere in the app. Do not allow separate hardcoded law names across dashboard cards, filters, task records, compliance calculations, saved building records, or exports.

Audit the codebase for duplicate or inconsistent law naming, including examples like:

```text
Local Law 97 vs LL97 vs local-law-97
Local Law 88 vs LL88 vs lighting law
Local Law 84 vs benchmarking
Local Law 87 vs energy audits
FISP vs Local Law 11
gas piping inspection vs LL152
sprinkler inspection vs Local Law 152
sprinkler inspection vs Local Law 26
elevator inspection vs elevator compliance
```

Replace inconsistent references with imports from the canonical law registry.

Dashboard requirements:

```text
1. Every law in the canonical law registry must produce an output on the dashboard.
2. Every dashboard output must map back to exactly one law_id.
3. Every law should show one of these statuses:
   - applies
   - may_apply
   - does_not_apply
   - unknown
   - missing_data
4. Every law should show, where available:
   - whether it applies to the building
   - why it applies or does not apply
   - next deadline
   - estimated annual fine exposure
   - recommended next action
   - source data used
   - missing data needed
5. If a law does not have enough data to calculate a fine, still show a dashboard card with status unknown or missing_data. Do not hide the law.
6. The dashboard should never silently omit a law that exists in the registry.
```

Create an audit/debug report at:

```text
data/normalized/law_dashboard_audit_report.md
```

The report should list:

```text
every law in the registry
whether it appears on the dashboard
dashboard component/file responsible for rendering it
canonical law_id
canonical display_name
all aliases found in the codebase
inconsistencies fixed
laws with missing calculations
laws with missing UI output
laws with missing source data
any remaining TODOs
```

Also create or update a test/check script, for example:

```text
scripts/audit-law-dashboard.ts
```

The script should verify:

```text
1. every law in the registry has a dashboard_output_key
2. every law has a visible dashboard card/output
3. no dashboard output uses a hardcoded law name instead of the registry
4. no duplicate law_ids or slugs exist
5. every saved task/compliance record references law_id instead of display_name
6. every source_data_key used in the dashboard exists or is clearly marked optional
```

Add this script to `package.json` as:

```json
"audit:laws": "tsx scripts/audit-law-dashboard.ts"
```

The app should pass:

```bash
npm run audit:laws
```

Important requirements:

```text
Do not remove laws just because data is incomplete.
If data is incomplete, keep the law visible and label it missing_data.
Every law card should use the canonical registry name.
```

# PHASE 7: Evidence binder, obligation proof, vendor assignment, and exportable compliance history

After the law registry and dashboard outputs are consistent, build a customer-facing compliance binder system.

The goal is that owners can do more than see risk/fines. They should be able to prove what they did, store evidence per obligation, assign work to the correct vendor/professional, track completion, and export a defensible compliance history.

This is different from an internal event log. The internal event log is developer/admin plumbing. The customer needs their own organized, exportable compliance record.

## 7.1 Compliance obligations

Create or update data models for compliance obligations.

Each obligation should map to one `law_id` from the canonical law registry and include:

```text
obligation_id
law_id
building_id
title
description
status
due_date
recurrence
responsible_party
vendor_id
required_evidence_types
recommended_evidence_types
proof_files
filing_reference_number
source_data
created_at
updated_at
completed_at
notes
```

Allowed obligation statuses should include:

```text
not_started
in_progress
submitted
filed
completed
overdue
blocked
not_applicable
missing_data
```

## 7.2 Evidence / proof files

Owners should be able to attach and store proof for each obligation, such as:

```text
filed reports
inspection documents
permits
photos
invoices
certifications
email confirmations
DOB filings
benchmarking reports
audit reports
retro-commissioning reports
gas piping inspection reports
FISP/QEWI reports
elevator inspection records
sprinkler inspection records
contractor proposals
```

Each evidence item should include:

```text
evidence_id
obligation_id
law_id
building_id
file_name
file_type
file_url_or_storage_key
uploaded_by
uploaded_at
document_date
expiration_date
issuer
vendor_id
filing_reference_number
notes
verification_status
```

Allowed verification statuses should include:

```text
unreviewed
accepted
needs_review
rejected
expired
missing
```

## 7.3 Vendors / professionals

Owners should be able to assign obligations to the vendor or professional responsible for completing the work.

Create a vendor/professional model with:

```text
vendor_id
name
company
role_type
email
phone
license_number
license_type
notes
```

Supported `role_type` values should include:

```text
QEWI
LMP
energy_auditor
retro_commissioning_agent
contractor
engineer
architect
expeditor
property_manager
elevator_vendor
sprinkler_vendor
general_vendor
other
```

Examples:

```text
FISP / Local Law 11 should support assignment to a QEWI.
Gas piping inspection should support assignment to an LMP.
Energy audit / retro-commissioning obligations should support assignment to an auditor or retro-commissioning agent.
Retrofit recommendations should support assignment to a contractor or engineer.
```

## 7.4 Customer-facing compliance history

Create a customer-facing history for each building that shows:

```text
obligation created
vendor assigned
evidence uploaded
status changed
filing marked submitted
filing marked completed
due date changed
document expired
note added
```

This should be exportable and understandable to a building owner or property manager. Do not expose a raw internal event log as the product experience.

## 7.5 Compliance binder UI

Create or update dashboard sections/components for:

```text
Compliance Binder
Obligation Detail
Evidence Checklist
Vendor Assignment
Filing / Proof Upload
Compliance History
Export Binder
```

Use existing components if available. Otherwise, create components such as:

```text
src/components/compliance/ComplianceBinder.tsx
src/components/compliance/ObligationDetail.tsx
src/components/compliance/EvidenceChecklist.tsx
src/components/compliance/VendorAssignment.tsx
src/components/compliance/ComplianceHistory.tsx
src/components/compliance/ExportComplianceBinder.tsx
```

Every law dashboard card should link to the relevant obligations and evidence binder entries.

## 7.6 Evidence checklist by law

For each law in the canonical registry, define the expected evidence/proof types where possible.

Examples:

```text
Local Law 97:
- emissions report
- benchmarking data
- compliance calculation
- penalty estimate
- mitigation plan
- professional review notes

Local Law 84:
- benchmarking submission confirmation
- reported energy/water data
- filing confirmation

Local Law 87:
- energy audit report
- retro-commissioning report
- professional certification
- filing confirmation

Local Law 88:
- lighting upgrade documentation
- submetering documentation
- contractor invoice
- compliance filing/proof

FISP / Local Law 11:
- QEWI report
- inspection photos
- filing confirmation
- repair documentation
- scaffold/sidewalk shed documents if applicable

Local Law 152:
- gas piping inspection report
- LMP certification
- DOB submission confirmation
- correction documentation if applicable

Elevator compliance:
- inspection report
- violation correction proof
- vendor report
- DOB filing/proof

Sprinkler/fire safety compliance:
- inspection records
- contractor reports
- filing/proof
- correction documentation
```

If the exact required evidence is unknown, mark it as `recommended_evidence` rather than `required_evidence`. Do not invent legal requirements.

## 7.7 Exportable compliance binder

Create an export function that produces a customer-facing compliance binder for a building.

The export should include:

```text
Building Summary
Compliance Snapshot
Law-by-Law Obligations
Status of Each Obligation
Assigned Vendor / Professional
Evidence Uploaded
Missing Evidence
Filing Reference Numbers
Completion Dates
Open Items
Compliance History
Source Appendix
Assumptions and Limitations
```

The export should be available as a structured JSON file at minimum. If the app already supports PDF or document export, add a professional report-style export as well.

Suggested output path for JSON exports:

```text
data/exports/compliance_binder_{building_id}.json
```

If implementing a downloadable UI export, use the existing app architecture.

## 7.8 Compliance binder audit script

Create or update a script:

```text
scripts/audit-compliance-binder.ts
```

The script should verify:

```text
every law_id in the registry has obligation templates or is explicitly marked as no_obligation_template_yet
every obligation maps to a valid law_id
every evidence item maps to a valid obligation_id and law_id
every obligation can store proof files
every obligation can be assigned to a vendor/professional
every dashboard law card links to a compliance binder section
every building can export a compliance binder
missing evidence is shown clearly rather than hidden
```

Add this script to `package.json` as:

```json
"audit:binder": "tsx scripts/audit-compliance-binder.ts"
```

The app should pass:

```bash
npm run audit:binder
```

## 7.9 Compliance binder debug report

Create a debug report at:

```text
data/normalized/compliance_binder_audit_report.md
```

The report should include:

```text
data models created or updated
obligation templates created by law
evidence types mapped by law
vendor role types supported
dashboard components updated
export format created
laws missing obligation templates
laws missing evidence checklists
remaining TODOs
```

Important requirements:

```text
Do not treat the internal event log as the customer-facing compliance history.
Do not invent legal filing requirements.
If required proof is uncertain, label it recommended_evidence or missing_data.
Every proof/evidence item must connect back to building_id, law_id, and obligation_id.
Every obligation must be exportable.
Every law dashboard card should connect to the compliance binder.
The compliance binder should help an owner prove compliance, not just understand risk.
```

# PHASE 8: Professional compliance output formatting research

Go online and research how real contractors, building compliance consultants, energy auditors, construction companies, commissioning firms, and NYC retrofit/compliance experts format their building compliance documents, reports, proposals, inspection summaries, audit summaries, and retrofit recommendations.

The goal is not to copy any copyrighted template. The goal is to understand the common structure, tone, sections, labels, and formatting conventions used in real industry documents, then make this app’s building compliance outputs feel familiar and credible to building owners, property managers, contractors, and compliance professionals.

The professional output format should include the compliance binder and evidence trail, not just the dashboard findings. The exported binder should feel like a defensible owner/property-manager record that could be shared with a consultant, auditor, attorney, lender, buyer, or regulator.

Research examples from sources such as:

```text
NYC building compliance consultants
Local Law 97 consultants
energy audit firms
ASHRAE audit report examples
retro-commissioning reports
construction proposal examples
contractor scopes of work
building inspection report examples
DOB compliance guidance
NYSERDA / Urban Green / NYC Accelerator style reports
property management compliance summaries
```

Create a formatting research report at:

```text
data/normalized/professional_output_format_research.md
```

The report should summarize:

```text
common sections found in professional reports
common language used for compliance status
common language used for risk/fine exposure
common language used for recommended actions
common ways costs are shown
common ways timelines/deadlines are shown
common ways source data and assumptions are disclosed
common disclaimers or limitations
examples of headings and labels to emulate
formatting patterns to avoid because they feel too consumer-app-like or too generic
```

Then update the app’s building compliance outputs so they are formatted more like professional compliance/audit/contractor documents.

The dashboard and generated outputs should use a structure similar to:

```text
1. Building Summary
   - address
   - borough
   - BIN/BBL, if available
   - building type
   - gross floor area
   - year built
   - primary use
   - source records used

2. Compliance Snapshot
   - applicable laws
   - non-applicable laws
   - laws with missing data
   - highest-risk items
   - nearest deadlines
   - estimated fine exposure

3. Law-by-Law Compliance Findings
   For each law:
   - law name
   - status
   - applicability reason
   - requirement summary
   - next deadline
   - fine exposure
   - source data used
   - missing data
   - recommended next action

4. Retrofit / Corrective Action Recommendations
   For each recommendation:
   - measure name
   - issue addressed
   - applicable law_id
   - estimated cost range
   - estimated annual savings
   - estimated carbon or energy impact
   - priority level
   - implementation complexity
   - expected useful life, if known
   - source/assumption

5. Compliance Binder / Evidence Trail
   - obligations by law
   - assigned vendor/professional
   - filed reports
   - proof uploaded
   - proof missing
   - filing reference numbers
   - completion status
   - customer-facing compliance history

6. Prioritized Action Plan
   - immediate actions
   - 30-90 day actions
   - annual/recurring compliance actions
   - capital planning actions

7. Assumptions and Limitations
   - data sources used
   - missing fields
   - model assumptions
   - confidence level
   - what requires professional verification

8. Source Appendix
   - public records used
   - datasets used
   - PDFs/reports used
   - page numbers where applicable
   - calculation notes
```

Make the output professional, direct, and compliance-oriented.

Avoid vague consumer language like:

```text
You’re all set
Great job
Here’s what you should do
Looks good
Your building is healthy
```

Prefer professional language like:

```text
No immediate filing risk identified based on available records.
Applicability could not be confirmed because required source data is missing.
Estimated annual exposure is based on available emissions and floor-area records.
Professional verification is recommended before capital planning or filing decisions.
This measure is a preliminary recommendation, not a final engineering scope.
```

Create or update reusable output components/templates, for example:

```text
src/lib/output/complianceReportTemplate.ts
src/components/dashboard/ComplianceSnapshot.tsx
src/components/dashboard/LawFindingCard.tsx
src/components/dashboard/ActionPlanTable.tsx
src/components/dashboard/SourceAppendix.tsx
```

or use the existing equivalent files if they already exist.

Make sure dashboard outputs, compliance binder exports, and any downloadable/generated reports use the same naming conventions from the canonical law registry created in Phase 6.

Create a debug report at:

```text
data/normalized/professional_output_format_audit_report.md
```

The report should include:

```text
sources reviewed
formatting conventions adopted
app components updated
before/after output structure
places where the app still feels too generic
remaining TODOs
```

Important requirements:

```text
Do not copy proprietary report templates word-for-word.
Do not make the output sound like a generic consumer dashboard.
Do not make legal claims beyond what the source data supports.
Use professional compliance language.
The compliance binder export should be treated as a serious owner record, not just a CSV.
```

# PHASE 9: Final verification

After all phases are complete, run the app’s existing checks and the new audit checks.

Run, where applicable:

```bash
npm run lint
npm run build
npm run audit:laws
npm run audit:binder
```

Then create a final implementation report at:

```text
data/normalized/final_retrofit_law_pipeline_report.md
```

The report should include:

```text
files created or modified
data sources successfully parsed
dashboard laws verified
laws still missing calculations
laws still missing source data
compliance binder implemented
obligation/evidence/vendor models implemented
exportable compliance history implemented
professional formatting research completed
professional output components updated
fallback assumptions used
build/lint/audit results
recommended next steps
```

Do not claim success unless the debug reports and audit scripts actually pass.

# Global implementation requirements

These requirements apply across all phases:

```text
Do not hardcode API keys.
Do not require measure_name_crosswalk_res_2025_1.xlsx if it is hard to parse.
Do not manually unzip .csv.gz files.
Do not invent costs, savings, lifetimes, law applicability, deadlines, evidence requirements, or fine exposure.
Do not hide laws just because data is incomplete.
Do not copy proprietary report templates word-for-word.
Do not expose a raw internal event log as the customer-facing compliance history.
Do not make the output sound like a generic consumer dashboard.
Use canonical law_id values everywhere.
Preserve source references wherever possible.
Create debug reports before claiming success.
If a column, law, source, cost, savings value, deadline, evidence requirement, or vendor role cannot be found, report that clearly instead of guessing.
```

# Expected final outputs

By the end, the project should contain or update:

```text
data/remdb/remdb_measures.json
data/normalized/remdb_fetch_report.md

data/normalized/nyc_retrofit_cost_tables.json
data/normalized/nyc_pdf_extract_report.md

data/normalized/resstock_upgrade_curves.json
data/normalized/resstock_parse_report.md

data/normalized/measure_cost_savings_master.json
data/normalized/measure_master_merge_report.md

src/lib/laws/lawRegistry.ts
scripts/audit-law-dashboard.ts
data/normalized/law_dashboard_audit_report.md

scripts/audit-compliance-binder.ts
data/normalized/compliance_binder_audit_report.md
data/exports/compliance_binder_{building_id}.json

data/normalized/professional_output_format_research.md
data/normalized/professional_output_format_audit_report.md

data/normalized/final_retrofit_law_pipeline_report.md
```

Expected package scripts:

```json
{
  "audit:laws": "tsx scripts/audit-law-dashboard.ts",
  "audit:binder": "tsx scripts/audit-compliance-binder.ts"
}
```

Expected app/product behavior:

```text
Every supported law appears on the dashboard.
Every law uses one canonical law_id and display name.
Every law has a status, even if the status is missing_data.
Every law card links to obligations/evidence where relevant.
Owners can attach proof to obligations.
Owners can assign obligations to vendors/professionals.
Owners can track compliance completion.
Owners can export a compliance binder.
Retrofit recommendations use sourced cost/savings assumptions.
Professional reports and dashboard outputs use serious compliance-oriented formatting.
```
