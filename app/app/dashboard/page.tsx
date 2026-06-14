import { requireSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const placeholderCards = [
  {
    title: "Checked-in devices",
    value: "Ready",
    detail: "Operational counts will be added after workflow approval."
  },
  {
    title: "Checked-out devices",
    value: "Ready",
    detail: "No device checkout mutations are implemented in this phase."
  },
  {
    title: "Overdue notices",
    value: "Ready",
    detail: "Notice scheduling remains a later backend workflow."
  }
];

export default async function DashboardPage() {
  const context = await requireSessionContext();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-brand">Dorm Staff Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
          {context.currentSchool?.name ?? "School"} device operations
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          The app is connected to Supabase and ready for authenticated role-based
          shells. Device workflows are intentionally not active yet.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {placeholderCards.map((card) => (
          <article
            className="min-h-[140px] rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            key={card.title}
          >
            <p className="text-sm font-medium text-neutral-600">{card.title}</p>
            <p className="mt-3 text-2xl font-semibold text-neutral-950">{card.value}</p>
            <p className="mt-3 text-sm leading-5 text-neutral-500">{card.detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
