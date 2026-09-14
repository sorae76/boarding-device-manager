// Synthetic component browser QA only. Serves the real TSX and real pure preview
// core, with an in-memory action transport. No Next auth or database credentials.
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { previewScheduleDraft, publicationIntervals } from "../lib/schedules/authoring.ts";

const school = "10000000-0000-0000-0000-000000000001", dorm = "20000000-0000-0000-0000-000000000001";
const state = { school_id: school, timezone: "America/New_York", today: "2030-01-01", observed_at: "2030-01-01T12:00:00Z",
  can_manage_school: true, residences: [{ id: dorm, name: "Synthetic residence" }], exceptions: [], intervals: [],
  scopes: [null,dorm].map((dorm_id) => ({ school_id: school, dorm_id, revision: "0", publications: [], ledger: [] })) };
const calls = [], requests = new Map();
let conflictOnce = false;
const ok = (value) => ({ ok: true, value });
async function action(name, args) {
  calls.push({ name, args });
  if (name === "loadScheduleAuthoring") return ok({ ...state, intervals: state.scopes.flatMap(publicationIntervals) });
  if (name === "previewSchedule") return ok(previewScheduleDraft(state, args[0]));
  if (name === "publishSchedule") {
    const d = args[0];
    if (conflictOnce) { conflictOnce = false; throw new Error("Schedule changed. Reload the scope and preview again; your draft is preserved."); }
    if (requests.has(d.idempotency_key)) return ok("Future schedule published.");
    if (state.timezone !== args[2] || previewScheduleDraft(state,d).fingerprint !== args[1]) throw new Error("Preview changed.");
    const scope = state.scopes.find((s) => s.dorm_id === d.dorm_id), id = randomUUID();
    scope.revision = String(Number(scope.revision) + 1);
    scope.publications.push({ id, school_id: school, dorm_id: d.dorm_id, scope_revision: scope.revision, policy_id: randomUUID(), name: d.name,
      predecessor_publication_id: d.predecessor_id, replaces_publication_id: d.replaces_id, timezone_snapshot: state.timezone,
      effective_from: d.effective_from, declared_effective_to: d.effective_to, is_active: true, events: d.events.map((e) => ({ ...e, id: randomUUID() })) });
    scope.ledger.push({ id: randomUUID(), school_id: school, dorm_id: d.dorm_id, scope_revision: scope.revision,
      operation: d.replaces_id ? "replace" : "publish", publication_id: id, predecessor_publication_id: d.predecessor_id, replaced_publication_id: d.replaces_id, cutover_date: d.effective_from });
    requests.set(d.idempotency_key, id); return ok("Future schedule published.");
  }
  if (name === "cancelSchedule") {
    const [dormId,id,revision] = args; const scope = state.scopes.find((s) => s.dorm_id === dormId);
    if (scope.revision !== revision) throw new Error("stale_revision");
    const p = scope.publications.find((p) => p.id === id); scope.revision = String(Number(revision) + 1);
    scope.ledger.push({ id: randomUUID(), school_id: school, dorm_id: dormId, scope_revision: scope.revision, operation: "cancel",
      publication_id: null, predecessor_publication_id: p.predecessor_publication_id, replaced_publication_id: id, cutover_date: p.effective_from });
    return ok("Future publication cancelled.");
  }
  if (name === "searchExceptionTargets") return ok([{ id: dorm, label: `Synthetic ${args[0]} target` }]);
  if (name === "createAllowException") {
    const i = args[0];
    state.exceptions.push({ id: randomUUID(), school_id: school, effect: "allow", device_id: i.kind === "device" ? i.target : null,
      student_id: i.kind === "student" ? i.target : null, dorm_id: i.kind === "residence" ? i.target : null, start_at: i.start, end_at: i.end,
      reason: i.reason, created_by_user_id: "synthetic-actor", created_at: state.observed_at, revoked_at: null, revoked_by_user_id: null, revoke_reason: null });
    return ok("Allow exception created.");
  }
  if (name === "revokeAllowException") {
    const e = state.exceptions.find((e) => e.id === args[0]);
    e.revoked_at = state.observed_at; e.revoked_by_user_id = "synthetic-actor"; e.revoke_reason = args[1];
    return ok("Allow exception revoked from the recorded server time.");
  }
  throw new Error("Unknown synthetic action");
}
const component = ts.transpileModule(readFileSync(new URL("../app/app/settings/schedules/schedule-authoring.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
}).outputText;
const css = readdirSync(new URL("../.next/static/css/", import.meta.url)).filter((n) => n.endsWith(".css"))
  .map((n) => readFileSync(new URL(`../.next/static/css/${n}`, import.meta.url), "utf8")).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G1-C synthetic browser QA</title><style>${css}</style></head>
<body class="bg-neutral-100"><main class="mx-auto max-w-5xl p-5"><p class="mb-5">Synthetic QA · no Production connection</p><div id="root"></div></main>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
window.__errors=[]; window.addEventListener('error', e=>window.__errors.push(e.message));
const actions=new Proxy({}, {get:(_,name)=>(...args)=>fetch('/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,args})}).then(r=>r.json())});
const exports={}; const require=(name)=>name==='react'?React:name==='next/navigation'?{useRouter:()=>({refresh(){}})}:actions;
${component}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(exports.default));
</script></body></html>`;
createServer(async (req,res) => {
  if (req.url === "/react.js" || req.url === "/react-dom.js") {
    res.setHeader("content-type","text/javascript"); res.end(readFileSync(new URL(req.url === "/react.js" ? "../node_modules/react/umd/react.development.js" : "../node_modules/react-dom/umd/react-dom.development.js",import.meta.url))); return;
  }
  if (req.url === "/calls") { res.setHeader("content-type","application/json"); res.end(JSON.stringify(calls)); return; }
  if (req.url === "/conflict") { conflictOnce = true; res.end("armed"); return; }
  // Test-only context change on this loopback synthetic server.
  if (req.url === "/timezone-los-angeles" && req.method === "POST") {
    state.timezone = "America/Los_Angeles"; res.end("timezone changed"); return;
  }
  if (req.url === "/action" && req.method === "POST") {
    let body=""; for await (const chunk of req) body+=chunk;
    res.setHeader("content-type","application/json");
    try { const {name,args}=JSON.parse(body); res.end(JSON.stringify(await action(name,args))); }
    catch(e) { res.end(JSON.stringify({ok:false,message:e.message})); } return;
  }
  res.setHeader("content-type","text/html"); res.end(html);
}).listen(4175,"127.0.0.1",()=>process.stdout.write("G1-C synthetic component QA: http://127.0.0.1:4175\n"));
