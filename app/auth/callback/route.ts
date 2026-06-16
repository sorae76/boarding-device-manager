import { NextResponse, type NextRequest } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/server";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/app/dashboard";
  }

  return value;
}

function getSafeFailureReason(error: { code?: string; name?: string } | null) {
  const reason = error?.code ?? error?.name ?? "exchange_failed";

  return reason.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next");
  const next = getSafeNextPath(rawNext);
  let failureReason = code ? "exchange_failed" : "missing_code";

  if (code) {
    const redirectResponse = NextResponse.redirect(new URL(next, requestUrl.origin));
    const supabase = createRouteHandlerClient(request, redirectResponse);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
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
