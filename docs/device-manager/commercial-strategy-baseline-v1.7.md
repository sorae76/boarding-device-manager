# Boarding Device Manager — Commercial Strategy Baseline v1.7
## Final Locked Baseline

**Status:** COMMERCIAL STRATEGY BASELINE v1.7 — LOCKED  
**Decision date:** 2026-09-10 (America/New_York)  
**Commercial validation Day 0:** 2026-09-14 (America/New_York)  
**Day 30 checkpoint:** 2026-10-14  
**Day 60 checkpoint:** 2026-11-13  
**Day 90 decision date:** 2026-12-13  
**Purpose:** Lock a custody-first product and sales strategy while keeping Network and AI as evidence-gated expansion options.

---

## 1. Product Thesis

Boarding Device Manager is not an SIS, LMS, ERP, MDM replacement, or broad school operating system.

The initial paid product is:

> **Nightly device check-in/out and custody accountability for boarding and residential schools.**

The initial product manages:

- student/device onboarding
- Release / Return
- Missing / Recovery
- QR-assisted or other validated fast identification
- staff handoff / unresolved items
- custody audit trail
- school/residence schedule rules
- allow-only schedule exceptions

Network Evidence, Unknown Device Detection, Human Review, and AI Night Review are possible expansion products. They are not prerequisites for the custody-first commercial pilot or custody-only launch.

---

## 2. Commercial Design Principle

**DECIDED — C01**

> **Commercial design principle: minimize both technical complexity and institutional approval burden. No feature is pre-launch mandatory if it materially expands privacy, legal, IT, or procurement review without demonstrated willingness to pay.**

This principle controls all pre-launch scope decisions.

A feature is not mandatory merely because it is technically possible or strategically interesting. If it materially expands:

- privacy review
- legal review
- DPA negotiation
- IT/security approval
- network/controller access
- procurement complexity
- sales cycle
- implementation burden
- recurring support burden

then it remains deferred unless a paid customer, a real pilot blocker, or repeated verified buyer demand demonstrates willingness to pay for it.

---

## 3. Decision Discipline

This commercial baseline uses:

- **DECIDED**
- **OPEN**

Every OPEN item must state:

- what it blocks
- what it does not block
- owner / decision source
- must resolve by
- required evidence

An OPEN item does not block unrelated discovery or development unless explicitly stated.

---

## 4. Beachhead ICP

**DECIDED — C02**

The beachhead is not all boarding schools.

Primary ICP:

> **Private / faith-based boarding or residential schools that regularly and physically collect student-owned phones or devices.**

Priority characteristics:

- recurring physical device turn-in
- multiple dorm staff or shift handoff
- fragmented paper / spreadsheet / Google Sheet / chat workflow
- meaningful device volume
- missing-device or “I turned it in” disputes
- multiple devices per student
- non-trivial weekly schedule

First sub-segment:

> **Adventist and similar faith-based boarding academies**

This is a beachhead lead pool, not the total market or TAM.

---

## 5. Handbook Qualification and Volume

**DECIDED — C03**

Policy categories:

- **A — Mandatory Physical Collection**
- **B — Conditional Collection**
- **C — Personal Phone Prohibited / School-Issued**
- **D — Student-Retained Restriction**
- **E — Unclear**

Category A is the highest-priority sales pool.

### Volume is a lead score, not a proven hard cutoff

**DECIDED — C04**

Record approximate nightly collection volume whenever discoverable.

Provisional lead priority:

- **40+ nightly devices:** high priority
- **20–39:** medium priority
- **<20:** low priority unless dispute frequency, schedule complexity, or staff-handoff pain is unusually strong

The `40+` value is a market-learning hypothesis. It is not a permanent exclusion threshold.

Handbook research is for lead qualification and directional evidence. It must not be presented as a statistically representative U.S. SAM estimate.

---

## 6. Buyer and Institutional Approval

**DECIDED — C05**

Likely operational champions:

- Dean of Students
- Dean / Director of Residential Life
- Head Dorm Parent
- Dorm Supervisor

Dean is not assumed to be the universal final buyer or sole approver.

Depending on the school, adoption may also require:

- Head of School / Principal
- Business Manager / CFO
- IT / System Administrator
- privacy / policy owner
- authorized contract signer
- legal reviewer

The product and sales process should minimize the number and depth of approvals required.

---

## 7. Founder / Employer IP, Conflict, and Contracting Entity

