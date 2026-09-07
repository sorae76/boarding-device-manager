import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleContext } from "@/lib/schedules/access";
import { compareScheduleEvents, type ScheduleManagementData, type SchedulePolicy, type ScheduleWeeklyEvent } from "@/lib/schedules/types";
import { createClient } from "@/lib/supabase/server";

type PolicyRow = Omit<SchedulePolicy, "events" | "residenceName">;
type ResidenceRow = { id: string; school_id: string; name: string };

export async function listScheduleManagementData(
  context: ScheduleContext,
  supabase: SupabaseClient = createClient()
): Promise<ScheduleManagementData> {
  const schoolId = context.currentSchool.id;
  const { data: policyData, error: policyError } = await supabase
    .from("device_schedule_policies")
    .select("id,school_id,dorm_id,name,is_active,effective_from,effective_to")
    .eq("school_id", schoolId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (policyError) throw new Error("Could not load schedules.");

  const policies = (policyData ?? []) as PolicyRow[];
  const visiblePolicyIds = new Set(policies.map((policy) => policy.id));
  const residenceIds = [...new Set(policies.flatMap((policy) => policy.dorm_id ? [policy.dorm_id] : []))];

  const { data: eventData, error: eventError } = await supabase
    .from("device_schedule_weekly_events")
    .select("id,school_id,policy_id,weekday,local_time,event_type")
    .eq("school_id", schoolId)
    .order("weekday", { ascending: true })
    .order("local_time", { ascending: true })
    .order("event_type", { ascending: true });
  if (eventError) throw new Error("Could not load schedules.");

  let residences: ResidenceRow[] = [];
  if (residenceIds.length > 0) {
    const { data: residenceData, error: residenceError } = await supabase
      .from("dorms")
      .select("id,school_id,name")
      .eq("school_id", schoolId)
      .in("id", residenceIds)
      .order("name", { ascending: true });
    if (residenceError) throw new Error("Could not load schedules.");
    residences = (residenceData ?? []) as ResidenceRow[];
  }

  const residenceNames = new Map(residences.map((residence) => [residence.id, residence.name]));
  const events = ((eventData ?? []) as ScheduleWeeklyEvent[])
    .filter((event) => visiblePolicyIds.has(event.policy_id))
    .sort(compareScheduleEvents);
  const eventsByPolicy = new Map<string, ScheduleWeeklyEvent[]>();
  for (const event of events) {
    const policyEvents = eventsByPolicy.get(event.policy_id) ?? [];
    policyEvents.push(event);
    eventsByPolicy.set(event.policy_id, policyEvents);
  }

  const hydratedPolicies = policies.map((policy) => ({
    ...policy,
    residenceName: policy.dorm_id ? residenceNames.get(policy.dorm_id) ?? "Assigned residence" : null,
    events: eventsByPolicy.get(policy.id) ?? []
  }));
  return {
    schoolWidePolicies: hydratedPolicies.filter((policy) => policy.dorm_id === null),
    residencePolicies: hydratedPolicies.filter((policy) => policy.dorm_id !== null)
  };
}
