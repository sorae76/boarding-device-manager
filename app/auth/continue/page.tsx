import { redirect } from "next/navigation";

import { getSafeAppNextPath, getRoleAwareNextPath } from "@/lib/auth/redirects";
import { getDefaultAppPath } from "@/lib/auth/roles";
import { getCurrentSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AuthContinuationPage({
  searchParams
}: {
  searchParams: { claim?: string; next?: string };
}) {
  const context = await getCurrentSessionContext();

  if (!context) {
    if (searchParams.claim === "no_student_match") {
      redirect("/login?error=student_account_not_set_up");
    }

    redirect("/login?error=session&reason=active_school_context_missing");
  }

  const destination = searchParams.next
    ? getSafeAppNextPath(searchParams.next)
    : getDefaultAppPath(context);

  redirect(getRoleAwareNextPath(context.effectiveRole, destination));
}
