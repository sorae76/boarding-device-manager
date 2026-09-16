# Pilot handoff runbook

Scope: custody-only Minimal Handoff / Onboarding, following G1-C closure at
`e26209a7fa6aa4a85cbc967bd7c20d84bcbd08bb`. This guide does not declare PILOT MVP
FREEZE or authorize deployment, Production changes, or live student-data use.

## 1. Before setup

Use synthetic identities and device data for rehearsal. Before any external real
student/device data is imported or collected, complete school-specific O-C04
privacy/data-processing records and check C20 capacity (maximum two live external
operations, counted from first real-data import). Resolve O-C01 before a binding
paid agreement. Before go-live, complete all D32 entry evidence, including O-C02,
institutional approval, collection-site connectivity and agreed success criteria.
The locked commercial v1.7 and implementation v2.6 baselines remain authoritative.

Assign named people and actual contact details before handoff:

| Responsibility | Record locally in the school's approved operational record |
| --- | --- |
| School champion / shift lead | Name, availability, escalation contact |
| Setup administrator | Name and authorized school |
| Support and rollback owner | Contact, coverage, authority to stop operation |
| Privacy / export / offboarding owner | Approved contact and data-lifecycle procedure |

Do not put real student information or credentials in this repository.

## 2. Initial school, admin and staff setup

There is no self-service school/staff provisioning screen. An authorized technical
maintainer must provision the existing records in the intended, separately
authorized environment; the school operator then verifies access:

1. Confirm environment and school identity. Configure the existing school name,
   slug, active flag and correct IANA timezone before schedule setup.
2. Confirm sign-in configuration. Associate each authenticated account with its
   active `app_users` record and active `app_user_school_roles` membership. Use a
   school admin for ordinary administration; do not grant global super-admin as
   an onboarding shortcut. Confirm Settings shows the intended school and role.
   The current session chooses the first active school membership; use an
   unambiguous pilot account and verify the resulting school explicitly.
3. Create active residences through Residences. Provision staff assignments in
   existing `dorm_staff_assignments`: correct school, user, residence, active flag,
   start time and optional end time. An assignment must be valid now.
4. Sign in as each operator. Check an assigned residence and a denied residence.
   A missing device may be an assignment problem; do not recreate it to bypass
   access restrictions. Escalate to the setup administrator.

| Role | Pilot duties using existing permissions |
| --- | --- |
| School admin / authorized super admin | Student setup, device CSV import, Registry/custody and schedule administration |
| Dorm staff | Registry/custody and registration review within current residence assignments |
| Dorm supervisor | Existing residence/schedule duties; no Registry/custody access |
| Student | Linked-account registration request; no Registry access |
| Viewer / parent | No new custody permissions |

## 3. Establish students and devices

### Path A — existing student setup, then device CSV

1. In Students, add/edit students using existing fields. Confirm unique student
   numbers, names, active status and primary residence. There is no student CSV
   importer. Time this work at representative roster size; record a blocker if
   existing setup is too slow rather than introducing an unapproved bulk tool.
2. In Device Registry, download the device CSV template and preserve its columns.
   Match an existing active student by student number, or by a unique first/last
   name match. Include type, manufacturer, model and color. Serial is optional.
3. Preview as an admin, resolve errors and duplicates, and check valid-row count.
   Import only after reviewing the intended initial statuses. CSV initial status
   is inventory setup, not evidence of a physical handover.
4. Verify imported records and identifiers. For first collection, establish the
   device as with the student (`checked_out`) and record the actual Return using
   the existing custody workflow. Do not repeatedly import after an uncertain
   response: inspect the Registry first, particularly if identifiers were blank.

### Path B — student self-registration, then staff approval

1. Save the student's correct school email using existing admin controls. Verify
   sign-in links exactly the intended active student and opens the student portal.
2. Student submits a device registration request. This path requires a serial
   number and does not itself register a physical Return.
3. Authorized staff open Device Registry -> Pending registrations, verify the
   student and physical device, then approve or reject with the appropriate note.
4. Confirm the approved device appears once. Record actual collection separately
   with Return. Rejected requests must not create custody devices.

### First capture / identification rehearsal — existing staff flow

For a student with no device inventory, use Add device with student, device type,
manufacturer, model and color. Serial may be left blank and added later. Confirm
the generated/provided identifier distinguishes multiple similar devices. Keep
initial status `checked_out`, save, then physically collect and record Return.
The registration record has creator attribution; the Return event is the custody
handover evidence. Check both before continuing.

Test one school-approved identification method: existing search or QR workflow.
Do not require permanent labels on student-owned devices. Record elapsed time,
accuracy, duplicate/uncertain-result handling and whether ordinary staff can
complete a first night starting with zero device inventory. Synthetic automation
is technical evidence, not O-C02 school acceptance. If the existing path fails,
record the specific blocker; no registration/schema redesign is preapproved.

## 4. Schedule and allow exceptions

An authorized manager uses Settings -> Schedule management. Confirm school
timezone, school/residence scope, weekly Return/Release events and effective dates.
Preview before publishing. Residence policy overrides school policy. On conflict
or timezone change, reload the scope and preview again; do not reinterpret a stale
draft. Published content is immutable; use the existing future cancellation or
successor workflow. A currently effective policy cannot simply be deleted/reset.

