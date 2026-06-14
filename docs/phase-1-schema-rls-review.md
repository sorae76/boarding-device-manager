# OAc Device Management - Phase 1 Schema and RLS Review

## Phase 1 Execution Completion

Status: migration and bootstrap executed manually in Supabase.

Supabase project:

- Project name: `dormdevice-db`
- Project ref: `haakvegrtyeyedqidgte`
- Supabase URL: `https://haakvegrtyeyedqidgte.supabase.co`

Initial tenant/admin bootstrap:

- First school: `Olivet Academy`
- First `school_id`: `42bc3608-5424-4437-bfe3-6b44829f192e`
- First admin email: `matthewn@olivetacademy.org`

Manual execution completed:

- Migration SQL executed successfully.
- Tables are visible in Supabase Table Editor.
- First Supabase Auth user was created.
- Bootstrap seed was executed.
- `notice_delay_settings` shows first notice `5`, second notice `30`, missing threshold `120`, and supervisor inclusion `true`.

## Post-Execution Verification Checklist

- Confirm the active Supabase project is `dormdevice-db`.
- Confirm project ref is `haakvegrtyeyedqidgte`.
- Confirm this schema was not run on OAc Connect, OAc Time, Student Care, or any shared database.
- Confirm all expected Phase 1 tables exist in the `public` schema.
- Confirm all public tables created for Phase 1 have RLS enabled.
- Confirm `schools` has exactly the intended first tenant row for Olivet Academy.
- Confirm `app_users` has the first admin profile row matching the Auth user ID.
- Confirm `app_user_school_roles` links the first admin to Olivet Academy.
- Confirm initial `dorms` rows exist and all belong to `42bc3608-5424-4437-bfe3-6b44829f192e`.
- Confirm `notice_delay_settings` exists for the first school with `5 / 30 / 120` and supervisor inclusion `true`.
- Confirm no rows exist for unintended/test schools.
- Confirm RLS remains enabled after bootstrap.

## SQL Verification Queries

Tables:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
```

RLS enabled status:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Schools:

```sql
select id, name, slug, timezone, is_active, created_at, updated_at
from public.schools
order by created_at;
```

Expected first school:

```sql
select id, name, slug, timezone, is_active
from public.schools
where id = '42bc3608-5424-4437-bfe3-6b44829f192e';
```

App users:

```sql
select id, email, full_name, global_role, is_active, created_at, updated_at
from public.app_users
order by created_at;
```

Expected first admin:

```sql
select id, email, full_name, global_role, is_active
from public.app_users
where email = 'matthewn@olivetacademy.org';
```

School memberships:

```sql
select
  ausr.id,
  ausr.school_id,
  s.name as school_name,
  ausr.user_id,
  au.email,
  ausr.role,
  ausr.is_active
from public.app_user_school_roles ausr
join public.schools s on s.id = ausr.school_id
join public.app_users au on au.id = ausr.user_id
order by s.name, au.email;
```

Expected first admin membership:

```sql
select
  ausr.school_id,
  ausr.user_id,
  au.email,
  ausr.role,
  ausr.is_active
from public.app_user_school_roles ausr
join public.app_users au on au.id = ausr.user_id
where ausr.school_id = '42bc3608-5424-4437-bfe3-6b44829f192e'
  and au.email = 'matthewn@olivetacademy.org';
```

Dorms:

```sql
select id, school_id, name, code, is_active, created_at, updated_at
from public.dorms
where school_id = '42bc3608-5424-4437-bfe3-6b44829f192e'
order by name;
```

Notice delay settings:

```sql
select
  school_id,
  first_notice_delay_minutes,
  second_notice_delay_minutes,
  missing_threshold_minutes,
  include_supervisor_on_second_notice