**OPEN — O-C01**

Before the first binding external paid pilot agreement, the project must have a documented answer to:

- ownership of software and related IP
- employee invention / work-product assignment issues
- use of employer time, equipment, data, accounts, or confidential information
- conflict-of-interest / outside-business restrictions
- the legal person/entity authorized to contract and receive payment

**blocks:** signing or accepting payment for an external paid pilot; external annual commercial contract  
**does not block:** non-binding market research and discovery, provided no employer confidential information is disclosed and no unsupported ownership representation is made  
**owner / decision source:** founder + qualified employment/IP counsel; employer-authorized written determination where required  
**must resolve by:** before issuing or accepting the first binding paid-pilot agreement  
**required evidence:** written review of relevant agreements/policies, ownership/permission determination, contracting-party decision, and any required written consent/assignment

---

## 8. Core Value Proposition

**DECIDED — C06**

Do not lead with cashable labor savings.

Primary value:

1. **Custody evidence** — who turned in / released / received a device, and when
2. **Dispute protection** — auditable evidence when student/parent/staff accounts differ
3. **Missing-device accountability**
4. **Shift handoff / unresolved-state continuity**
5. **Consistent schedule enforcement**

Secondary value:

- less reconciliation
- faster nightly close
- lower staff cognitive burden
- cleaner reporting

---

## 9. Sales Positioning

**DECIDED — C07**

Primary message:

> **Boarding Device Manager helps residential schools track exactly which student devices were turned in, released, missing, and handed over between staff — without spreadsheets or paper logs.**

Secondary message:

> **It supports complex dorm schedules, fast check-in/out, and a complete custody history when a student, parent, or staff member disputes whether a device was turned in.**

Do not lead early sales with:

- AI
- Network Surveillance
- MDM replacement
- school operating system
- broad student behavior/compliance platform claims

---

## 10. Current Product and G1-B Rationale

**DECIDED — C08**

The current product already includes:

- student/device management foundation
- custody workflow
- Release / Return
- Missing / Recovery
- role/school/residence authorization
- Rapid Scan
- QR workflow foundation
- device CSV import
- student device registration request → staff approval
- custody audit/concurrency hardening
- G1-A authoritative schedule write boundary

### Why G1-B must be completed

G1-B is not being completed because of sunk cost.

Correct rationale:

> **G1-C is pre-launch mandatory for the custody-first product, and safe schedule authoring/preview depends on deterministic G1-B resolver behavior, including school/residence precedence, circular weekly rules, timezone, and DST.**

Therefore:

- finish G1-B independent review
- fix confirmed findings only
- run required validation
- controlled commit / close

No new G1-B scope expansion after closure.

---

## 11. Pilot Onboarding Paths

**DECIDED — C09**

Pilot onboarding is part of the commercial MVP.

Existing capabilities must be reused where practical:

### Path A — Existing roster/device import
Use existing admin/student setup and device CSV import when the school already has reliable source data.

### Path B — Student self-registration
Use student device registration request → staff approval when student accounts and completion rates make it practical.

### Path C — Register on first capture
The pilot must support, or validate the need for, a first-night workflow for schools that have no usable device inventory.

The intended operational result is:

> **A school with zero pre-existing personal-device inventory can still complete the first nightly collection without founder data-entry becoming the bottleneck.**

The minimum capture should be the smallest data set required to establish an auditable, distinguishable custody record. Serial number must not be assumed to be available during first capture. Additional metadata can be completed later if the authoritative data model safely permits it.

**Implementation note:** the existing student self-registration path requires a serial number, so Path C must not be assumed to be satisfied by that path. O-C02 must first test whether an existing staff-side create/search flow can handle first capture. If not, only the minimum schema/API/UI change needed for first-capture operation is authorized; broader registration redesign is not.

### Commercial onboarding acceptance

Before pilot go-live:

- real student roster can be loaded
- real device population can be established through one or more of Paths A/B/C
- staff roles can be configured
- schedule can be configured
- identification method is agreed
- staff can complete a short dry run

### Operating-cost guardrail

Provisional target:

- founder onboarding effort: **≤4 hours per school**
- recurring founder support after stabilization: **≤1 hour per school per month**

If repeated pilots exceed these targets at the proposed ACV, onboarding/support or pricing must change before scaling.

---

## 12. Pilot Identification / QR / First-Capture Validation

**OPEN — O-C02**

Do not assume a permanent QR sticker on an expensive student-owned phone is acceptable.

