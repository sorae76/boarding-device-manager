import { type NextRequest, NextResponse } from "next/server.js";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { getAuthUserFailureReason } from "./session-state.ts";

type AuthUserResult = {
  data: {
    user: unknown;
  };
  error: {
    code?: string;
    name?: string;
  } | null;
};

export async function applyAppAuthGuard(
  request: NextRequest,
  getResponse: () => NextResponse,
  getUser: () => Promise<AuthUserResult>
) {
  const {
    data: { user },
    error: userError
  } = await getUser();
  const response = getResponse();
  const reason = getAuthUserFailureReason(user, userError);

  if (!request.nextUrl.pathname.startsWith("/app") || reason === null) {
    return response;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  if (reason !== "missing_auth_user") {
    loginUrl.searchParams.set("error", "session");
    loginUrl.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(loginUrl);
}
