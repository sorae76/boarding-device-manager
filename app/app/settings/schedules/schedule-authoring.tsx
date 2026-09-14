"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSchedule, createAllowException, loadScheduleAuthoring, previewSchedule, publishSchedule, revokeAllowException, searchExceptionTargets } from "@/lib/schedules/actions";
import type { ActionResult, AuthoringSnapshot, DraftPreview, ScheduleDraft } from "@/lib/schedules/authoring-types";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const field = "rounded border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";
function local(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "long" }).format(new Date(value));
}
function chain(snapshot: AuthoringSnapshot, dorm: string | null) {
  const scope = snapshot.scopes.find((s) => s.dorm_id === dorm);
  const removed = new Set(scope?.ledger.map((l) => l.replaced_publication_id));
  return scope?.publications.filter((p) => !removed.has(p.id)).sort((a, b) => a.effective_from.localeCompare(b.effective_from)) ?? [];
}

export default function ScheduleAuthoring() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AuthoringSnapshot | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cancelKeys = useRef(new Map<string, string>());
  const [kind, setKind] = useState<"device" | "student" | "residence">("student");
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<{ id: string; label: string }[]>([]);
  const [target, setTarget] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const exceptionKey = useRef("");
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});

  async function run<T>(work: () => Promise<ActionResult<T>>, success: (value: T) => void | Promise<void>) {
    setBusy(true); setMessage("");
    try { const result = await work(); if (result.ok) await success(result.value); else setMessage(result.message); }
    catch { setMessage("Connection interrupted. Retry the unchanged request to recover its result."); }
    finally { setBusy(false); }
  }
  async function refresh(resetDraft = false) {
    const result = await loadScheduleAuthoring();
    if (result.ok) { setSnapshot(result.value); if (resetDraft && draft) selectScope(result.value, draft.dorm_id, true); router.refresh(); }
    else setMessage(result.message);
  }
  function selectScope(data: AuthoringSnapshot, dorm: string | null, preserve = false) {
    const tail = chain(data, dorm).at(-1);
    setDraft({ dorm_id: dorm, name: preserve && draft ? draft.name : "", effective_from: preserve && draft ? draft.effective_from : "",
      effective_to: preserve && draft ? draft.effective_to : null, expected_revision: data.scopes.find((s) => s.dorm_id === dorm)?.revision ?? "0",
      predecessor_id: tail?.id ?? null, replaces_id: null, idempotency_key: crypto.randomUUID(),
      events: preserve && draft ? draft.events : days.flatMap((_, weekday) => [
        { weekday, local_time: "07:00", event_type: "release" as const }, { weekday, local_time: "21:00", event_type: "return" as const }
      ]) });
    setPreview(null);
  }
  function edit(change: Partial<ScheduleDraft>) {
    if (draft) setDraft({ ...draft, ...change, idempotency_key: crypto.randomUUID() });
    setPreview(null);
  }
  function editException() { exceptionKey.current = ""; }
  const scopeChain = snapshot && draft ? chain(snapshot, draft.dorm_id) : [];
  const tail = scopeChain.at(-1);

  return <section className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5">
    <h2 className="text-xl font-semibold">Schedule authoring &amp; allow exceptions</h2>
    <p className="text-sm text-neutral-600">Drafts stay in this open page. Publication starts at a future school-local midnight. Published content is immutable; changes require a new version. Schedules and exceptions never change physical custody.</p>
    <p aria-live="polite" role="status" className="text-sm font-medium">{busy ? "Working…" : message}</p>
    {!snapshot ? <button className={button} disabled={busy} onClick={() => run(loadScheduleAuthoring, (data) => {
      setSnapshot(data); const dorm = data.can_manage_school ? null : data.residences[0]?.id;
      if (dorm !== undefined) selectScope(data, dorm);
    })}>Open authoring</button> : <fieldset disabled={busy} className="space-y-8">
      <legend className="text-sm">School timezone: <strong>{snapshot.timezone}</strong> · School date: {snapshot.today}</legend>
      {draft ? <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">Schedule scope<select className={field} value={draft.dorm_id ?? ""} onChange={(e) => selectScope(snapshot, e.target.value || null)}>
            {snapshot.can_manage_school && <option value="">School-wide</option>}
            {snapshot.residences.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>
          <span className="text-sm">Expected revision: {draft.expected_revision}</span>
          <button className={button} onClick={() => run(loadScheduleAuthoring, (data) => { setSnapshot(data); selectScope(data, draft.dorm_id, true); setMessage("Scope refreshed; draft retained. Check the successor and preview again."); })}>Reload scope / resolve conflict</button>
        </div>
        <h3 className="font-semibold">Published timeline</h3>
        {!scopeChain.length && <p className="text-sm">No published schedule in this scope.</p>}
        {scopeChain.map((p) => {
          const interval = snapshot.intervals.find((i) => i.id === p.id);
          return <article className="rounded border p-3 text-sm" key={p.id}>
            <strong>{p.name}</strong> · revision {p.scope_revision} · {p.timezone_snapshot}
            <p>Effective UTC: [{interval?.start}, {interval?.end ?? "open-ended"})</p>
            {interval && <p>Local: {local(interval.start, interval.timezone)} → {interval.end ? local(interval.end, interval.timezone) : "open-ended"}</p>}
            {p.id === tail?.id && p.effective_from > snapshot.today && <div className="mt-2 flex flex-wrap gap-2">
              <button className={button} onClick={() => edit({ name: p.name, events: p.events.map(({ weekday, local_time, event_type }) => ({ weekday, local_time, event_type })),
                effective_from: p.effective_from, effective_to: p.declared_effective_to, predecessor_id: p.predecessor_publication_id, replaces_id: p.id })}>Draft replacement</button>
              <button className={button} onClick={() => run(() => {
                const key = `${p.id}:${draft.expected_revision}`;
                if (!cancelKeys.current.has(key)) cancelKeys.current.set(key, crypto.randomUUID());
                return cancelSchedule(draft.dorm_id, p.id, draft.expected_revision, cancelKeys.current.get(key)!);
              }, async (text) => { setMessage(text); setPreview(null); await refresh(true); })}>Cancel future publication</button>
            </div>}
          </article>;
        })}
        <p className="text-sm">{draft.replaces_id ? "Replacing the selected future version." : tail ? "Publishing a future successor to the latest version." : "Publishing the first version."}</p>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm">Schedule name<input className={field} maxLength={200} value={draft.name} onChange={(e) => edit({ name: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Effective from (school date)<input className={field} type="date" value={draft.effective_from} onChange={(e) => edit({ effective_from: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Last effective date (optional, inclusive)<input className={field} type="date" value={draft.effective_to ?? ""} onChange={(e) => edit({ effective_to: e.target.value || null })} /></label>
        </div>
        <h3 className="font-semibold">Weekly Release / Return draft</h3>
        <p className="text-sm text-neutral-600">Monday starts the weekly cycle. Return and Release must alternate around the whole week. Times use {snapshot.timezone}.</p>
        <div className="space-y-2">{draft.events.map((event, i) => <div key={i} className="flex flex-wrap gap-2">
          <select aria-label={`Event ${i + 1} weekday`} className={field} value={event.weekday} onChange={(e) => edit({ events: draft.events.map((v, n) => n === i ? { ...v, weekday: Number(e.target.value) } : v) })}>{days.map((day, n) => <option value={n} key={day}>{day}</option>)}</select>
          <select aria-label={`Event ${i + 1} type`} className={field} value={event.event_type} onChange={(e) => edit({ events: draft.events.map((v, n) => n === i ? { ...v, event_type: e.target.value as "release" | "return" } : v) })}><option value="release">Release</option><option value="return">Return</option></select>
          <input aria-label={`Event ${i + 1} local time`} className={field} type="time" step="1" value={event.local_time} onChange={(e) => edit({ events: draft.events.map((v, n) => n === i ? { ...v, local_time: e.target.value } : v) })} />
          <button className={field} onClick={() => edit({ events: draft.events.filter((_, n) => n !== i) })}>Remove event {i + 1}</button>
        </div>)}</div>
        <button className={field} onClick={() => edit({ events: [...draft.events, { weekday: 0, local_time: "12:00", event_type: "release" }] })}>Add weekly event</button>
        <div><button className={button} onClick={() => run(() => {
          setPreview(null);
          return previewSchedule(draft);
        }, (value) => {
          if (value.timezone !== snapshot.timezone) {
            setMessage("School timezone changed. Draft retained. Reload the scope and preview again before publishing.");
            return;
          }
          setPreview(value);
        })}>Preview on server</button></div>
        {preview && preview.timezone === snapshot.timezone && <div className="space-y-3 rounded bg-neutral-50 p-4">
          <h3 className="font-semibold">Deterministic preview · first 8 days</h3>
          <p className="text-sm">Proposed effective UTC interval: [{preview.start}, {preview.end ?? "open-ended"}). Scope preview assumes this residence for the displayed interval; it does not assert any student assignment.</p>
          <p className="text-sm">DST: Return uses the earlier instant; Release uses the later instant. {preview.resolution.versions.resolver} · tzdata {preview.resolution.versions.tzdata}</p>
          <ol className="space-y-2 text-sm">{preview.resolution.segments.map((segment, i) => <li key={i} className="border-b pb-2">
            <strong>{segment.state}</strong> · {segment.reason}<br />UTC: [{segment.start}, {segment.end})<br />
            {local(segment.start, snapshot.timezone)} → {local(segment.end, snapshot.timezone)}
            {segment.provenance.filter((p) => p.return && p.release).map((p, j) => <p key={j}>Return {p.return!.local} → {p.return!.utc} ({p.return!.disambiguation}); Release {p.release!.local} → {p.release!.utc} ({p.release!.disambiguation})</p>)}
          </li>)}</ol>
          <button className={button} onClick={() => run(() => publishSchedule(draft, preview.fingerprint, preview.timezone), async (text) => { setMessage(text); setPreview(null); await refresh(true); })}>Publish future schedule</button>
        </div>}
      </div> : <p>No manageable residence schedule is available.</p>}

      <div className="space-y-3 border-t pt-5">
        <h3 className="text-lg font-semibold">Create allow-only exception</h3>
        <p className="text-sm">Select exactly one target. UTC interval [start, end) must start in the future. To change an exception, revoke it and create another. Past effects remain in the audit history.</p>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm">Target type<select className={field} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setTargets([]); setTarget(""); editException(); }}><option value="student">Student</option><option value="device">Device</option><option value="residence">Residence</option></select></label>
          <label className="grid gap-1 text-sm">Search name / identifier<input className={field} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <button className={button} onClick={() => run(() => searchExceptionTargets(kind, query), (values) => { setTargets(values); setTarget(""); editException(); setMessage(`${values.length} authorized matches (up to 50); narrow the search if needed.`); })}>Search targets</button>
          <label className="grid gap-1 text-sm">Authorized target<select className={field} value={target} onChange={(e) => { setTarget(e.target.value); editException(); }}><option value="">Choose a target</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Start UTC<input className={field} placeholder="2026-10-01T22:00:00Z" value={start} onChange={(e) => { setStart(e.target.value); editException(); }} /></label>
          <label className="grid gap-1 text-sm">End UTC<input className={field} placeholder="2026-10-02T01:00:00Z" value={end} onChange={(e) => { setEnd(e.target.value); editException(); }} /></label>
          <label className="grid gap-1 text-sm">Required reason<input className={field} maxLength={2000} value={reason} onChange={(e) => { setReason(e.target.value); editException(); }} /></label>
        </div>
        <button className={button} disabled={!target || !start || !end || !reason.trim()} onClick={() => run(() => {
          exceptionKey.current ||= crypto.randomUUID();
          return createAllowException({ kind, target, start, end, reason, key: exceptionKey.current });
        }, async (text) => { setMessage(text); setTarget(""); setReason(""); editException(); await refresh(); })}>Create allow exception</button>
      </div>
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Exception audit history</h3>
        {!snapshot.exceptions.length && <p className="text-sm">No exceptions in your authorized scope.</p>}
        {snapshot.exceptions.map((e) => <article key={e.id} className="space-y-2 rounded border p-3 text-sm">
          <p><strong>{e.revoked_at ? "Revoked" : "Allow"}</strong> · {e.device_id ? "Device" : e.student_id ? "Student" : "Residence"} {e.device_id ?? e.student_id ?? e.dorm_id}</p>
          <p>UTC: [{e.start_at}, {e.end_at}) · {e.reason}</p>
          <p>Created {e.created_at} by {e.created_by_user_id}</p>
          {e.revoked_at ? <p>Revoked {e.revoked_at} by {e.revoked_by_user_id} · {e.revoke_reason}</p> : <div className="flex flex-wrap gap-2">
            <label>Revocation reason <input className={field} maxLength={2000} value={revokeReasons[e.id] ?? ""} onChange={(event) => setRevokeReasons({ ...revokeReasons, [e.id]: event.target.value })} /></label>
            <button className={button} disabled={!revokeReasons[e.id]?.trim()} onClick={() => run(() => revokeAllowException(e.id, revokeReasons[e.id]), async (text) => { setMessage(text); await refresh(); })}>Revoke exception</button>
          </div>}
        </article>)}
      </div>
    </fieldset>}
  </section>;
}
