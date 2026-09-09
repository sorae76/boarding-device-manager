import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../supabase/migrations/20260907190930_g1a_schedule_write_boundary.sql",
  import.meta.url
);

async function migrationSql() {
  return readFile(migration, "utf8");
}

function functionBody(sql: string, startMarker: string, endMarker: string) {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start);

  assert.notEqual(start, -1, `${startMarker} must exist`);
  assert.notEqual(end, -1, `${startMarker} must have an end marker`);
  return sql.slice(start, end);
}

test("G1-A adds an append-only publication model in one forward migration", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create table public\.device_schedule_scope_revisions/);
  assert.match(sql, /create table public\.device_schedule_publications/);
  assert.match(sql, /create table public\.device_schedule_publication_ledger/);
  assert.match(sql, /create table public\.device_schedule_publication_idempotency/);
  assert.match(sql, /drop index public\.device_schedule_one_school_policy_start/);
  assert.match(sql, /drop index public\.device_schedule_one_residence_policy_start/);
  assert.match(sql, /predecessor_publication_id uuid/);
  assert.match(sql, /replaces_publication_id uuid/);
  assert.match(sql, /timezone_snapshot text not null/);
  assert.match(sql, /unique \(school_id, scope_type, scope_id, scope_revision\)/);
  assert.match(sql, /operation in \('publish', 'replace', 'cancel'\)/);
  assert.match(sql, /before update or delete on public\.device_schedule_policies/);
  assert.match(sql, /before update or delete on public\.device_schedule_weekly_events/);
  assert.match(sql, /before update or delete on public\.device_schedule_publications/);
  assert.match(sql, /before update or delete on public\.device_schedule_publication_ledger/);
  assert.match(sql, /before update or delete on public\.device_schedule_publication_idempotency/);
});

