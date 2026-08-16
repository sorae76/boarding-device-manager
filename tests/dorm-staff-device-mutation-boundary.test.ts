import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const migrationPath =
  "../supabase/migrations/20260810000000_harden_dorm_staff_device_mutation_boundaries.sql";

function functionBody(sql: string, name: string, nextMarker: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf(nextMarker, start);

  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have an end marker`);
  return sql.slice(start, end);
}

test("Dorm Staff loses generic device, event, and notice mutation policies", async () => {
  const sql = await read(migrationPath);

  for (const policy of [
    "authorized staff create custody devices",
    "authorized staff update custody devices",
    "authorized staff create custody events",
    "authorized staff update custody notices"
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}"`));
  }

  for (const policy of [
    "custody admins create custody devices",
    "custody admins update custody devices",
    "custody admins create custody events",
    "custody admins update custody notices"
  ]) {
    assert.match(sql, new RegExp(`create policy "${policy}"`));
  }

  const policies = sql.slice(sql.indexOf('create policy "custody admins create custody devices"'));
  assert.match(policies, /can_administer_custody_school/);
  assert.doesNotMatch(policies, /can_access_custody_student/);
  assert.doesNotMatch(policies, /'dorm_staff'/);
  assert.match(policies, /device_custody_events\.student_id is null/);
});

test("admin helper excludes supervisor and viewer and requires active school context", async () => {
  const sql = await read(migrationPath);
  const helper = functionBody(
    sql,
    "can_administer_custody_school",
    "revoke all on function public.can_administer_custody_school"
  );

  assert.match(helper, /app_user\.is_active = true/);
  assert.match(helper, /membership\.is_active = true/);
  assert.match(helper, /school\.is_active = true/);
  assert.match(helper, /global_role = 'super_admin'/);
  assert.match(helper, /membership\.role = 'school_admin'/);
  assert.doesNotMatch(helper, /dorm_supervisor|viewer|dorm_staff/);
});

test("controlled operations derive caller and use current residence authorization", async () => {
  const sql = await read(migrationPath);

  for (const [name, next] of [
    ["register_residence_device", "create or replace function public.correct_residence_device_identity"],
    ["correct_residence_device_identity", "create or replace function public.set_residence_device_return_deadline"],
    ["set_residence_device_return_deadline", "create or replace function public.review_residence_device_notice"],
    ["review_residence_device_notice", "revoke all on function public.register_residence_device"]
  ] as const) {
    const rpc = functionBody(sql, name, next);
    assert.match(rpc, /security definer/);
    assert.match(rpc, /set search_path = public, pg_temp/);
    assert.match(rpc, /auth\.uid\(\)/);
    assert.match(rpc, /can_access_custody_student|can_administer_custody_school/);
  }

  assert.match(sql, /assignment\.is_active = true|can_access_custody_student/);
});

test("registration controls audit, QR identity, scope, and Dorm Staff initial state", async () => {
  const sql = await read(migrationPath);
  const rpc = functionBody(
    sql,
    "register_residence_device",
    "create or replace function public.correct_residence_device_identity"
  );

  assert.doesNotMatch(rpc.slice(0, rpc.indexOf("returns uuid")), /target_(?:school|user|qr)/);
  assert.match(rpc, /can_access_custody_student\(target_student\.school_id, target_student\.id\)/);
  assert.match(rpc, /target_initial_status not in \('checked_out', 'returned'\)/);
  assert.match(rpc, /created_by_user_id, updated_by_user_id/);
  assert.match(rpc, /caller_id, caller_id/);
  assert.doesNotMatch(rpc, /qr_token/);
});

test("identity and deadline RPCs update only approved columns", async () => {
  const sql = await read(migrationPath);
  const identity = functionBody(
    sql,
    "correct_residence_device_identity",
    "create or replace function public.set_residence_device_return_deadline"
  );
  const deadline = functionBody(
    sql,
    "set_residence_device_return_deadline",
    "create or replace function public.review_residence_device_notice"
  );

  for (const field of [
    "device_type",
    "manufacturer",
    "model",
    "color",
    "serial_number",
    "asset_tag",
    "notes"
  ]) {
    assert.match(identity, new RegExp(`${field} =`));
  }
  const identitySet = identity.slice(
    identity.indexOf("set device_type"),
    identity.indexOf("where id =", identity.indexOf("set device_type"))
  );
  const deadlineSet = deadline.slice(
    deadline.indexOf("set return_due_at"),
    deadline.indexOf("where id =", deadline.indexOf("set return_due_at"))
  );
  assert.doesNotMatch(identitySet, /\b(?:school_id|student_id|status|return_due_at|qr_token|created_by_user_id)\s*=/);
  assert.match(deadlineSet, /set return_due_at = target_return_due_at/);
  assert.doesNotMatch(deadlineSet, /\b(?:status|student_id|school_id|qr_token)\s*=/);
});

test("notice review changes only review fields", async () => {
  const sql = await read(migrationPath);
  const rpc = functionBody(
    sql,
    "review_residence_device_notice",
    "revoke all on function public.register_residence_device"
  );
  const update = rpc.slice(rpc.indexOf("update public.device_custody_notices"));
  const setClause = update.slice(update.indexOf("set status"), update.indexOf("where school_id"));

  for (const field of ["status", "reviewed_by_user_id", "reviewed_at", "review_notes"]) {
    assert.match(setClause, new RegExp(`${field} =`));
  }
  assert.doesNotMatch(setClause, /\b(?:school_id|device_id|student_id|reason|occurred_at|notice_type)\s*=/);
});

test("application uses narrow RPCs and removes the alternate event action", async () => {
  const [actions, csv, access] = await Promise.all([
    read("../lib/devices/actions.ts"),
    read("../lib/devices/csv-import.ts"),
    read("../lib/devices/access.ts")
  ]);

  for (const rpc of [
    "register_residence_device",
    "correct_residence_device_identity",
    "set_residence_device_return_deadline",
    "review_residence_device_notice"
  ]) {
    assert.match(actions, new RegExp(`rpc\\(\\s*"${rpc}"`));
  }
  assert.doesNotMatch(actions, /recordReturnEventAction/);
  assert.match(csv, /requireDeviceImportContext/);
  assert.match(access, /canImportDevices/);
  assert.match(access, /canAdministerDeviceRecords/);
});

test("new RPC execute privileges are explicit and never granted to anon", async () => {
  const sql = await read(migrationPath);

  for (const rpc of [
    "register_residence_device",
    "correct_residence_device_identity",
    "set_residence_device_return_deadline",
    "review_residence_device_notice"
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?from public, anon`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to authenticated`));
  }
  assert.doesNotMatch(sql, /grant execute[\s\S]*to anon/);
});
