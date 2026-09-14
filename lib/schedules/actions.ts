"use server";

import { revalidatePath } from "next/cache";
import { requireScheduleContext } from "@/lib/schedules/access";
import { createClient } from "@/lib/supabase/server";
import { previewScheduleDraft, validateDraft, publicationIntervals } from "@/lib/schedules/authoring";
import type { ActionResult, AuthoringSnapshot, DraftPreview, ScheduleDraft } from "@/lib/schedules/authoring-types";

async function manager() {
  const context = await requireScheduleContext();
  if (!["super_admin", "school_admin", "dorm_supervisor"].includes(context.effectiveRole)) throw new Error("Not authorized to manage schedules.");
  return { school: context.currentSchool.id, client: createClient() };
}
const failure = (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : "Schedule request failed. Retry with the same request." });
async function snapshotFor(client: ReturnType<typeof createClient>, school: string, draft?: ScheduleDraft) {
  const { data, error } = await client.rpc("read_device_schedule_authoring", { target_school_id: school,
    target_request_key: draft?.idempotency_key ?? null, target_request_dorm: draft?.dorm_id ?? null });
  if (error || !data) throw new Error("Could not load authorized schedule data.");
  const snapshot = data as AuthoringSnapshot & { request_exists: boolean };
  return { ...snapshot, intervals: snapshot.scopes.flatMap(publicationIntervals) };
}
export async function loadScheduleAuthoring(): Promise<ActionResult<AuthoringSnapshot>> {
  try { const { school, client } = await manager(); return { ok: true, value: await snapshotFor(client, school) }; }
  catch (error) { return failure(error); }
}
export async function previewSchedule(draft: ScheduleDraft): Promise<ActionResult<DraftPreview>> {
  try { const { school, client } = await manager(); return { ok: true, value: previewScheduleDraft(await snapshotFor(client, school), draft) }; }
  catch (error) { return failure(error); }
}
export async function publishSchedule(draft: ScheduleDraft, fingerprint: string, expectedTimezone: string): Promise<ActionResult<string>> {
  try {
    const { school, client } = await manager();
    validateDraft(draft);
    if (typeof expectedTimezone !== "string" || !expectedTimezone.trim()) throw new Error("Reload and preview again before publishing.");
    const snapshot = await snapshotFor(client, school, draft);
    // A lost response must reach G1-A's idempotency ledger even after revision changes.
    if (!snapshot.request_exists && (snapshot.timezone !== expectedTimezone || previewScheduleDraft(snapshot, draft).fingerprint !== fingerprint)) throw new Error("Preview changed. Preview this draft again before publishing.");
    const { data, error } = await client.rpc("publish_device_schedule", {
      target_school_id: school, target_dorm_id: draft.dorm_id, target_expected_scope_revision: draft.expected_revision,
      target_idempotency_key: draft.idempotency_key, target_predecessor_publication_id: draft.predecessor_id,
      target_replaces_publication_id: draft.replaces_id, target_name: draft.name,
      target_effective_from: draft.effective_from, target_effective_to: draft.effective_to, target_events: draft.events,
      target_expected_timezone: expectedTimezone
    });
    if (error) throw new Error("Publication was not confirmed. Retry the unchanged request or reload and preview again.");
    if (data?.[0]?.outcome !== "published") throw new Error(`Publication not applied (${data?.[0]?.outcome ?? "unknown"}). Reload and preview again.`);
    revalidatePath("/app/settings/schedules");
    return { ok: true, value: "Future schedule published." };
  } catch (error) { return failure(error); }
}
export async function cancelSchedule(dorm: string | null, publication: string, revision: string, key: string): Promise<ActionResult<string>> {
  try {
    const { school, client } = await manager();
    const { data, error } = await client.rpc("cancel_future_device_schedule_publication", { target_school_id: school,
      target_dorm_id: dorm, target_publication_id: publication, target_expected_scope_revision: revision, target_idempotency_key: key });
    if (error || data?.[0]?.outcome !== "cancelled") throw new Error(`Cancellation not confirmed (${data?.[0]?.outcome ?? "retry unchanged request"}). Reload to check the current chain.`);
    revalidatePath("/app/settings/schedules");
    return { ok: true, value: "Future publication cancelled." };
  } catch (error) { return failure(error); }
}
export async function searchExceptionTargets(kind: "device" | "student" | "residence", query: string): Promise<ActionResult<{ id: string; label: string }[]>> {
  try {
    const { school, client } = await manager();
    const { data, error } = await client.rpc("search_device_schedule_exception_targets", { target_school_id: school, target_kind: kind, target_query: query });
    if (error) throw new Error("Could not search authorized exception targets.");
    return { ok: true, value: data ?? [] };
  } catch (error) { return failure(error); }
}
export async function createAllowException(input: { kind: "device" | "student" | "residence"; target: string; start: string; end: string; reason: string; key: string }): Promise<ActionResult<string>> {
  try {
    const { school, client } = await manager();
    if (!["device", "student", "residence"].includes(input.kind) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(input.start) ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(input.end)) throw new Error("Enter explicit UTC timestamps ending in Z.");
    const { data, error } = await client.rpc("create_device_schedule_allow", { target_school_id: school,
      target_device_id: input.kind === "device" ? input.target : null, target_student_id: input.kind === "student" ? input.target : null,
      target_dorm_id: input.kind === "residence" ? input.target : null, target_start: input.start, target_end: input.end,
      target_reason: input.reason, target_idempotency_key: input.key });
    if (error || !data) throw new Error("Exception not confirmed. Check target access, future UTC interval and reason; retry unchanged to recover a lost response.");
    revalidatePath("/app/settings/schedules"); return { ok: true, value: "Allow exception created." };
  } catch (error) { return failure(error); }
}
export async function revokeAllowException(id: string, reason: string): Promise<ActionResult<string>> {
  try {
    const { school, client } = await manager();
    const { data, error } = await client.rpc("revoke_device_schedule_allow", { target_school_id: school, target_exception_id: id, target_reason: reason });
    if (error || !data) throw new Error("Revocation not confirmed. Check access and reason; retry unchanged to recover a lost response.");
    revalidatePath("/app/settings/schedules"); return { ok: true, value: "Allow exception revoked from the recorded server time." };
  } catch (error) { return failure(error); }
}