The first external custody pilot must validate one practical fast-identification workflow, which may include:

- removable/device-case label
- student-held or digital QR pass
- custody slot / storage identifier plus confirmation
- fast student/device search
- another school-approved method

The same dry run must also validate the zero-inventory case from C09 Path C.

**blocks:** first external live custody pilot go-live  
**does not block:** G1-B closure, G1-C implementation, market discovery, non-live demos  
**owner / decision source:** product owner + pilot operational champion  
**must resolve by:** pilot onboarding completion  
**required evidence:** an end-to-end collection/release dry run demonstrating:
1. acceptable speed
2. device/student identification accuracy
3. no unacceptable permanent modification of student-owned devices
4. successful handling of an initially unregistered device
5. ability to finish the first-night workflow from zero usable device inventory

Do not build multiple identification systems before this evidence exists.

---

## 13. Commercial MVP Scope

**DECIDED — C10**

Finish:

1. G1-B closure
2. G1-C minimal schedule authoring
3. allow-only schedule exceptions
4. controlled Production schedule setup
5. minimal unresolved / shift-handoff view
6. pilot onboarding using existing paths plus only the minimum first-capture capability proven necessary by O-C02
7. quick-start instructions / support path
8. **PILOT MVP FREEZE**

Not automatically required before paid custody pilot:

- offline mutation
- Network monitoring
- network identity
- AI Night Review
- broad analytics
- parent portal expansion
- enterprise CRM
- complex billing
- full incident-management platform
- MDM replacement

---

## 14. Offline Mode

**DECIDED — C11**

Offline mutation is not a pre-launch requirement.

Reason:

The custody transition is authoritative and concurrency-sensitive. Offline writes introduce a second conflict/reconciliation model and materially increase complexity.

Before pilot go-live:

- test connectivity at the real collection/release location
- verify staff devices can complete the authoritative workflow
- document a temporary connectivity-failure fallback procedure

Only repeated pilot evidence of connectivity failure may reopen offline design.

---

## 15. Network Strategy

**DECIDED — C12**

Network Detection is a **validation-dependent expansion option**, not a custody-first launch prerequisite.

Freeze implementation of:

- live controller integration
- network identity engine
- AP mapping implementation
- persistent network evidence ingestion
- device-night network detection
- unknown-device alerts

Low-cost non-live capability reconnaissance may continue but is not a core development priority.

### Network re-entry conditions

Re-evaluate Network implementation only when all are true:

1. external QPCPs ≥2
2. at least 3 independent external schools spontaneously identify hidden / second / unregistered device use as a top-tier pain
3. at least one school indicates willingness to pay more or expand the pilot to solve it

Actual student network monitoring additionally requires institutional/privacy/IT authorization.

Dean approval alone is not sufficient for live student network monitoring.

---

## 16. AI Strategy

**DECIDED — C13**

AI is not a pre-launch custody blocker.

### Existing AI Night Review is Network-track only

The `AI Night Review / Deterministic Pattern Insights` defined in the Implementation Baseline is **not** unlocked merely by obtaining custody pilots.

It remains part of the optional Network Compliance expansion and may be activated only after the Network path has satisfied all of its own technical and privacy prerequisites, including:

- Gate 5-S PASS
- Gate 6 PASS
- stable Network Compliance Technical Pilot operation / evidence
- O08 provider/privacy approval
- no unresolved critical Network identity/security defects

Therefore:

> **Custody commercial success does not bypass Gate 5-S or Gate 6 for the existing AI Night Review.**

### Custody-only AI

No separate custody-only AI feature is approved by this baseline.

If paid custody customers later identify a concrete custody-only AI use case, it requires:

1. a new scoped commercial decision under C01, **and**
2. a controlled Implementation Baseline revision defining its technical/privacy gates.

It must not inherit the name, permissions, evidence, or launch status of the Network-track AI.

AI remains non-authoritative in every future scope.

## 17. Qualified Paid Custody Pilot — Start vs Count

**DECIDED — C14**

To avoid confusion with technical pilot stages, the commercial metric is named:

> **Qualified Paid Custody Pilot (QPCP)**

A custody pilot operation may be scheduled after a binding agreement is signed and all applicable entry gates are satisfied.

However, it counts as a **QPCP** for commercial GO/NO-GO metrics only after actual payment has been received.

A QPCP counts toward commercial validation only if all are true:

