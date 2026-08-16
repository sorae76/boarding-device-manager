import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../supabase/migrations/20260810000000_harden_dorm_staff_device_mutation_boundaries.sql",
  import.meta.url
);

test("atomic RPC preserves return/release and adds controlled missing transitions", async () => {
  const sql = await readFile(migration, "utf8");
  const rpc = sql.slice(
    sql.indexOf("create or replace function public.transition_residence_device_custody"),
    sql.indexOf("revoke all on function public.transition_residence_device_custody")
  );

  assert.match(rpc, /security definer/);
  assert.match(rpc, /set search_path = public, pg_temp/);
  assert.match(rpc, /where device\.school_id = target_school_id[\s\S]*device\.id = target_device_id[\s\S]*for update/);
  assert.match(rpc, /target_operation = 'return'[\s\S]*required_status := 'checked_out'[\s\S]*next_action := 'returned'/);
  assert.match(rpc, /target_operation = 'release'[\s\S]*required_status := 'returned'[\s\S]*next_action := 'checked_out'/);
  assert.match(rpc, /target_operation = 'mark_missing'[\s\S]*next_action := 'marked_missing'[\s\S]*next_status := 'lost'/);
  assert.match(rpc, /target_operation = 'recover_missing'[\s\S]*required_status := 'lost'[\s\S]*next_action := 'returned'/);
  assert.match(rpc, /target_device\.status not in \('checked_out', 'returned'\)[\s\S]*'stale_status'/);
  assert.match(rpc, /insert into public\.device_custody_events/);
  assert.doesNotMatch(rpc, /update public\.device_custody_devices set status/);
  assert.doesNotMatch(rpc, /update public\.device_custody_devices set status/);
});

test("RPC result is structured and preserves audit ownership", async () => {
  const sql = await readFile(migration, "utf8");
  const rpc = sql.slice(
    sql.indexOf("create or replace function public.transition_residence_device_custody"),
    sql.indexOf("revoke all on function public.transition_residence_device_custody")
  );

  for (const field of ["outcome text", "event_id uuid", "device_id uuid", "previous_status", "current_status", "performed_at timestamptz"]) {
    assert.match(rpc, new RegExp(field));
  }
  assert.match(rpc, /target_device\.school_id,[\s\S]*target_device\.id,[\s\S]*target_device\.student_id/);
  assert.match(rpc, /caller_id,[\s\S]*event_time,[\s\S]*normalized_notes/);
  assert.match(rpc, /'applied'::text/);
  assert.match(rpc, /'not_authorized'::text/);
  assert.match(rpc, /'not_available'::text/);
});

test("RPC rejects malformed input and does not trust client residence or user fields", async () => {
  const sql = await readFile(migration, "utf8");
  const signature = sql.slice(
    sql.indexOf("create or replace function public.transition_residence_device_custody"),
    sql.indexOf(")\nreturns table", sql.indexOf("create or replace function public.transition_residence_device_custody"))
  );

  assert.doesNotMatch(signature, /target_(?:dorm|residence|user|student)/);
  assert.match(sql, /caller_id uuid := auth\.uid\(\)/);
  assert.match(sql, /custody_transition_invalid_operation/);
  assert.match(sql, /custody_transition_invalid_method/);
  assert.match(sql, /custody_transition_notes_too_long/);
});
