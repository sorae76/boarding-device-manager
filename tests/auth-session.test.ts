import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { getAuthUserFailureReason, getSessionLoginPath } from "../lib/auth/session-state.ts";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { getRoleAwareNextPath } from "../lib/auth/redirects.ts";

test("signed-out staff app access redirects without an error state", () => {
  const reason = getAuthUserFailureReason(null, {
    name: "AuthSessionMissingError"
  });

  assert.equal(reason, "missing_auth_user");
  assert.equal(getSessionLoginPath(reason, "/app"), "/login?next=%2Fapp");
});

test("signed-out student access redirects without an error state", () => {
  const reason = getAuthUserFailureReason(null, {
    code: "session_not_found"
  });

  assert.equal(reason, "missing_auth_user");
  assert.equal(
    getSessionLoginPath(reason, "/student"),
    "/login?next=%2Fstudent"
  );
});

test("an unexpected auth error keeps the session error state", () => {
  const reason = getAuthUserFailureReason(null, { name: "AuthApiError" });

  assert.equal(reason, "auth_user_error");
  assert.equal(
    getSessionLoginPath(reason, "/app"),
    "/login?error=session&reason=auth_user_error&next=%2Fapp"
  );
});

test("an unexpected auth error takes precedence over a returned user", () => {
  assert.equal(
    getAuthUserFailureReason({ id: "auth-user" }, { name: "AuthApiError" }),
    "auth_user_error"
  );
});

test("a user without an auth error remains authenticated", () => {
  assert.equal(getAuthUserFailureReason({ id: "auth-user" }, null), null);
});

test("authenticated staff routing remains on the safe staff destination", () => {
  assert.equal(getRoleAwareNextPath("administrator", "/app"), "/app");
});

test("authenticated student routing remains on the student portal", () => {
  assert.equal(getRoleAwareNextPath("student", "/app"), "/student");
});
