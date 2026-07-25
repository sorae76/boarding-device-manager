import { NextResponse, type NextRequest } from "next/server";

import { getSafeAppNextPath } from "@/lib/auth/redirects";
import { createRouteHandlerClient } from "@/lib/supabase/server";

function getSafeFailureReason(error: { code?: string; name?: string } | null) {
  const reason = error?.code ?? error?.name ?? "exchange_failed";

  return reason.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next");
  const next = getSafeAppNextPath(rawNext);
  let failureReason = code ? "exchange_failed" : "missing_code";

  if (code) {
    const continuationUrl = new URL("/auth/continue", requestUrl.origin);
    if (rawNext) {
      continuationUrl.searchParams.set("next", next);
    }
    const redirectResponse = NextResponse.redirect(continuationUrl);
    const supabase = createRouteHandlerClient(request, redirectResponse);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: claimResult, error: claimError } = await supabase.rpc(
        "claim_current_student_account"
      );

      if (claimError) {
        const loginUrl = new URL("/login", requestUrl.origin);
        loginUrl.searchParams.set("error", "student_claim");
        loginUrl.searchParams.set("reason", getSafeFailureReason(claimError));
        const failureResponse = NextResponse.redirect(loginUrl);
        redirectResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
          failureResponse.cookies.set(name, value, options);
        });
        return failureResponse;
      }

      continuationUrl.searchParams.set(
        "claim",
        claimResult === "no_student_match" ? "no_student_match" : "complete"
      );
      redirectResponse.headers.set("location", continuationUrl.toString());
      return redirectResponse;
    }

    failureReason = getSafeFailureReason(error);
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", "auth_callback");
  loginUrl.searchParams.set("reason", failureReason);
  loginUrl.searchParams.set("next", next);

  return NextResponse.redirect(loginUrl);
}
