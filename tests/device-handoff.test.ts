import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

// Execute the actual modules; only the session, transport and Next UI are substituted.
function moduleAt(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, exports);
  return exports;
}
const context = { effectiveRole: "school_admin", currentSchool: { id: "school-a" } };
const id = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;
const row = (n: number, status = "checked_out", school = "school-a") => ({
  id: id(n), school_id: school, status, updated_at: "2030-01-01T00:00:00Z",
  students: [{ id: "student-a", status: "inactive", first_name: "Synthetic", last_name: "Student" }]
});
function transport(rows: ReturnType<typeof row>[], cap = 100, failAt = 0, stalled = false) {
  let calls = 0;
  const client = { from(table: string) {
    assert.equal(table, "device_custody_devices");
    let school = "", after = "", statuses: string[] = [], limit = 0;
    const query = {
      select() { return query; },
      eq(key: string, value: string) { assert.equal(key, "school_id"); school = value; return query; },
      in(key: string, values: string[]) { assert.equal(key, "status"); statuses = values; return query; },
      order(key: string, options: { ascending: boolean }) { assert.equal(key, "id"); assert.equal(options.ascending, true); return query; },
      limit(value: number) { assert.equal(value, 100); limit = value; return query; },
      gt(key: string, value: string) { assert.equal(key, "id"); after = value; return query; },
      then(resolve: (value: unknown) => unknown) {
        calls++;
        return Promise.resolve(resolve(calls === failAt ? { data: null, error: { message: "synthetic failure" } } : {
          error: null, data: rows.filter(r => r.school_id === school && statuses.includes(r.status) && (stalled || r.id > after))
            .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, limit))
        }));
      }
    };
    return query;
  } };
  const data = moduleAt("../lib/devices/data.ts", { "@/lib/supabase/server": { createClient: () => client } });
  return { list: () => data.listDevices(context, { attention: "handoff", status: "returned" }), calls: () => calls };
}

test("handoff includes every non-returned state, same-student devices and inactive students, with school restriction", async () => {
  const fixture = transport([row(1), row(2, "lost"), row(3, "inactive"), row(4, "returned"), row(5, "lost", "school-b")]);
  const result = await fixture.list();
  assert.deepEqual(result.map((r: any) => r.id), [id(1), id(2), id(3)]);
  assert.equal(result[0].students.status, "inactive");
  assert.equal(fixture.calls(), 2);
});
test("handoff reaches beyond 1000 rows despite short server batches and identical update timestamps", async () => {
  const rows = Array.from({ length: 1207 }, (_, n) => row(n + 1));
  const fixture = transport(rows.reverse(), 37);
  const result = await fixture.list();
  assert.equal(result.length, 1207);
  assert.equal(new Set(result.map((r: any) => r.id)).size, 1207);
  assert.equal(result.at(-1).id, id(1207));
  assert.equal(fixture.calls(), Math.ceil(1207 / 37) + 1);
});
test("handoff rejects mid-stream failures and non-advancing batches instead of returning partial results", async () => {
  await assert.rejects(transport([row(1), row(2)], 1, 2).list(), /complete handoff/);
  await assert.rejects(transport([row(1)], 1, 0, true).list(), /complete handoff/);
  assert.deepEqual(await transport([]).list(), []);
});

function accessFor(role: string) {
  return moduleAt("../lib/devices/access.ts", {
    "next/navigation": { notFound() { throw new Error("denied"); } },
    "@/lib/auth/session": { async requireSessionContext() { return { ...context, effectiveRole: role }; } }
  });
}
test("Registry access preserves existing role matrix including supervisor denial", async () => {
  for (const role of ["super_admin", "school_admin", "dorm_staff"]) {
    assert.equal((await accessFor(role).requireDeviceWorkflowContext()).effectiveRole, role);
  }
  for (const role of ["dorm_supervisor", "viewer", "student", "parent", "user"]) {
    await assert.rejects(accessFor(role).requireDeviceWorkflowContext(), /denied/);
  }
});
test("rendered Registry preserves attention precedence, handoff explanation, empty state and failure propagation", async () => {
  let filter: any;
  let fail = false;
  const page = moduleAt("../app/app/devices/page.tsx", {
    "react/jsx-runtime": jsx,
    "next/link": { default: (props: any) => jsx.jsx("a", props) },
    "@/lib/devices/access": accessFor("school_admin"),
    "@/lib/devices/data": {
      async listDevices(_context: unknown, value: unknown) { filter = value; if (fail) throw new Error("query failed"); return []; },
      async listPendingDeviceRegistrations() { return []; }, async listStudentDeviceIssuesForStaff() { return []; }
    },
    "@/lib/devices/format": {}
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: { attention: ["handoff", "overdue"], status: "returned" } }));
  assert.deepEqual(filter, { attention: "handoff" });
  assert.match(html, /No non-returned devices in your authorized scope/);
  assert.match(html, /not as a frozen audit snapshot/);
  assert.match(html, /Refresh/);
  assert.match(html, /attention=handoff/);
  await page({ searchParams: { attention: "overdue", status: "lost" } });
  assert.deepEqual(filter, { attention: "overdue" });
  await page({ searchParams: { attention: "unknown", status: "lost" } });
  assert.deepEqual(filter, { status: "lost" });
  fail = true;
  await assert.rejects(page({ searchParams: { attention: "handoff" } }), /query failed/);
});
