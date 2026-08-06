import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../supabase/migrations/20260806000000_add_student_device_issue_requests.sql", import.meta.url);
const readSql = () => readFile(migration, "utf8");

test("issue request schema has lifecycle, ownership, uniqueness, and no direct access", async () => {
  const sql = await readSql();
  for (const values of ["'lost', 'broken', 'disposal'", "'pending', 'approved', 'rejected'", "'lost_marked_missing', 'broken_exception', 'disposal_inactivated'"])
    assert.ok(sql.includes(values));
  assert.match(sql, /foreign key \(school_id, student_id\) references public\.students\(school_id, id\)/);
  assert.match(sql, /foreign key \(school_id, applied_event_id\) references public\.device_custody_events\(school_id, id\)/);
  assert.match(sql, /unique \(school_id, id, student_id\)/);
  assert.match(sql, /foreign key \(school_id, device_id, student_id\)[\s\S]*references public\.device_custody_devices\(school_id, id, student_id\)/);
  assert.match(sql, /unique index student_device_issue_one_pending_type_idx[\s\S]*\(school_id, device_id, request_type\)[\s\S]*where status = 'pending'/);
  assert.match(sql, /unique index student_device_issue_applied_event_unique_idx[\s\S]*\(school_id, applied_event_id\)[\s\S]*where applied_event_id is not null/);
  assert.match(sql, /status = 'pending'[\s\S]*status = 'rejected'[\s\S]*status = 'approved'/);
  assert.match(sql, /constraint student_device_issue_approved_note_required check \([\s\S]*status <> 'approved' or request_type = 'lost' or review_note is not null/);
  for (const role of ["public", "anon", "authenticated"])
    assert.match(sql, new RegExp(`revoke all privileges on table public\\.student_device_issue_requests from ${role}`));
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete)[^;]*student_device_issue_requests/);
});

