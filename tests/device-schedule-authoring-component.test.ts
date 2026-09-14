import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";
// @ts-expect-error Native Node test runner requires the source extension.
import { previewScheduleDraft } from "../lib/schedules/authoring.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../app/app/settings/schedules/schedule-authoring.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
}).outputText;

// Execute the real component handlers with persistent hooks and an isolated action transport.
function harness() {
  const school = "10000000-0000-0000-0000-000000000001";
  const snapshot = { school_id: school, timezone: "America/New_York", today: "2030-01-01", observed_at: "2030-01-01T12:00:00Z",
    can_manage_school: true, residences: [], exceptions: [], intervals: [],
    scopes: [{ school_id: school, dorm_id: null, revision: "0", publications: [], ledger: [] }] };
  const states: any[] = [], refs: any[] = [], publications: any[][] = [];
  let stateIndex = 0, refIndex = 0;
  const hooks = { ...React,
    useState(initial: any) { const i = stateIndex++; if (!(i in states)) states[i] = initial;
      return [states[i], (next: any) => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; },
    useRef(initial: any) { const i = refIndex++; return refs[i] ??= { current: initial }; }
  };
  const actions = {
    async loadScheduleAuthoring() { return { ok: true, value: structuredClone(snapshot) }; },
    async previewSchedule(draft: any) { return { ok: true, value: previewScheduleDraft(snapshot, draft) }; },
    async publishSchedule(...args: any[]) { publications.push(args); return { ok: true, value: "Published" }; }
  };
  const exports: any = {};
  new Function("require", "exports", "React", compiled)((name: string) => name === "react" ? hooks :
    name === "next/navigation" ? { useRouter: () => ({ refresh() {} }) } : actions, exports, React);
  const render = () => { stateIndex = 0; refIndex = 0; return exports.default(); };
  const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) :
    node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") :
    node && typeof node === "object" ? text(node.props?.children) : node == null || typeof node === "boolean" ? "" : String(node);
  const button = (name: string) => nodes(render()).find((n) => n.type === "button" && text(n) === name);
  const click = async (name: string) => { const b = button(name); assert.ok(b, `Missing button: ${name}`); await b.props.onClick(); };
  const edit = (label: string, value: string) => {
    const l = nodes(render()).find((n) => n.type === "label" && text(n).startsWith(label));
    const input = nodes(l).find((n) => n.type === "input"); assert.ok(input); input.props.onChange({ target: { value } });
  };
  return { snapshot, publications, render, nodes, text, button, click, edit,
    inputs: () => nodes(render()).filter((n) => n.type === "input" || n.type === "select").map((n) => n.props.value) };
}

test("G1-C timezone-changing preview preserves draft, blocks stale publication, and requires reload/re-preview", async () => {
  const h = harness();
  await h.click("Open authoring");
  h.edit("Schedule name", "Preserved timezone draft");
  h.edit("Effective from", "2030-01-07");
  h.edit("Last effective date", "2030-01-14");
  const before = h.inputs();
  assert.match(h.text(h.render()), /Times use America\/New_York/);
  await h.click("Preview on server");
  assert.ok(h.button("Publish future schedule"));

  h.snapshot.timezone = "America/Los_Angeles";
  await h.click("Preview on server");
  assert.deepEqual(h.inputs(), before);
  assert.equal(h.button("Publish future schedule"), undefined);
  assert.match(h.text(h.render()), /timezone changed.*Reload.*preview again/i);
  assert.equal(h.publications.length, 0);
  // Repeating preview without reloading must not silently accept the new context.
  await h.click("Preview on server");
  assert.equal(h.button("Publish future schedule"), undefined);

  await h.click("Reload scope / resolve conflict");
  assert.deepEqual(h.inputs(), before);
  assert.match(h.text(h.render()), /Times use America\/Los_Angeles/);
  assert.equal(h.button("Publish future schedule"), undefined);
  await h.click("Preview on server");
  const displayed = h.text(h.render());
  assert.doesNotMatch(displayed, /America\/New_York| EST| EDT/);
  const firstLocal = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "long" })
    .format(new Date("2030-01-07T08:00:00Z"));
  assert.ok(displayed.includes(firstLocal));
  assert.ok(h.button("Publish future schedule"));
  await h.click("Publish future schedule");
  assert.equal(h.publications.length, 1);
  assert.equal(h.publications[0][2], "America/Los_Angeles");
  assert.equal(h.publications[0][0].name, "Preserved timezone draft");
});
