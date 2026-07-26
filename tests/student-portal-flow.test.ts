import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { getSessionLoginPath } from "../lib/auth/session-state.ts";
// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { runStudentPortalFlow } from "../lib/students/portal-flow.ts";

test("missing student session redirects before either portal RPC", async () => {
  let profileRpcCalls = 0;
  let deviceRpcCalls = 0;
  const redirectPath = getSessionLoginPath("missing_auth_user", "/student");
  const redirectError = new Error(redirectPath);

  await assert.rejects(
    runStudentPortalFlow({
      async requireSession(nextPath) {
        assert.equal(nextPath, "/student");
        throw redirectError;
      },
      redirectNonStudent() {
        throw new Error("non-student redirect must not run");
      },
      redirectInvalidStudent() {
        throw new Error("invalid-student redirect must not run");
      },
      async rpc(name) {
        if (name === "get_current_student_portal_profile") {
          profileRpcCalls += 1;
        } else {
          deviceRpcCalls += 1;
        }

        return { data: [], error: null };
      }
    }),
    (error) => error === redirectError
  );

  assert.equal(redirectError.message, "/login?next=%2Fstudent");
  assert.equal(profileRpcCalls, 0);
  assert.equal(deviceRpcCalls, 0);
});
