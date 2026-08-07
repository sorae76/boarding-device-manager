import Link from "next/link";

import { requireDeviceWorkflowContext } from "@/lib/devices/access";
import { listStudentDeviceIssuesForStaff } from "@/lib/devices/data";
import { deviceTypeLabels, formatDateTimeInTimeZone, statusLabels } from "@/lib/devices/format";
import { issueStatusBadgeClasses, issueStatusLabels, issueTypeLabels } from "@/lib/devices/issue-review";
import type { DeviceIssueStatus } from "@/lib/devices/types";

export const dynamic = "force-dynamic";
const statuses: DeviceIssueStatus[] = ["pending", "approved", "rejected"];

function submittedParts(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "Unknown", time: "" };
  return {
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(date),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date)
  };
}

export default async function DeviceIssuesPage({ searchParams }: { searchParams?: { status?: string | string[] } }) {
  const context = await requireDeviceWorkflowContext();
  const raw = Array.isArray(searchParams?.status) ? searchParams.status[0] : searchParams?.status;
  const status = statuses.includes(raw as DeviceIssueStatus) ? raw as DeviceIssueStatus : "pending";
  const requests = await listStudentDeviceIssuesForStaff(context, status);
  const timezone = context.currentSchool.timezone;

  return <div className="space-y-5"><header><p className="text-sm font-medium text-brand">Device Registry</p><h1 className="mt-1 text-2xl font-semibold">Device issue requests</h1><p className="mt-2 text-sm text-neutral-600">Review student requests within your assigned access scope.</p></header><nav className="flex flex-wrap gap-2">{statuses.map((item) => <Link className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${item === status ? "bg-brand text-white" : "bg-white text-neutral-700"}`} href={`/app/devices/issues?status=${item}`} key={item}>{issueStatusLabels[item]}</Link>)}</nav>
    <div className="space-y-3 md:hidden" data-mobile-issue-cards>{requests.map((r) => <article className="rounded-lg border bg-white p-4 shadow-sm" key={r.request_id}><div className="flex justify-between gap-3"><div><h2 className="font-semibold">{r.student_name}</h2><p className="text-xs text-neutral-500">{r.residence_name ?? "Unassigned"}</p></div><span className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${issueStatusBadgeClasses[r.status]}`}>{issueStatusLabels[r.status]}</span></div><p className="mt-3 text-sm">{r.manufacturer} {r.model} / {issueTypeLabels[r.request_type]}</p><p className="mt-1 text-xs text-neutral-500">{statusLabels[r.current_custody_status]} / {formatDateTimeInTimeZone(r.submitted_at, timezone)}</p><Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-md bg-brand px-4 text-sm font-semibold text-white" href={`/app/devices/issues/${r.request_id}`}>{r.status === "pending" ? "Review" : "View"}</Link></article>)}{!requests.length ? <p className="rounded-lg border bg-white p-6 text-center text-sm text-neutral-500">No {status} issue requests are visible in your scope.</p> : null}</div>
    <section className="hidden overflow-x-auto rounded-lg border bg-white shadow-sm md:block" data-desktop-issue-table><table className="w-full min-w-[1000px] table-fixed text-left text-sm"><colgroup><col className="w-[15%]"/><col className="w-[12%]"/><col className="w-[16%]"/><col className="w-[12%]"/><col className="w-[17%]"/><col className="w-[11%]"/><col className="w-[10%]"/><col className="w-[7%]"/></colgroup><thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr>{["Student","Residence","Device","Request type","Custody","Submitted","Status","Action"].map((x) => <th className="px-3 py-3 font-semibold" key={x}>{x}</th>)}</tr></thead><tbody className="divide-y">{requests.map((r) => { const submitted = submittedParts(r.submitted_at, timezone); return <tr className="align-top" key={r.request_id}><td className="px-3 py-3"><p className="font-semibold text-neutral-950">{r.student_name}</p><p className="mt-0.5 text-xs text-neutral-500">{r.student_number ?? "No student number"}</p></td><td className="px-3 py-3 break-words">{r.residence_name ?? "Unassigned"}</td><td className="px-3 py-3 break-words"><p>{r.manufacturer} {r.model}</p><p className="mt-0.5 text-xs text-neutral-500">{deviceTypeLabels[r.device_type]}</p></td><td className="px-3 py-3 break-words">{issueTypeLabels[r.request_type]}</td><td className="px-3 py-3"><span className="inline-block break-normal leading-5">{statusLabels[r.current_custody_status]}</span></td><td className="px-3 py-3 whitespace-nowrap"><span className="block">{submitted.date}</span><span className="block text-xs text-neutral-500">{submitted.time}</span></td><td className="px-3 py-3"><span className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${issueStatusBadgeClasses[r.status]}`}>{issueStatusLabels[r.status]}</span></td><td className="px-3 py-3"><Link className="whitespace-nowrap font-semibold text-brand" href={`/app/devices/issues/${r.request_id}`}>{r.status === "pending" ? "Review" : "View"}</Link></td></tr>;})}</tbody></table></section>
  </div>;
}
