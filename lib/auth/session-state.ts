type AuthUserError = {
  code?: string;
  name?: string;
};

export function getAuthUserFailureReason(
  user: unknown,
  error: AuthUserError | null
) {
  const isMissingSession =
    error?.name === "AuthSessionMissingError" ||
    error?.code === "session_not_found";

  if (error && !isMissingSession) {
    return "auth_user_error";
  }

  if (!user || isMissingSession) {
    return "missing_auth_user";
  }

  return null;
}

export function getSessionLoginPath(reason: string, nextPath: string) {
  const next = encodeURIComponent(nextPath);

  return reason === "missing_auth_user"
    ? `/login?next=${next}`
    : `/login?error=session&reason=${reason}&next=${next}`;
}
