import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../supabase/migrations/20260831000000_add_device_schedule_foundation.sql",
  import.meta.url
);

async function migrationSql() {
  return readFile(migration, "utf8");
}

function functionBody(sql: string, name: string, nextMarker: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf(nextMarker, start);

  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have an end marker`);
  return sql.slice(start, end);
}

test("schedule foundation defines independent weekly events and dated policies", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create type public\.device_schedule_event_type as enum \('release', 'return'\)/);
  assert.match(sql, /create table public\.device_schedule_policies/);
  assert.match(sql, /school_id uuid not null references public\.schools/);
  assert.match(sql, /dorm_id uuid,/);
  assert.match(sql, /effective_from date not null/);
  assert.match(sql, /effective_to date/);
  assert.match(sql, /effective_to is null or effective_to >= effective_from/);
  assert.match(sql, /create table public\.device_schedule_weekly_events/);
  assert.match(sql, /weekday smallint not null/);
  assert.match(sql, /local_time time without time zone not null/);
  assert.match(sql, /event_type public\.device_schedule_event_type not null/);
  assert.match(sql, /check \(weekday between 0 and 6\)/);
  assert.match(sql, /unique \(policy_id, weekday, local_time\)/);
  assert.doesNotMatch(sql, /release_time|return_time/);
});

test("schedule ownership is same-school and supports one start per policy scope", async () => {
  const sql = await migrationSql();

  assert.match(sql, /foreign key \(school_id, dorm_id\)[\s\S]*references public\.dorms\(school_id, id\)/);
  assert.match(sql, /foreign key \(school_id, policy_id\)[\s\S]*references public\.device_schedule_policies\(school_id, id\)/);
  assert.match(sql, /device_schedule_one_school_policy_start[\s\S]*where dorm_id is null/);
  assert.match(sql, /device_schedule_one_residence_policy_start[\s\S]*where dorm_id is not null/);
  assert.match(sql, /DSE-2 atomic writes must reject[\s\S]*overlapping effective ranges/);
});

test("global Super Admin bypasses membership while ordinary readers remain actively scoped", async () => {
  const sql = await migrationSql();
  const reader = functionBody(
    sql,
    "can_read_device_schedule_policy",
    "create or replace function public.can_manage_device_schedule_policy"
  );

  assert.match(sql, /alter table public\.device_schedule_policies enable row level security/);
  assert.match(sql, /alter table public\.device_schedule_weekly_events enable row level security/);
  const ordinaryReader = reader.slice(reader.indexOf("or exists ("));

  assert.match(reader.slice(0, reader.indexOf("or exists (")), /select public\.is_super_admin\(\)/);
  assert.doesNotMatch(reader.slice(0, reader.indexOf("or exists (")), /app_user_school_roles|membership/);
  assert.match(ordinaryReader, /app_user_school_roles membership/);
  assert.match(reader, /app_user\.is_active = true/);
  assert.match(reader, /membership\.is_active = true/);
  assert.match(reader, /school\.is_active = true/);
  assert.match(reader, /target_dorm_id is null[\s\S]*'dorm_staff', 'viewer'/);
  assert.match(reader, /target_dorm_id is not null[\s\S]*membership\.role = 'dorm_staff'/);
  assert.match(reader, /assignment\.is_active = true/);
  assert.match(reader, /assignment\.starts_at <= now\(\)/);
  assert.match(reader, /assignment\.ends_at is null or assignment\.ends_at > now\(\)/);
});

test("global Super Admin bypasses membership while ordinary managers remain actively scoped", async () => {
  const sql = await migrationSql();
  const manager = functionBody(
    sql,
    "can_manage_device_schedule_policy",
    "revoke all on function public.can_read_device_schedule_policy"
  );

  const ordinaryManager = manager.slice(manager.indexOf("or exists ("));

  assert.match(manager.slice(0, manager.indexOf("or exists (")), /select public\.is_super_admin\(\)/);
  assert.doesNotMatch(manager.slice(0, manager.indexOf("or exists (")), /app_user_school_roles|membership/);
  assert.match(ordinaryManager, /app_user_school_roles membership/);
  assert.match(ordinaryManager, /app_user\.is_active = true/);
  assert.match(ordinaryManager, /membership\.is_active = true/);
  assert.match(ordinaryManager, /school\.is_active = true/);
  assert.match(manager, /membership\.role = 'school_admin'/);
  assert.match(manager, /target_dorm_id is not null[\s\S]*membership\.role = 'dorm_supervisor'/);
  assert.doesNotMatch(manager, /dorm_staff|viewer/);
  assert.match(sql, /authorized managers create device schedule policies/);
  assert.match(sql, /authorized managers update device schedule policies/);
  assert.match(sql, /authorized managers create device schedule weekly events/);
  assert.match(sql, /authorized managers update device schedule weekly events/);
  assert.doesNotMatch(sql, /for delete/);
});

test("reader role matrix preserves school-default and Residence boundaries", async () => {
  const sql = await migrationSql();
  const reader = functionBody(
    sql,
    "can_read_device_schedule_policy",
    "create or replace function public.can_manage_device_schedule_policy"
  );

  assert.match(reader, /membership\.role in \('school_admin', 'dorm_supervisor'\)/);
  assert.match(reader, /target_dorm_id is null[\s\S]*membership\.role in \('dorm_staff', 'viewer'\)/);
  assert.match(reader, /target_dorm_id is not null[\s\S]*membership\.role = 'dorm_staff'/);
  assert.match(reader, /assignment\.dorm_id = target_dorm_id/);
  assert.doesNotMatch(
    reader.slice(reader.indexOf("target_dorm_id is not null")),
    /membership\.role = 'viewer'/
  );
});

test("weekly event writes inherit authorization from their owning policy", async () => {
  const sql = await migrationSql();
  const eventPolicies = sql.slice(
    sql.indexOf('create policy "authorized members read device schedule weekly events"')
  );

  assert.match(eventPolicies, /policy\.school_id = device_schedule_weekly_events\.school_id/);
  assert.match(eventPolicies, /policy\.id = device_schedule_weekly_events\.policy_id/);
  assert.match(eventPolicies, /can_read_device_schedule_policy\(policy\.school_id, policy\.dorm_id\)/);
  assert.match(eventPolicies, /can_manage_device_schedule_policy\(policy\.school_id, policy\.dorm_id\)/);
  assert.match(eventPolicies, /created_by_user_id = auth\.uid\(\)/);
  assert.match(eventPolicies, /updated_by_user_id = auth\.uid\(\)/);
});

test("policy and event updates protect old and new ownership through USING and WITH CHECK", async () => {
  const sql = await migrationSql();
  const policyUpdate = sql.slice(
    sql.indexOf('create policy "authorized managers update device schedule policies"'),
    sql.indexOf('create policy "authorized members read device schedule weekly events"')
  );
  const eventUpdate = sql.slice(
    sql.indexOf('create policy "authorized managers update device schedule weekly events"'),
    sql.indexOf("revoke all privileges on table public.device_schedule_policies")
  );

  assert.match(policyUpdate, /using \(public\.can_manage_device_schedule_policy\(school_id, dorm_id\)\)/);
  assert.match(policyUpdate, /with check \([\s\S]*can_manage_device_schedule_policy\(school_id, dorm_id\)/);
  assert.match(policyUpdate, /updated_by_user_id = auth\.uid\(\)/);
  assert.match(eventUpdate, /using \([\s\S]*policy\.school_id = device_schedule_weekly_events\.school_id/);
  assert.match(eventUpdate, /policy\.id = device_schedule_weekly_events\.policy_id/);
  assert.match(eventUpdate, /with check \([\s\S]*updated_by_user_id = auth\.uid\(\)/);
  assert.match(eventUpdate, /with check \([\s\S]*can_manage_device_schedule_policy\(policy\.school_id, policy\.dorm_id\)/);
});

test("schedule migration is isolated from legacy rules and custody", async () => {
  const sql = await migrationSql();

  for (const table of [
    "device_time_rules",
    "device_current_status",
    "device_checkouts",
    "device_school_use_records"
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`(?:alter|drop|insert into|update)\\s+(?:table\\s+)?public\\.${table}`, "i")
    );
  }
  assert.doesNotMatch(sql, /transition_residence_device_custody/);
});