test("publish is an authenticated SECURITY DEFINER boundary with a per-scope transaction lock", async () => {
  const sql = await migrationSql();
  const publish = functionBody(
    sql,
    "create or replace function public.publish_device_schedule(",
    "create or replace function public.cancel_future_device_schedule_publication("
  );

  assert.match(publish, /language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(publish, /caller_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(publish, /target_actor|actor_user_id\s+uuid\s*[,)]/);
  assert.match(publish, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(publish, /private\.device_schedule_scope_lock_key\(target_school_id, target_dorm_id\)/);
  assert.ok(
    publish.indexOf("pg_catalog.pg_advisory_xact_lock") <
      publish.indexOf("target_expected_scope_revision <> current_revision"),
    "expected revision must be checked after the transaction-scoped advisory lock"
  );
  assert.match(sql, /hashtextextended\([\s\S]*target_school_id[\s\S]*target_dorm_id/);
  assert.match(sql, /grant execute on function public\.publish_device_schedule\([\s\S]*\) to authenticated/);
  assert.match(sql, /from public, anon, authenticated, service_role/);
});

test("authorization preserves the locked manager matrix and tenant checks", async () => {
  const sql = await migrationSql();
  const authorization = functionBody(
    sql,
    "create or replace function private.authorized_device_schedule_context(",
    "create or replace function private.normalize_device_schedule_events("
  );

  assert.match(authorization, /app_user\.id = auth\.uid\(\)/);
  assert.match(authorization, /app_user\.is_active = true/);
  assert.match(authorization, /school\.id = target_school_id/);
  assert.match(authorization, /school\.is_active = true/);
  assert.match(authorization, /residence\.school_id = target_school_id/);
  assert.match(authorization, /residence\.id = target_dorm_id/);
  assert.match(authorization, /residence\.is_active = true/);
  assert.match(authorization, /app_user\.global_role = 'super_admin'/);
  assert.match(authorization, /membership\.school_id = target_school_id/);
  assert.match(authorization, /membership\.is_active = true/);
  assert.match(authorization, /membership\.role = 'school_admin'/);
  assert.match(authorization, /target_dorm_id is not null[\s\S]*membership\.role = 'dorm_supervisor'/);
  assert.doesNotMatch(authorization, /dorm_staff|viewer|parent|student/);
});

test("weekly validation enforces the complete Monday-zero circular ring contract", async () => {
  const sql = await migrationSql();
  const validation = functionBody(
    sql,
    "create or replace function private.normalize_device_schedule_events(",
    "create or replace function private.active_device_schedule_tail("
  );

  assert.match(validation, /jsonb_typeof\(target_events\) is distinct from 'array'/);
  assert.match(validation, /jsonb_array_length\(target_events\) = 0/);
  assert.match(validation, /\(event_item ->> 'weekday'\) !~ '\^\[0-6\]\$'/);
  assert.match(validation, /\(event_item ->> 'local_time'\) !~[\s\S]*\[01\]\[0-9\][\s\S]*2\[0-3\][\s\S]*\[0-5\]\[0-9\]/);
  assert.match(validation, /\(event_item ->> 'event_type'\) not in \('release', 'return'\)/);
  assert.match(validation, /schedule_publish_duplicate_local_instant/);
  assert.match(validation, /'release' = any\(event_types\)/);
  assert.match(validation, /'return' = any\(event_types\)/);
  assert.match(validation, /event_types\[\(event_index % event_count\) \+ 1\]/);
});

test("timeline writes are future-dated, revisioned, idempotent, and append-only", async () => {
  const sql = await migrationSql();
  const publish = functionBody(
    sql,
    "create or replace function public.publish_device_schedule(",
    "create or replace function public.cancel_future_device_schedule_publication("
  );
  const cancel = functionBody(
    sql,
    "create or replace function public.cancel_future_device_schedule_publication(",
    "alter table public.device_schedule_scope_revisions enable row level security"
  );
  const publishCanonical = publish.slice(
    publish.indexOf("canonical_payload :="),
    publish.indexOf("payload_digest :=")
  );
  const cancelCanonical = cancel.slice(
    cancel.indexOf("canonical_payload :="),
    cancel.indexOf("payload_digest :=")
  );

  assert.match(publish, /target_effective_from <= local_today/);
  assert.match(publish, /target_expected_scope_revision <> current_revision/);
  assert.match(publish, /target_predecessor_publication_id <> active_tail\.id/);
  assert.match(publish, /target_replaces_publication_id[\s\S]*active_tail\.id/);
  assert.match(publish, /active_tail\.effective_from <= local_today/);
  assert.match(publish, /existing_idempotency\.canonical_payload = canonical_payload/);
  assert.match(publish, /'idempotency_conflict'/);
  assert.match(publishCanonical, /'expected_scope_revision', target_expected_scope_revision/);
  assert.doesNotMatch(publishCanonical, /timezone_snapshot/);
  assert.ok(
    publish.indexOf("select idempotency.*") < publish.indexOf("schedule_publish_invalid_timezone") &&
      publish.indexOf("select idempotency.*") <
        publish.indexOf("target_effective_from <= local_today"),
    "successful publish idempotency must replay before mutable timezone/date validation"
  );
  assert.match(publish, /insert into public\.device_schedule_policies/);
  assert.match(publish, /insert into public\.device_schedule_weekly_events/);
  assert.match(publish, /insert into public\.device_schedule_publications/);
  assert.match(publish, /insert into public\.device_schedule_publication_ledger/);
  assert.match(publish, /insert into public\.device_schedule_publication_idempotency/);
  assert.doesNotMatch(publish, /update public\.device_schedule_policies/);
  assert.doesNotMatch(publish, /update public\.device_schedule_weekly_events/);
  assert.match(cancel, /active_tail\.effective_from <= local_today/);
  assert.match(cancel, /'cancel'/);
  assert.match(cancelCanonical, /'expected_scope_revision', target_expected_scope_revision/);
  assert.ok(
    cancel.indexOf("select idempotency.*") < cancel.indexOf("schedule_cancel_invalid_timezone"),
    "successful cancellation idempotency must replay before mutable timezone validation"
  );
  assert.doesNotMatch(cancel, /update public\.device_schedule_policies/);
  assert.doesNotMatch(cancel, /delete from public\.device_schedule/);
});

test("direct schedule mutation paths are removed while authenticated reads remain", async () => {
  const sql = await migrationSql();

  for (const policy of [
    "authorized managers create device schedule policies",
    "authorized managers update device schedule policies",
    "authorized managers create device schedule weekly events",
    "authorized managers update device schedule weekly events"
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}"`));
  }
  assert.match(sql, /revoke all privileges on table public\.device_schedule_policies[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /revoke all privileges on table public\.device_schedule_weekly_events[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on table public\.device_schedule_policies to authenticated/);
  assert.match(sql, /grant select on table public\.device_schedule_weekly_events to authenticated/);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete|all)[^;]*device_schedule_(?:policies|weekly_events)/i);
});

test("G1-A is isolated from custody, resolver, exceptions, network, and UI", async () => {
  const sql = await migrationSql();
  const executableSql = sql.replace(/^\s*--.*$/gm, "");

  for (const table of [
    "device_custody_devices",
    "device_custody_events",
    "device_custody_notices",
    "incidents"
  ]) {
    assert.doesNotMatch(
      executableSql,
      new RegExp(`(?:insert\\s+into|update|delete\\s+from|alter\\s+table|drop\\s+table)\\s+(?:public\\.)?${table}`, "i")
    );
  }
  assert.doesNotMatch(executableSql, /transition_residence_device_custody/);
  assert.doesNotMatch(executableSql, /restricted_period|dst|network_|detection|allow_exception/i);
});