Allow exceptions target exactly one device, student or residence. Enter explicit
UTC timestamps ending in `Z`, with start/end and reason. Confirm conversion from
the intended school-local time. Corrections use revoke plus a new exception;
past authorization history remains. Schedules and exceptions do not change
physical custody status. Do not infer collection or release from a schedule.

The first real Production policy/publication/rendering QA remains deferred from
G1-C and requires its own authorization and evidence before relying on that setup.

## 5. Daily custody and shift handoff

1. Confirm school, residence access, connection and physical storage arrangement.
2. Identify student and device using existing Rapid Scan/search/QR. Inspect the
   current record before Return or Release; physically confirm the handover.
3. For missing/recovered devices use existing Missing/Recovery controls. Do not
   create replacement records or alter history to conceal an earlier mistake.
4. Open Device Registry -> Handoff — non-returned devices. It includes
   `checked_out`, `lost` and `inactive`, and excludes `returned`. Inactive-student
   devices remain included when authorized. Inactive means the existing
   broken/unusable category, not proof of absence from storage.
5. Refresh before accepting handoff. The list is operational current state loaded
   across successive requests, not an atomic or frozen audit snapshot. A device
   can change while the list is loading. Inclusion alone is not overdue status,
   misconduct or physical-location proof. Discuss relevant devices with the next
   authorized operator and open details/history for unresolved questions.
6. If loading fails, treat handoff as unverified and refresh after connectivity
   returns. Never treat an old or incomplete screen as a complete reconciliation.

## 6. Failure, recovery and disposable reset

- **Connection failure:** stop app submissions. Follow the school's approved
  temporary physical-custody log, recording student/device identifier, direction,
  actual time and staff identity securely. Recheck connection at the actual
  collection location. There is no offline mutation queue.
- **Uncertain submission:** refresh the device and history first. If already
  applied, do not repeat. If not applied, confirm the physical state and use the
  existing transition. If the state is incompatible, stop and escalate; do not
  force it by editing a status directly.
- **Reconciliation:** authorized staff compare the temporary log with existing
  events. Record a delayed action only through the normal workflow, with a note
  identifying the actual handover time and delayed entry where supported. The
  server event time remains the recording time; do not backdate it or claim it
  proves the earlier physical time. Escalate cases the existing workflow cannot
  safely represent. Retain the temporary record under the approved retention rule.
- **Access problem:** verify active user/membership, school, residence and current
  assignment with the setup administrator. Never share accounts or broaden roles.
- **Stop/rollback:** the named owner pauses use, preserves evidence and arranges
  a separately authorized recovery/deployment action. No operator database reset.
- **Synthetic reset:** use only the disposable test harness below. It creates a
  uniquely named temporary PostgreSQL container and removes that container on
  completion. A fresh run recreates synthetic fixtures. If cleanup is interrupted,
  have the technical owner verify the exact harness-owned container name before
  removal. Never point tests at a shared, staging or Production database.

Custody event history must remain intact. Device detail shows up to 50 recent
events and the global log up to 100; device CSV export is inventory, not a complete
audit export. Escalate older-history needs to the authorized data owner.
School-specific deletion/offboarding and backup treatment belong to O-C04;
the rehearsal required for Custody Commercial Ready is not a reset of pilot history.

## 7. Rehearsal and evidence

Record operator, environment, date, expected/actual result, elapsed time and
remaining blockers for each row. Leave unperformed checks explicitly pending.

| Check | Acceptance |
| --- | --- |
| Provisioning | Correct school/role, current residence assignments and denied access verified |
| Path A | Existing student setup -> device CSV preview/import -> distinguishable inventory |
| Path B | Linked student request -> approval/rejection -> correct inventory |
| First capture | No serial -> identify device -> Return -> attributed event; zero-inventory trial timed |
| Custody | Return/Release/Missing/Recovery, duplicate/stale result and audit preservation |
| Handoff | All authorized non-returned states, no returned records, refresh and failure handling |
| Schedule / exceptions | Existing preview/publication and allow/revoke rehearsed synthetically |
| Recovery | Uncertain response and connectivity fallback reconciled without history reset |
| School acceptance | O-C02 identification/zero-inventory evidence and actual-site connectivity separately recorded |

Track founder onboarding time against the provisional <=4 hours/school target;
recurring support target is <=1 hour/school/month after stabilization. Do not
claim these targets from automated test duration.

Technical owner commands, from the repository with dependencies and Docker ready:

```text
node --experimental-strip-types --test tests/device-handoff.test.ts tests/pilot-onboarding.test.ts
node --experimental-strip-types tests/device-schedule-write-boundary-db.mjs --with-g1b --with-g1c --with-handoff
node --experimental-strip-types --test tests/*.test.ts
npm.cmd run typecheck -- --incremental false
npm.cmd run lint -- --no-cache
```

Before build, override the process environment with loopback-only
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` and a synthetic
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; then run `npm.cmd run build`. Do not edit or use
Production credentials. App-module transport tests, disposable DB tests and
operator/school acceptance are distinct evidence; none implies Production QA.

Implementation validation and independent review precede any separately
authorized commit/push. PILOT MVP FREEZE requires its own later `gates.md` record
with the approved commit SHA; this runbook is not that record.