1. external organization; OA Amenia does not count
2. signed pilot order/form/contract from an authorized school signer
3. 45-day custody-first pilot scope
4. **at least $500 actually received**
5. named operational champion
6. identified economic/institutional approver
7. real roster and real device setup
8. at least one real boarding/dorm workflow activated
9. success criteria agreed before launch
10. annual conversion decision date agreed before launch

A signed but unpaid agreement is tracked as a `contracted custody pilot`, not a QPCP.

A free demo, free trial, verbal interest, unpaid internal OA use, issued invoice with no receipt, or signed-but-unpaid agreement does not count as QPCP.

### Minimum pilot success criteria

The school and vendor agree in advance how they will judge:

- nightly collection/return completion
- unresolved/missing visibility
- staff handoff usefulness
- custody/dispute record usefulness
- onboarding effort
- staff usability
- support burden
- annual-price continuation willingness

## 18. Pricing Hypothesis

**DECIDED — C15**

Pilot:

> **45 days / $500**

The $500 is credited to the first-year annual fee if converted.

Initial annual test prices:

| Boarding population | Test price |
|---|---:|
| ≤75 | $1,800/year |
| 76–200 | $2,800/year |
| >200 / multi-campus | Custom / discovery-led |

Do not publish pricing yet.

---

## 19. Discovery Questions

**DECIDED — C16**

Capture:

- nightly devices collected
- number of staff involved
- current tracking method
- collection / release duration
- late/non-submission frequency
- shift handoff method
- device-loss/accountability cases
- “I turned it in / you did not” disputes
- Orah/REACH workaround if used
- strongest operational pain
- willingness to pay
- willingness to run a paid pilot

Do not lead Network questions.

Listen for spontaneous mentions of:

- hidden phones
- second phones
- unregistered devices
- devices used after turn-in
- Wi-Fi/network evidence needs

---

## 20. Market Research and Outreach Cadence

**DECIDED — C17**

First research wave:

- 40–60 handbook-qualified schools for policy evidence
- Adventist / faith-based first
- selected broader boarding/residential schools
- adjacent military / therapeutic / RTC sampling as needed

Commercial outreach volume is larger than the handbook sample.

### Counting-unit definitions

All 30/60/90-day metrics use **unique qualified external school units**, not messages, people, or follow-ups.

#### Qualified external school unit

One external residential-school buying unit with one materially shared boarding operation, device policy, and budget/approval path.

A school unit is **qualified only if, before first contact**, it is recorded as:

1. matching the C02 beachhead ICP, **and**
2. either:
   - handbook/policy category **A**, or
   - handbook/policy category **B**, or
   - category **E** with recorded evidence that recurring physical device collection actually occurs.

Category C or D schools do not count toward the C18 qualified-contact denominator unless new evidence meeting the rule above is recorded **before first contact**.

Qualification evidence and category are frozen for C18 counting at first contact. Later discoveries may be recorded for learning, but they do not retroactively add/remove that school from the completed cycle's denominator after Day 90.

Counting boundaries:

- multiple contacts at the same school count as **one** school
- repeated follow-ups do not increase the school count
- a bounced/undelivered message does not count as contacted
- separate campuses may count separately only if they have materially separate residential operations and separate buying/approval authority; the rationale must be recorded before counting
- OA Amenia never counts

#### Contacted

A qualified school counts as `contacted` only when at least one personalized outbound message is successfully delivered to a relevant operational/economic role, or direct two-way contact occurs.

#### Discovery conversation

A qualified school counts once toward the discovery minimum when a substantive two-way conversation with a relevant operational/economic participant covers the core C16 discovery topics. Multiple calls with the same school do not create multiple school-count units.

#### Formal paid-pilot proposal

A qualified school counts once when it receives a written proposal containing at least:

- custody-first scope
- 45-day term
- pilot price
- responsibilities
- success criteria
- intended start window
- conversion / decision date

Proposal revisions to the same school do not add to the count.

#### QPCP

A Qualified Paid Custody Pilot is counted only under C14 after all QPCP criteria are satisfied, including actual cash receipt.

### Fixed first 90-day outreach plan

**Day 0 = 2026-09-14.**

By Day 30:

- at least **40 unique qualified external schools contacted**
- at least one structured follow-up wave sent where the channel permits
- response/discovery conversion measured
- if fewer than 40 qualified schools have been contacted, increase outreach input immediately
- no GO/NO-GO decision; this is an input-volume correction checkpoint