test("all issue RPCs are security definer with safe paths and helper is private", async () => {
  const sql = await readSql();
  const rpcNames = ["submit_current_student_device_issue", "list_current_student_device_issue_requests", "can_review_student_device_issue", "list_student_device_issue_requests_for_staff", "get_student_device_issue_request_for_staff", "approve_student_device_issue_request", "reject_student_device_issue_request", "get_device_pass_by_qr_token"];
  for (const name of rpcNames) {
    const start = sql.indexOf(`create or replace function public.${name}`);
    const body = sql.slice(start, sql.indexOf("$$;", start) + 3);
    assert.match(body, /security definer/); assert.match(body, /set search_path = public, pg_temp/);
  }
  assert.match(sql, /revoke all on function public\.can_review_student_device_issue\([^;]+\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.can_review_student_device_issue/);
  assert.match(sql, /revoke all on function public\.get_device_pass_by_qr_token\(uuid\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.get_device_pass_by_qr_token\(uuid\) to anon, authenticated;/);
});

test("student identity, operational ownership, and staff scope stay server-derived", async () => {
  const sql = await readSql();
  const submit = sql.slice(sql.indexOf("create or replace function public.submit_"), sql.indexOf("create or replace function public.list_current_"));
  assert.match(submit, /s\.auth_user_id = au\.id/); assert.match(submit, /au\.id = auth\.uid\(\)/);
  assert.match(submit, /d\.student_id = current_student\.id/); assert.match(submit, /d\.status in \('checked_out', 'returned'\)/);
  assert.doesNotMatch(submit, /insert into public\.device_custody_events/); assert.doesNotMatch(submit, /update public\.device_custody_devices/);
  assert.match(sql, /dorm_staff_membership\.role = 'dorm_staff'/); assert.match(sql, /residence\.is_active = true/);
  assert.match(sql, /public\.has_dorm_access\(target_school_id, residence\.id\)/);
  assert.doesNotMatch(sql, /'dorm_supervisor'/); assert.match(sql, /target_request_type in \('lost', 'broken'\)/);
  assert.match(sql, /public\.is_super_admin\(\) and public\.has_active_school_membership\(target_school_id\)/);
});

test("student list returns only explicit safe portal fields", async () => {
  const sql = await readSql();
  const studentList = sql.slice(sql.indexOf("create or replace function public.list_current_student_device_issue_requests"), sql.indexOf("create or replace function public.can_review_student_device_issue"));
  assert.match(studentList, /returns table \([\s\S]*request_id uuid[\s\S]*device_id uuid[\s\S]*device_type public\.device_type[\s\S]*manufacturer text[\s\S]*model text[\s\S]*color text[\s\S]*serial_number text[\s\S]*asset_tag text[\s\S]*request_type public\.student_device_issue_type[\s\S]*student_reason text[\s\S]*status public\.student_device_issue_status[\s\S]*submitted_at timestamptz[\s\S]*reviewed_at timestamptz[\s\S]*review_note text[\s\S]*resolution public\.student_device_issue_resolution/);
  assert.doesNotMatch(studentList, /returns setof public\.student_device_issue_requests|select r\.\*/);
  const declaration = studentList.slice(studentList.indexOf("returns table"), studentList.indexOf(")\nlanguage sql"));
  for (const field of ["school_id", "student_id", "submitted_by_user_id", "reviewed_by_user_id", "applied_event_id", "device_status_before", "device_status_after", "created_at", "updated_at", "qr_token"])
    assert.equal(declaration.includes(field), false);
  assert.match(studentList, /join public\.device_custody_devices d[\s\S]*d\.student_id = r\.student_id/);
});

test("staff list and detail return complete joined review data within helper scope", async () => {
  const sql = await readSql();
  const list = sql.slice(sql.indexOf("create or replace function public.list_student_device_issue_requests_for_staff"), sql.indexOf("create or replace function public.get_student_device_issue_request_for_staff"));
  const detail = sql.slice(sql.indexOf("create or replace function public.get_student_device_issue_request_for_staff"), sql.indexOf("create or replace function public.approve_student_device_issue_request"));
  for (const rpc of [list, detail]) {
    assert.match(rpc, /returns table \(/);
    assert.doesNotMatch(rpc, /returns setof public\.student_device_issue_requests|select r\.\*|qr_token/);
    for (const field of ["request_id", "student_id", "student_name", "student_number", "residence_name", "device_id", "device_type", "manufacturer", "model", "color", "serial_number", "asset_tag", "current_custody_status", "device_status_at_submission", "request_type", "student_reason", "status", "submitted_at", "reviewed_at", "review_note", "resolution"])
      assert.match(rpc, new RegExp(`${field} (?:uuid|text|public\\.[a-z_]+|timestamptz)`));
    assert.match(rpc, /join public\.students s/); assert.match(rpc, /left join public\.dorms residence/);
    assert.match(rpc, /join public\.device_custody_devices d/);
    assert.match(rpc, /public\.can_review_student_device_issue\(r\.school_id, r\.student_id, r\.request_type\)/);
  }
});

test("approval locks and applies each device outcome exactly once", async () => {
  const sql = await readSql();
  const approve = sql.slice(sql.indexOf("create or replace function public.approve_"), sql.indexOf("create or replace function public.reject_"));
  assert.equal((approve.match(/for update/g) ?? []).length, 2); assert.match(approve, /pg_advisory_xact_lock/);
  assert.match(approve, /issue\.status = 'approved' then return issue\.applied_event_id/);
  assert.match(approve, /issue\.status = 'rejected'.*already_rejected/);
  assert.match(approve, /issue\.request_type in \('broken', 'disposal'\) and normalized_note is null[\s\S]*device_issue_review_note_required/);
  assert.match(approve, /'marked_missing', 'manual'/); assert.match(approve, /new_status := 'lost'/);
  assert.match(approve, /'broken'[\s\S]*new_status := device\.status[\s\S]*'exception', 'manual'/);
  assert.match(approve, /device\.status <> 'returned'/); assert.match(approve, /set status = 'inactive'/);
  assert.match(approve, /qr_revoked_at = now\(\)[\s\S]*qr_revocation_reason = normalized_note/);
  assert.doesNotMatch(approve, /set qr_token/);
});

test("rejection is idempotent and public device pass excludes revoked tokens", async () => {
  const sql = await readSql();
  const reject = sql.slice(sql.indexOf("create or replace function public.reject_"), sql.indexOf("-- Replace the public pass"));
  assert.match(reject, /normalized_note is null/); assert.match(reject, /issue\.status = 'approved'.*already_approved/);
  assert.match(reject, /issue\.status = 'rejected' then return/);
  assert.doesNotMatch(reject, /device_custody_events|device_custody_devices/);
  assert.match(sql, /where d\.qr_token = target_qr_token and d\.qr_revoked_at is null/);
});
