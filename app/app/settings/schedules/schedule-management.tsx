import { formatScheduleLocalTime, type ScheduleManagementData, type SchedulePolicy } from "@/lib/schedules/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function PolicyCard({ policy, timezone }: { policy: SchedulePolicy; timezone: string }) {
  const from = formatDate(policy.effective_from);
  const to = formatDate(policy.effective_to);
  const dateRange = from || to ? `${from ?? "No start date"} – ${to ?? "No end date"}` : "No date limits";
  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-950">{policy.name}</h3>
          {policy.residenceName ? <p className="mt-1 text-sm text-neutral-600">{policy.residenceName}</p> : null}
        </div>
        <span className={policy.is_active ? "rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700" : "rounded-full bg-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700"}>
          {policy.is_active ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="mt-3 text-xs text-neutral-500">{dateRange} · {timezone}</p>
      {policy.events.length > 0 ? (
        <ol className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
          {policy.events.map((event) => (
            <li className="flex items-center justify-between gap-4 py-2 text-sm" key={event.id}>
              <span className="text-neutral-700">{WEEKDAYS[event.weekday] ?? "Unknown day"}</span>
              <span className="font-medium text-neutral-950">{formatScheduleLocalTime(event.local_time)} · {event.event_type === "release" ? "Release" : "Return"}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-4 text-sm text-neutral-500">No weekly events are configured.</p>}
    </article>
  );
}

function PolicyGroup({ emptyMessage, policies, timezone }: { emptyMessage: string; policies: SchedulePolicy[]; timezone: string }) {
  const active = policies.filter((policy) => policy.is_active);
  const inactive = policies.filter((policy) => !policy.is_active);
  if (policies.length === 0) return <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">{emptyMessage}</p>;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Active</h3>
        {active.length ? <div className="grid gap-4 lg:grid-cols-2">{active.map((policy) => <PolicyCard key={policy.id} policy={policy} timezone={timezone} />)}</div> : <p className="text-sm text-neutral-500">No active policies.</p>}
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Inactive</h3>
        {inactive.length ? <div className="grid gap-4 lg:grid-cols-2">{inactive.map((policy) => <PolicyCard key={policy.id} policy={policy} timezone={timezone} />)}</div> : <p className="text-sm text-neutral-500">No inactive policies.</p>}
      </div>
    </div>
  );
}

export default function ScheduleManagement({ data, timezone }: { data: ScheduleManagementData; timezone: string }) {
  return (
    <div className="space-y-8">
      <section><h2 className="mb-3 text-xl font-semibold text-neutral-950">School-wide schedules</h2><PolicyGroup emptyMessage="No school-wide schedule policies are available." policies={data.schoolWidePolicies} timezone={timezone} /></section>
      <section><h2 className="mb-3 text-xl font-semibold text-neutral-950">Residence schedules</h2><PolicyGroup emptyMessage="No residence schedule policies are available." policies={data.residencePolicies} timezone={timezone} /></section>
    </div>
  );
}