By Day 60:

- cumulative **80 unique qualified external schools contacted**
- messaging revised only from recorded evidence
- target at least 3 formal paid-pilot proposals where discovery supports them

By Day 90:

- cumulative **120 unique qualified external schools contacted**
- at least **10 unique-school discovery conversations**
- at least **3 unique-school formal paid-pilot proposals**

### Pre-declared blackout periods

For this first validation cycle, the Day-90 decision date occurs before the December blackout; no blackout pauses this cycle.

For future cycles, the following may be designated **before Day 0**:

- **June 15–August 15**
- **December 20–January 5**

A blackout cannot be invented retroactively.

Before a future cycle begins, its written Day-0 record must state whether a declared blackout:

- pauses the validation clock, or
- leaves calendar targets unchanged

If no rule is written before Day 0, calendar targets remain unchanged.

## 21. 90-Day Commercial Validation Gate

**DECIDED — C18**

The gate measures external willingness to pay, not feature completion.

The Day-90 decision date is **2026-12-13**.  
The maximum one-time recheck horizon for this cycle is **120 days after Day 90: 2027-04-12**.

The decision tree is ordered, mutually exclusive, and exhaustive. Apply the first matching outcome only.

### Step 0 — Gate validity

If any minimum is missing:

- 120 unique qualified external schools contacted under C17
- 10 unique-school discovery conversations
- 3 unique-school formal paid-pilot proposals

then outcome is:

> **INCONCLUSIVE — INSUFFICIENT MARKET INPUT**

Stop. Do not classify GO, CONDITIONAL, TIMING-BOUND, EXECUTION-BLOCKED, or NO-GO.

### Step 1 — GO

If the gate is valid, classify **GO** only when all are true:

1. **QPCP ≥2**
2. at least one external school has either:
   - signed an annual contract at the tested annual price, or
   - written approval/intent from the economic buyer to convert at that annual price, subject only to normal procurement/budget timing, with a named decision date **on or before 2027-04-12**
3. founder time logs for the QPCP schools show:
   - onboarding **≤4 hours/school**, and
   - recurring support **≤1 hour/school/month**,

   **or** a remediation has been implemented before Day 90 and verified by a timed dry run or real onboarding/support evidence showing those targets are achievable.

If all are true, stop.

### Step 2 — CONDITIONAL: qualified paid evidence exists but GO is incomplete

If the gate is valid and **QPCP ≥1** but Step 1 is not satisfied:

> **CONDITIONAL — PAID SIGNAL, INCOMPLETE CONVERSION**

This includes:

- exactly one QPCP
- two or more QPCPs without annual-price conversion evidence
- QPCPs whose support/onboarding economics are still above the C09 targets

Set one recheck date no later than **2027-04-12**.

Stop.

### Step 3 — CONDITIONAL: contracted / not yet qualified

If the gate is valid, **QPCP = 0**, and at least one binding external custody-pilot agreement:

- has been signed,
- has not yet satisfied all C14 QPCP criteria, and
- has a credible path to satisfy the outstanding qualification criteria **on or before 2027-04-12**,

classify:

> **CONDITIONAL — CONTRACTED / NOT YET QUALIFIED**

This includes:

- an unpaid signed agreement with payment due on or before 2027-04-12
- a paid signed agreement not yet operationally qualified but with a planned go-live/qualification path on or before 2027-04-12

For this outcome:

- record every outstanding C14 criterion
- record payment due date if unpaid
- record planned go-live / qualification date
- set one recheck date no later than 2027-04-12

A signed agreement does not become a QPCP until all C14 criteria are satisfied.

### EXECUTION-BLOCKED override for paid agreements

If **no signed agreement can credibly become QPCP by 2027-04-12** and **at least one signed agreement has already produced actual pilot payment**, classify:

> **INCONCLUSIVE — EXECUTION BLOCKED**

This is final for this validation cycle and is not evidence that the market thesis failed.

This override applies only to actual-payment cases whose remaining failure is documented implementation/operational qualification, not lack of willingness to pay.

Stop.

### Step 4 — INCONCLUSIVE: timing-bound

If the gate is valid, **QPCP = 0**, **no Step-3 qualifying agreement exists**, the EXECUTION-BLOCKED override does not apply, and an authorized economic buyer has documented positive intent where the only remaining blocker is a specific budget/procurement calendar event with a named decision date **on or before 2027-04-12**, classify:

