import ScheduleManagement from "@/app/app/settings/schedules/schedule-management";
import { requireScheduleContext } from "@/lib/schedules/access";
import { listScheduleManagementData } from "@/lib/schedules/data";

export const dynamic = "force-dynamic";

export default async function ScheduleSettingsPage() {
  const context = await requireScheduleContext();
  const data = await listScheduleManagementData(context);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-brand">Admin / Settings</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Schedule management</h1>
        <p className="mt-2 text-sm text-neutral-600">Read-only weekly device release and return schedules for {context.currentSchool.name}.</p>
      </div>
      <ScheduleManagement data={data} timezone={context.currentSchool.timezone} />
    </div>
  );
}
