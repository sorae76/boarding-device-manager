import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server.js";

// @ts-expect-error Node's native TypeScript runner requires the file extension.
import { applyAppAuthGuard } from "../lib/auth/middleware.ts";

function request(path: string) {
  return new NextRequest(`https://boarding-device-manager.test${path}`);
}

test("missing session redirects /app without a false error state", async () => {
  const result = await applyAppAuthGuard(
    request("/app"),
    () => NextResponse.next(),
    async () => ({
      data: { user: null },
      error: { name: "AuthSessionMissingError" }
    })
  );
  const location = new URL(result.headers.get("location")!);

  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("next"), "/app");
  assert.equal(location.searchParams.has("error"), false);
  assert.equal(location.searchParams.has("reason"), false);
});

test("missing session preserves a nested app path and query", async () => {
  const result = await applyAppAuthGuard(
    request("/app/residences?view=active"),
    () => NextResponse.next(),
    async () => ({
      data: { user: null },
      error: { code: "session_not_found" }
    })
  );
  const location = new URL(result.headers.get("location")!);

  assert.equal(location.searchParams.get("next"), "/app/residences?view=active");
  assert.match(
    location.search,
    /next=%2Fapp%2Fresidences%3Fview%3Dactive/
  );
  assert.equal(location.searchParams.has("error"), false);
  assert.equal(location.searchParams.has("reason"), false);
});

test("unexpected auth errors retain the middleware session error", async () => {
  const result = await applyAppAuthGuard(
    request("/app"),
    () => NextResponse.next(),
    async () => ({
      data: { user: null },
      error: { name: "AuthApiError" }
    })
  );
  const location = new URL(result.headers.get("location")!);

  assert.equal(location.searchParams.get("error"), "session");
  assert.equal(location.searchParams.get("reason"), "auth_user_error");
  assert.equal(location.searchParams.get("next"), "/app");
});

test("unexpected auth errors take precedence over a returned user", async () => {
  const result = await applyAppAuthGuard(
    request("/app"),
    () => NextResponse.next(),
    async () => ({
      data: { user: { id: "auth-user" } },
      error: { name: "AuthApiError" }
    })
  );
  const location = new URL(result.headers.get("location")!);

  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "session");
  assert.equal(location.searchParams.get("reason"), "auth_user_error");
  assert.equal(location.searchParams.get("next"), "/app");
});

test("no user and no error redirects without a false error state", async () => {
  const result = await applyAppAuthGuard(
    request("/app"),
    () => NextResponse.next(),
    async () => ({ data: { user: null }, error: null })
  );
  const location = new URL(result.headers.get("location")!);

  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("next"), "/app");
  assert.equal(location.searchParams.has("error"), false);
  assert.equal(location.searchParams.has("reason"), false);
});

test("authenticated users pass through middleware unchanged", async () => {
  const response = NextResponse.next();
  const result = await applyAppAuthGuard(request("/app"), () => response, async () => ({
    data: { user: { id: "auth-user" } },
    error: null
  }));

  assert.equal(result, response);
  assert.equal(result.headers.has("location"), false);
});

test("authenticated users receive the response refreshed during getUser", async () => {
  let response = NextResponse.next();
  const refreshedResponse = NextResponse.next();
  refreshedResponse.headers.set("x-refreshed-session", "true");

  const result = await applyAppAuthGuard(request("/app"), () => response, async () => {
    response = refreshedResponse;
    return {
      data: { user: { id: "auth-user" } },
      error: null
    };
  });

  assert.equal(result, refreshedResponse);
  assert.equal(result.headers.get("x-refreshed-session"), "true");
});