> **INCONCLUSIVE — TIMING-BOUND**

“Interested, later” is not sufficient.

Set one recheck date no later than 2027-04-12.

Stop.

### Step 5 — NO-GO / PIVOT

If the gate is valid and none of Steps 1–4 or the EXECUTION-BLOCKED override applies:

> **NO-GO — BOARDING-ONLY CUSTODY THESIS FAILED**

Make a pivot decision rather than adding Network/AI in an attempt to rescue an unvalidated custody thesis.

### One-time recheck rule

A **Step-2, Step-3, or Step-4** result may receive **one** recheck in this validation cycle, no later than **2027-04-12**.

At the recheck:

- re-run **Step 1 and Step 2 only** using the same criteria and the original Day-90 market-input denominator; do not rewrite qualification after the fact
- if neither Step 1 nor Step 2 applies, classify **INCONCLUSIVE — EXECUTION BLOCKED** when at least one signed agreement has produced actual pilot payment and its remaining failure is documented implementation/operational qualification
- otherwise, classify **Step 5 NO-GO**
- **Step 3 and Step 4 are not available at the recheck**
- the recheck result is final for this cycle; no second extension or additional recheck is allowed

This recheck rule is intentionally different from the Day-90 Step-3 EXECUTION-BLOCKED override:

- on Day 90, the Step-3 override still requires that **no signed agreement can credibly become QPCP by 2027-04-12** and that at least one signed agreement has actual pilot payment
- at the one-time recheck, once Step 1/2 fail, **any actual pilot payment plus documented remaining implementation/operational qualification failure** is sufficient for `INCONCLUSIVE — EXECUTION BLOCKED`
- therefore an already-paying school is never converted into a zero-willingness-to-pay NO-GO merely because its operational qualification slipped within the same bounded cycle

### OA rule

OA Amenia never counts toward the commercial validation metrics above.

## 22. Privacy / Legal / Institutional Entry

**DECIDED — C19**

Do not infer “no privacy issue” from a school’s possible non-applicability of FERPA.

A school-specific privacy/legal applicability determination is required before external live student/device data is processed.

### OPEN — O-C04: School-Specific Privacy / Student-Data Applicability

For each external pilot school, complete all four outputs below before live student/device data processing.

#### 1. Applicability record

Record:

- school state/jurisdiction
- school type/relevant status
- potentially relevant state student-privacy/operator law
- potentially relevant federal education/privacy rule
- school policy / contractual privacy requirement
- reviewer and written basis

Each item must end as one of:

- `APPLIES`
- `DOES NOT APPLY`

`UNCLEAR` is an intermediate research state only.

> **If any material legal/privacy applicability item remains `UNCLEAR`, O-C04 remains OPEN and live external student/device data processing is blocked.**

Where legal interpretation is required, an authorized school contact alone cannot convert `UNCLEAR` to `DOES NOT APPLY`; obtain a qualified legal determination or other authoritative basis appropriate to the issue.

#### 2. Data-processing / contract record

Record:

- required DPA/student-data terms and completion status
- if no separate DPA is required, written resolved basis for `DOES NOT APPLY / NOT REQUIRED`
- approved subprocessors/hosting disclosures where required

#### 3. Data lifecycle record

Record:

- approved data fields
- role/access matrix
- retention period
- deletion/offboarding procedure
- backup/deletion treatment
- authorized export/deletion contact

#### 4. Security / incident / notice record

Record:

- security contact
- incident/breach escalation path
- contractual/legal notification obligations
- parent/student notice or consent determination
- completion evidence where notice/consent is required
- written resolved basis where notice/consent is not required

**blocks:** importing, collecting, or processing real external student/device data; external live custody pilot go-live  
**does not block:** public handbook research, outreach, discovery, synthetic demo, G1-B/G1-C development  
**owner / decision source:** product owner + authorized school privacy/policy contact; qualified counsel where legal interpretation is required  
**must resolve by:** before any real external student/device data is imported or collected  
**required evidence:** all four records complete; no material `UNCLEAR`; `N/A` only with written resolved basis and reviewer

Network monitoring, if later reactivated, remains subject to its stricter separate authorization gate.

## 23. Simultaneous Pilot Capacity

**DECIDED — C20**

Formal pilot proposals are not the same as concurrent live operations.

Initial operating limit:

> **Maximum 2 external Custody Commercial Pilot Operations live concurrently, regardless of payment status (QPCP or contracted custody pilot).**