from public.notice_delay_settings
where school_id = '42bc3608-5424-4437-bfe3-6b44829f192e';
```

No unintended schools:

```sql
select id, name, slug
from public.schools
where id <> '42bc3608-5424-4437-bfe3-6b44829f192e'
order by created_at;
```

## Local Env Guidance For Phase 2

Phase 2 should include a local environment example file, but it must not contain real secrets.

Recommended file for Phase 2:

```env
NEXT_PUBLIC_SUPABASE_URL=https://haakvegrtyeyedqidgte.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key-do-not-expose>
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` is safe to include in `.env.example`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design but should still be copied from Supabase intentionally.
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to browser code.
- The real `.env.local` should stay untracked.
- Do not create or commit real credentials.

## Phase 2 Readiness Plan

Phase 2 can begin after post-execution verification is complete.

Recommended Phase 2 sequence:

1. Next.js app foundation
   - Scaffold Next.js 14 App Router with TypeScript and Tailwind CSS.
   - Add basic lint/build scripts.
   - Keep first UI minimal and operational, not marketing-focused.

2. Supabase environment variables
   - Add `.env.example` with placeholders only.
   - Add `.env.local` locally with real values, untracked.
   - Confirm no secrets are committed.

3. Supabase client setup
   - Add browser client for authenticated client-side reads.
   - Add server client for App Router server components/actions later.
   - Keep service-role usage server-only and isolated.

4. Login/auth routing
   - Implement Supabase Auth login route and callback.
   - Confirm authenticated session loading.
   - Do not grant app access unless `app_users` and `app_user_school_roles` rows exist.

5. Role-based app shell
   - Load current user profile and school membership.
   - Resolve active school context.
   - Gate navigation and routes by role.
   - Keep `parent` inactive for Phase 2 unless explicitly approved.

6. Empty Dorm Staff dashboard shell
   - Add an authenticated Dorm Staff dashboard route.
   - Show empty operational sections only after role/membership checks.
   - Include dashboard data queries later after auth and shell are verified.

Phase 2 should not implement check-in/out workflows until auth, role loading, school context, and RLS behavior are confirmed.

## Final SaaS-Ready Schema

The tenant model uses `schools` as the tenant table, `app_users` as global Supabase-auth-backed identities, and `app_user_school_roles` as the school membership table. This avoids locking the app into one school per user and gives `super_admin` a clean global role while keeping operational data tenant-scoped.

Required tables included:

- `schools`: tenant record, timezone, active state.
- `app_users`: global user profile linked to `auth.users`.
- `app_user_school_roles`: tenant-scoped role assignments for school users.
- `dorms`: school dorms or houses.
- `dorm_staff_assignments`: active dorm assignments for dorm-scoped staff access.
- `students`: boarding students, dorm assignment, enrollment status.
- `student_contacts`: parent/guardian/contact records for notifications.
- `devices`: student devices and dorm-owned pool/shared devices, QR code, identifying fields, graduation/withdrawal return fields.
- `device_current_status`: one current status row per device.
- `device_time_rules`: active Device Time windows by school and optional dorm.
- `device_checkouts`: regular custody check-out/check-in workflow.
- `device_school_use_records`: school-approved release/return workflow, separate from regular custody.
- `notice_delay_settings`: school-level first notice, second notice, and missing thresholds.
- `device_notices`: overdue/missing notice records tied to either regular checkout or school use.
- `device_logs`: append-style operational event log for all device activity.
- `device_violations`: manually created Phase 1 violations, optionally sourced from logs.
- `device_confiscations`: confiscation lifecycle records.
- `notification_templates`: school-owned reusable message templates.
- `parent_notifications`: records of parent/guardian communication.

## Complete SQL Migration Draft

Draft migration file:

`supabase/migrations/20260612133000_initial_device_management_schema.sql`

The draft includes:

- PostgreSQL enums for roles, statuses, events, notification channels, and template types.
- All required tables plus `app_user_school_roles`.
- Phase 1B hardening table: `dorm_staff_assignments`.
- Tenant-scoped `school_id` columns on operational tables.
- Tenant-safe composite foreign keys on tenant-owned relationships.
- Unique constraints for tenant-safe device QR codes, asset tags, serial numbers, dorm names/codes, and student numbers.
- Partial unique indexes to prevent more than one active regular checkout or school-use release per device.
- `updated_at` triggers.
- Immutable `device_logs` trigger that blocks update/delete for normal app users.
- RLS enabled on every table.
- RLS helper functions:
  - `current_app_user_id()`
  - `is_super_admin()`
  - `has_school_role(target_school_id, allowed_roles)`
  - `has_dorm_access(target_school_id, target_dorm_id)`
  - `can_access_student(target_school_id, target_student_id)`
  - `can_access_device(target_school_id, target_device_id)`
- Policy draft for tenant-scoped read/write access.

## RLS Policy Design

Core rule:

- `super_admin` can read and manage all schools and all tenant data.
- Non-super-admin users can only access rows where they have an active matching membership in `app_user_school_roles`.
- `viewer` can read operational records but cannot write.
- `school_admin` and `dorm_supervisor` can read/write operational records across their school.
- `dorm_staff` can read/write operational records only when the row resolves to an assigned active dorm.
- Settings tables are more restrictive: only `school_admin` and `dorm_supervisor` can manage Device Time rules, notice delay settings, dorms, and notification templates.
- `device_logs` are insert-only for school staff in the draft. Updates/deletes are blocked by trigger for normal app users; only `service_role` maintenance can mutate logs.
- `parent` is included in the role enum but intentionally not granted Phase 1 policies yet.

Policy helper pattern:

```sql
public.has_school_role(
  school_id,
  array['school_admin','dorm_supervisor','dorm_staff']::public.school_role[]
)
```

This makes each operational table enforce tenant scope directly at the row level.

Dorm-aware access pattern:

```sql
public.can_access_student(school_id, student_id)
public.can_access_device(school_id, device_id)
public.has_dorm_access(school_id, dorm_id)
```

For dorm staff, student access is based on `students.dorm_id`. Device access is based on the assigned student's dorm when `devices.student_id` is present, or on `devices.dorm_id` for shared/pool devices.

## Role Access Matrix

| Area | super_admin | school_admin | dorm_supervisor | dorm_staff | viewer | parent |
|---|---:|---:|---:|---:|---:|---:|
| Schools | Manage all | Read own | Read own | Read own | Read own | Phase 2+ |
| App users | Manage all | Read memberships | Read memberships | Read memberships | Read memberships | Phase 2+ |
| Role assignments | Manage all | Manage own school | Read | Read | Read | Phase 2+ |
| Dorm staff assignments | Manage all | Manage | Manage | Read own | Read | None |
| Dorms | Manage all | Manage | Manage | Read assigned | Read | None |
| Students | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | Phase 2+ |
| Student contacts | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | Phase 2+ |
| Devices | Manage all | Manage school | Manage school | Manage assigned dorm/pool | Read school | Phase 2+ |
| Current device status | Manage all | Manage school | Manage school | Manage assigned dorm/pool | Read school | Phase 2+ |
| Device Time rules | Manage all | Manage | Manage | Read | Read | None |
| Regular checkouts | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | None |
| School-use records | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | None |
| Notice delay settings | Manage all | Manage | Manage | Read | Read | None |
| Device notices | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | None |
| Device logs | Service maintenance | Read/Create | Read/Create | Read/Create assigned dorm | Read school | None |
| Violations | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | Phase 2+ |
| Confiscations | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | Phase 2+ |
| Notification templates | Manage all | Manage | Manage | Read | Read | None |
| Parent notifications | Manage all | Manage school | Manage school | Manage assigned dorm | Read school | Phase 2+ |

## Device Time and Overdue Behavior Captured by Schema

Device Time:

- `device_time_rules` stores active rule windows.
- `device_checkouts.device_time_rule_id` links normal checkouts to the rule that allowed them.
- If no rule applies, `device_checkouts.override_used = true` requires `override_reason`.
- Overrides should create a `device_logs` row with `event_type = 'checkout_override'`.

Overdue notices:

- `notice_delay_settings` stores school defaults:
  - First notice: 5 minutes.
  - Second notice: 30 minutes.
  - Missing threshold: 120 minutes.
- `device_notices.notice_level` tracks `first`, `second`, and `missing`.
- `device_notices` can attach to either `device_checkouts` or `device_school_use_records`, but not both.
- Status transitions should be logged in `device_logs`.

Regular vs school-approved use:

- Regular custody is only in `device_checkouts`.
- School-approved use is only in `device_school_use_records`.
- Each table has its own active-record uniqueness index to prevent duplicate active flows for the same device.

## Dorm Scope Model

`dorm_staff_assignments` maps users to active dorm assignments inside a school. A dorm staff assignment is active when:

- `is_active = true`
- `starts_at <= now()`
- `ends_at is null` or `ends_at > now()`

`school_admin` and `dorm_supervisor` are school-wide operational roles. `dorm_staff` is not school-wide for operational records. For dorm staff:

- Student access resolves through `students.dorm_id`.
- Student contact access resolves through the related student.
- Student-owned device access resolves through the related student's dorm.
- Shared or pool device access resolves through `devices.dorm_id`.
- Operational child rows such as checkouts, school-use records, notices, logs, violations, confiscations, and parent notifications resolve through their related student and/or device.

## Shared and Pool Devices

`devices.student_id` is nullable in Phase 1B so a device can be owned by a dorm rather than assigned to a specific student. `devices.dorm_id` is also nullable, but the table requires at least one of `student_id` or `dorm_id`.

Dorm staff can access pool devices only when:

- `devices.student_id is null`
- `devices.dorm_id` matches one of their active dorm assignments

If a device has an assigned student, the student's dorm is the source of access control.

## Tenant-Safe Foreign Key Strategy

Tenant-owned tables now include `unique (school_id, id)` so child tables can reference tenant-owned parents with composite foreign keys. The intended pattern is:

- `(school_id, dorm_id)` references `dorms(school_id, id)`
- `(school_id, student_id)` references `students(school_id, id)`
- `(school_id, device_id)` references `devices(school_id, id)`
- `(school_id, checkout_id)` references `device_checkouts(school_id, id)`
- `(school_id, school_use_record_id)` references `device_school_use_records(school_id, id)`

Composite foreign keys use `on delete restrict` where nulling only the child ID would otherwise risk trying to null `school_id`. Actor fields such as `created_by_user_id` still reference global `app_users(id)` because `app_users` is intentionally not tenant-owned identity data.

`dorm_staff_assignments` also references `(school_id, user_id)` on `app_user_school_roles`, which ensures an assignment cannot point to a user outside the school membership table.

## Audit Log Immutability

`device_logs` remain separate from violations and are append-style audit records. Phase 1B adds a trigger that prevents normal app users from updating or deleting log rows. RLS allows select and insert for permitted users, but does not grant normal update/delete policies. The trigger allows `service_role` maintenance only.

## Schema Conflicts and Missing Fields to Approve

1. `app_users` does not include `school_id` by design.
   The SaaS-ready model uses `app_user_school_roles.school_id` for tenant membership. This is cleaner for multi-school users and global admins, but it is a design decision to approve.

2. Parent access is intentionally deferred.
   The `parent` role exists in the enum, but Phase 1 policies do not grant parent reads. Parent portal rules should be designed separately so parents only see their own students and approved record types.

3. Dorm-level staff restrictions are now represented in the draft.
   The model depends on accurate `dorm_staff_assignments` rows and on operational writes using the tenant-safe student/device relationships.

4. Device Time enforcement is not fully enforceable with table constraints alone.
   Whether a Device Time rule applies depends on local school timezone, day, dorm, and clock time. This should be enforced in a database RPC or server-side action, not by direct table inserts from the client.

5. Automatic notice creation is not implemented in the schema draft.
   The schema supports first, second, and missing notices. Actual scheduling should be handled by Supabase Edge Functions, Vercel Cron, or database scheduled jobs after approval.

6. `device_logs` are now trigger-protected against normal app-user update/delete.
   Service-role maintenance remains possible for exceptional administrative repair.

7. QR scan storage is minimal.
   The schema stores `devices.qr_code`. If scan history, scan device metadata, or scan failure auditing is required, add a `device_scan_events` table.

8. Reports are supported by indexed operational tables, not by report snapshot tables.
   If official signed/monthly reports need frozen historical output, add `report_runs` and `report_exports`.

9. File storage is not represented yet.
   Supabase Storage buckets and object policies are not included because Phase 1 did not specify uploaded files. If confiscation photos, signed return forms, or attachments are needed, add attachment tables and storage policies.

10. Graduation and withdrawal return records are stored on `devices`.
    If return workflows need multiple attempts, signatures, or formal custody documents, add a separate `device_final_return_records` table.

11. A user currently has one role per school in `app_user_school_roles`.
    This supports tenant-safe assignment FKs. If multiple simultaneous roles per user per school are required, replace this with a separate membership table plus membership-role table.

## Recommended Approval Decisions Before Implementation

- Confirm that `app_user_school_roles` is acceptable as the tenant membership model.
- Confirm that one active school role per user per school is acceptable.
- Confirm that dorm staff should receive access through `dorm_staff_assignments`.
- Decide whether final return records need a separate table.
- Decide whether QR scan audit history is needed in Phase 1.
- Decide whether Device Time checkouts must be performed only through secure RPC functions.
