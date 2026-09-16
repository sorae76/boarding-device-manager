import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const school = "10000000-0000-0000-0000-000000000001";
const student = "40000000-0000-0000-0000-000000000001";
const device = "50000000-0000-4000-8000-000000000001";
const request = "60000000-0000-4000-8000-000000000001";
function form(values: Record<string, string>) {
  const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result;
}
function harness(role = "school_admin", portalAllowed = true) {
  const calls: { name: string; args: any }[] = [];
  const students: any[] = [];
  const devices: any[] = [];
  let outcome = "applied";
  const context = { effectiveRole: role, currentSchool: { id: school }, authUser: { id: "actor" },
    currentMembership: { role, school_id: school, is_active: true } };
  const deps: Record<string, any> = {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { notFound() { throw new Error("denied"); }, redirect(url: string) { throw new Error(`redirect:${url}`); } },
    "@/lib/auth/session": { async requireSessionContext() { return context; } },
    "@/lib/students/portal": { async requireStudentPortalContext() { if (!portalAllowed) throw new Error("denied"); return context; } },
    "@/lib/devices/data": { async listStudents() { return students; }, async listDevices() { return devices; } },
    "@/lib/supabase/server": { createClient() { return {
      async rpc(name: string, args: any) {
        calls.push({ name, args });
        if (name === "create_student_admin") students.push({ id: student, student_number: args.target_student_number, first_name: args.target_first_name, last_name: args.target_last_name });
        return { error: null, data: name === "transition_residence_device_custody" ? [{ outcome, device_id: device, previous_status: "checked_out", current_status: "returned" }] : device };
      },
      from(table: string) { return { async insert(rows: any[]) {
        assert.equal(table, "device_custody_devices"); calls.push({ name: "insert_devices", args: rows }); devices.push(...rows); return { error: null };
      } }; }
    }; } }
  };
  function load(name: string): any {
    if (name in deps) return deps[name];
    assert.ok(name.startsWith("@/lib/"), `Unexpected module ${name}`);
    const code = ts.transpileModule(readFileSync(new URL(`../${name.slice(2)}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const exports = {}; deps[name] = exports;
    new Function("require", "exports", code)(load, exports); return exports;
  }
  return { load, calls, setOutcome(value: string) { outcome = value; } };
}
const studentForm = () => form({ firstName: "Synthetic", lastName: "Student", studentNumber: "P001", status: "active" });
const deviceForm = () => form({ studentId: student, deviceType: "phone", manufacturer: "Example", model: "Test phone", color: "Black", status: "checked_out" });
const csvText = "student_first_name,student_last_name,student_number,device_type,manufacturer,model,color,asset_tag,serial_number,status,return_due_at,notes\nSynthetic,Student,P001,phone,Example,Test phone,Black,P001-01,,checked_out,,\nUnknown,Student,UNKNOWN,phone,Example,Other,White,P002-01,,checked_out,,";

test("Path A uses existing student setup then actual device CSV preview/import and rejects unmatched students", async () => {
  const h = harness();
  assert.equal((await h.load("@/lib/students/actions").saveStudentAction({}, studentForm())).status, "success");
  const csv = h.load("@/lib/devices/csv-import");
  const preview = await csv.previewDeviceCsvImport(new File([csvText], "synthetic.csv"));
  assert.deepEqual(preview.rows.map((r: any) => r.validation), ["valid", "error"]);
  const result = await csv.importValidDeviceCsvRows(preview.rawRowsJson);
  assert.match(result.summary, /1 valid rows/);
  assert.equal(h.calls[0].name, "create_student_admin");
  const inserted = h.calls.find(c => c.name === "insert_devices")!.args;
  assert.equal(inserted.length, 1); assert.equal(inserted[0].student_id, student);
  assert.equal(inserted[0].school_id, school); assert.equal(inserted[0].created_by_user_id, "actor");
  assert.equal(inserted[0].status, "checked_out");
  const replay = await csv.importValidDeviceCsvRows(preview.rawRowsJson);
  assert.match(replay.summary, /No valid rows/);
});
test("Path A denies device import to dorm staff, supervisor, viewer and student", async () => {
  for (const role of ["dorm_staff", "dorm_supervisor", "viewer", "student"]) {
    const h = harness(role);
    await assert.rejects(h.load("@/lib/devices/csv-import").previewDeviceCsvImport(new File([csvText], "synthetic.csv")), /denied/);
    await assert.rejects(h.load("@/lib/devices/csv-import").importValidDeviceCsvRows("[]"), /denied/);
    assert.equal(h.calls.length, 0);
  }
});
test("Path B keeps serial requirement and portal boundary, then submits via existing RPC", async () => {
  const h = harness("student"); const action = h.load("@/lib/students/device-registration-actions").submitStudentDeviceRegistrationAction;
  const input = deviceForm();
  assert.match((await action({}, input)).message, /Serial number is required/);
  assert.equal(h.calls.length, 0);
  input.set("serialNumber", "SYNTHETIC-001"); input.set("schoolId", "forged");
  assert.equal((await action({}, input)).status, "success");
  assert.equal(h.calls[0].name, "submit_current_student_device_registration");
  assert.equal(h.calls[0].args.target_serial_number, "SYNTHETIC-001");
  assert.equal(h.calls[0].args.target_school_id, undefined);
  const denied = harness("student", false);
  assert.equal((await denied.load("@/lib/students/device-registration-actions").submitStudentDeviceRegistrationAction({}, input)).status, "error");
  assert.equal(denied.calls.length, 0);
});
test("Path B approval/rejection bind school to session and preserve supervisor denial", async () => {
  for (const role of ["school_admin", "dorm_staff"]) {
    const h = harness(role); const actions = h.load("@/lib/devices/registration-review-actions");
    const input = form({ requestId: request, reviewNote: "Synthetic review", schoolId: "forged" });
    await assert.rejects(actions.approveStudentDeviceRegistrationAction({}, input), /redirect:/);
    await assert.rejects(actions.rejectStudentDeviceRegistrationAction({}, input), /redirect:/);
    assert.deepEqual(h.calls.map(c => c.name), ["approve_student_device_registration_request", "reject_student_device_registration_request"]);
    assert.ok(h.calls.every(c => c.args.target_school_id === school));
  }
  const denied = harness("dorm_supervisor");
  await assert.rejects(denied.load("@/lib/devices/registration-review-actions").approveStudentDeviceRegistrationAction({}, form({ requestId: request })), /denied/);
  assert.equal(denied.calls.length, 0);
});
test("first capture permits no serial, then records Return only through the existing custody transition", async () => {
  const h = harness("dorm_staff"); const actions = h.load("@/lib/devices/actions");
  await assert.rejects(actions.saveDeviceAction(deviceForm()), /redirect:/);
  assert.equal(h.calls[0].name, "register_residence_device");
  assert.equal(h.calls[0].args.target_serial_number, null);
  assert.equal(h.calls[0].args.target_initial_status, "checked_out");
  assert.equal(h.calls[0].args.target_school_id, undefined);
  assert.equal((await actions.rapidScanTransitionAction({ deviceId: device, operation: "return" })).status, "applied");
  assert.equal(h.calls[1].name, "transition_residence_device_custody");
  assert.equal(h.calls[1].args.target_school_id, school);
  h.setOutcome("stale_status");
  assert.equal((await actions.rapidScanTransitionAction({ deviceId: device, operation: "return" })).status, "stale_status");
  h.setOutcome("not_authorized");
  assert.equal((await actions.rapidScanTransitionAction({ deviceId: device, operation: "return" })).status, "unavailable");
});