For this limit, an external operation is `live` from the **first import or collection of that school's real student/device data** until one of:

- pilot offboarding completed
- operation terminated
- annual commercial conversion begins and the pilot operation is formally closed

A third school may:

- sign for a later start date
- remain in non-live preparation using synthetic/public information only
- be waitlisted

Do not import that third school's real student/device data while two live operations are already active.

Increase the concurrent limit only after the first two live operations show that onboarding/support can remain within the C09 operating-cost guardrails.

This limit exists to prevent founder support overload from creating a false product failure.

## 24. Development Model After Pilot MVP

**DECIDED — C21**

After PILOT MVP FREEZE:

> **Sell → Observe → Fix confirmed blocker**

Classify each new request as:

- Pilot blocker
- Revenue-enabling requirement
- Post-launch / optional

Do not restart broad feature development merely because engineering capacity exists.

---

## 25. Technical Baseline Compatibility

**RESOLVED — O-C03**

Implementation Baseline v2 currently uses a single Network-dependent path to `Technical Pilot Entry` → `Actual Pilot` → AI → `Pilot Completion / Pre-commercial`.

Commercial Strategy v1.7 introduces a separate earlier custody path:

> **Custody Commercial Pilot Entry → Custody Commercial Pilot Operation → Custody-Only Paid Production Launch**

that does not require Network.

Implementation Baseline v2 is now amended by the locked **Implementation Baseline v2.6 — Custody-First Commercial Track Controlled Amendment**, making both documents simultaneously authoritative.

**former block (resolved):** final joint baseline lock in the repository  
**does not block:** G1-B independent review/closure; preparation of G1-C; public market research/discovery  
**owner / decision source:** product/technical owner  
**resolved at:** joint docs-only baseline lock  
**required evidence:**
- Implementation Baseline v2.6 accepted in final review
- section-by-section mapping
- term retirement/renaming map
- unchanged/clarified/amended invariant map
- no unmapped `Actual Pilot`, `Pilot Completion / Pre-commercial`, or relevant paid-launch dependency
- controlled docs-only lock commit containing both authoritative baseline documents

### Resolution evidence

- Implementation Baseline v2.6 final independent review accepted (user-attested Claude independent final review).
- Final verdict: `BOTH BASELINES — READY TO LOCK`.
- Locked path: `docs/device-manager/commercial-strategy-baseline-v1.7.md`.
- Locked companion path: `docs/device-manager/implementation-baseline-v2.6-commercial-amendment.md`.
- Base ref: `bb5e9f0e6f522a8a3f364b2cd913e525fce3e683`.
- v2.6 is the controlled amendment to Implementation Baseline v2.
- O-C03 is RESOLVED by the joint docs-only baseline lock containing both authoritative documents.
- The lock commit's own SHA is not embedded inside that same commit; the actual lock commit SHA is recorded in the next separate docs-only `gates.md` record commit, identifying both locked paths.
- This resolution does not reopen or change any existing Gate status.

See the companion document:

`Implementation Baseline v2.6 — Custody-First Commercial Track Controlled Amendment`.

## 26. Success Definition

**DECIDED — C22**

The next meaningful commercial success is:

> **At least two external schools have actually paid for the custody-first workflow, and at least one provides credible annual-price conversion at the proposed ACV, while onboarding/support remains economically repeatable.**

Network, AI, and full compliance-platform completion are not the next success metric.

---

# Final Reviewer Instructions

Review this document together with:

**Implementation Baseline v2.6 — Custody-First Commercial Track Controlled Amendment**

For each material decision classify:

- ACCEPT
- MODIFY
- REJECT

Specifically verify:

1. O-C01 IP/employer/contracting gate
2. O-C02 first-night identification + zero-inventory dry run
3. O-C04 privacy/legal applicability outputs
4. C14 actual cash receipt requirement
5. Day 0 and Day 30/60/90 outreach cadence
6. 120-contact gate validity minimum
7. pre-declared blackout rule
8. maximum 2 simultaneous live pilots
9. G1-B rationale
10. Network and AI freeze
11. exact compatibility with Implementation Baseline v2.6

Final verdict must be exactly one:

**COMMERCIAL STRATEGY BASELINE v1.7 — READY TO LOCK WITH IMPLEMENTATION BASELINE v2.6**

or

**COMMERCIAL STRATEGY BASELINE v1.7 — CHANGES REQUIRED**
