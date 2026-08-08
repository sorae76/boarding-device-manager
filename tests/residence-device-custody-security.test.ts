import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../supabase/migrations/20260807000000_harden_residence_device_custody_transitions.sql",
  import.meta.url
);

test("custody authorization derives the current residence and active assignment", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /create or replace function public\.can_access_custody_student/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /student\.dorm_id/);
  assert.match(sql, /residence\.is_active = true/);
  assert.match(sql, /assignment\.is_active = true/);
  assert.match(sql, /assignment\.starts_at <= now\(\)/);
  assert.match(sql, /assignment\.ends_at is null or assignment\.ends_at > now\(\)/);
  assert.match(sql, /membership\.role = 'dorm_staff'/);
  assert.match(sql, /membership\.role = 'school_admin'/);
  assert.match(sql, /au\.global_role = 'super_admin'/);
  assert.doesNotMatch(sql, /membership\.role = 'dorm_supervisor'/);
  assert.doesNotMatch(sql, /membership\.role = 'viewer'/);
});

test("custody device and event policies are replaced with residence-scoped checks", async () => {
  const sql = await readFile(migration, "utf8");

  for (const policy of [
    "authorized staff read custody devices",
    "authorized staff create custody devices",
    "authorized staff update custody devices",
    "authorized staff read custody events",
    "authorized staff create custody events"
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}"`));
    assert.match(sql, new RegExp(`create policy "${policy}"`));
  }

  const updatePolicy = sql.slice(sql.indexOf('create policy "authorized staff update custody devices"'));
  assert.match(updatePolicy, /using \(public\.can_access_custody_student\(school_id, student_id\)\)/);
  assert.match(updatePolicy, /with check \([\s\S]*public\.can_access_custody_student\(school_id, student_id\)/);
  assert.match(updatePolicy, /updated_by_user_id = auth\.uid\(\)/);

  const eventInsert = sql.slice(sql.indexOf('create policy "authorized staff create custody events"'));
  assert.match(eventInsert, /performed_by_user_id = auth\.uid\(\)/);
  assert.match(eventInsert, /device\.student_id = device_custody_events\.student_id/);
  assert.match(eventInsert, /device_custody_events\.student_id is null[\s\S]*can_access_custody_student\(device_custody_events\.school_id, null\)/);
  assert.match(eventInsert, /action in \('marked_missing', 'exception'\)/);
  assert.match(eventInsert, /action = 'returned'[\s\S]*device\.status = 'lost'/);
  assert.doesNotMatch(eventInsert, /action = 'checked_out'/);
});

test("null-student event compatibility is admin-only while staff stays student scoped", async () => {
  const sql = await readFile(migration, "utf8");
  const eventSelect = sql.slice(
    sql.indexOf('create policy "authorized staff read custody events"'),
    sql.indexOf('create policy "authorized staff create custody events"')
  );
  const eventInsert = sql.slice(sql.indexOf('create policy "authorized staff create custody events"'));

  for (const policy of [eventSelect, eventInsert]) {
    assert.match(policy, /device_custody_events\.student_id is null[\s\S]*can_access_custody_student\(device_custody_events\.school_id, null\)/);
    assert.match(policy, /device\.student_id = device_custody_events\.student_id[\s\S]*can_access_custody_student\([\s\S]*device_custody_events\.student_id/);
  }

  const helper = sql.slice(
    sql.indexOf("create or replace function public.can_access_custody_student"),
    sql.indexOf("revoke all on function public.can_access_custody_student")
  );
  assert.match(helper, /au\.global_role = 'super_admin'/);
  assert.match(helper, /membership\.role = 'school_admin'/);
  assert.match(helper, /student\.id = target_student_id[\s\S]*membership\.role = 'dorm_staff'/);
  assert.doesNotMatch(helper, /target_student_id is null[\s\S]*membership\.role = 'dorm_staff'/);
});

test("new security-definer functions expose only the required authenticated entry point", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /revoke all on function public\.transition_residence_device_custody\([\s\S]*\) from public/);
  assert.match(sql, /revoke all on function public\.transition_residence_device_custody\([\s\S]*\) from anon/);
  assert.match(sql, /grant execute on function public\.transition_residence_device_custody\([\s\S]*\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute[^;]*to anon/);
});
