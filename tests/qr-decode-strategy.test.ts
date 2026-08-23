import assert from "node:assert/strict";
import test from "node:test";

const strategyUrl = new URL("../lib/qr/decode-strategy.ts", import.meta.url).href;
const {
  nativeEmptyFallbackThreshold,
  requiresSoftwareQrFallback,
  runBoundedNativeQrAttempt
}: typeof import("../lib/qr/decode-strategy") = await import(strategyUrl);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("native decoded value wins before timeout", async () => {
  assert.deepEqual(
    await runBoundedNativeQrAttempt(Promise.resolve("device-pass-value"), 50),
    { status: "decoded", value: "device-pass-value" }
  );
});

test("native empty result wins before timeout", async () => {
  assert.deepEqual(await runBoundedNativeQrAttempt(Promise.resolve(""), 50), {
    status: "empty"
  });
});

test("native rejection wins before timeout", async () => {
  assert.deepEqual(
    await runBoundedNativeQrAttempt(Promise.reject(new Error("native failed")), 50),
    { status: "rejected" }
  );
});

test("unsettled native attempt times out", async () => {
  assert.deepEqual(
    await runBoundedNativeQrAttempt(new Promise<string>(() => undefined), 5),
    { status: "timed_out" }
  );
});

test("late native resolution cannot replace the timeout outcome", async () => {
  const nativeAttempt = deferred<string>();
  const outcome = await runBoundedNativeQrAttempt(nativeAttempt.promise, 5);
  nativeAttempt.resolve("late-device-pass-value");
  await Promise.resolve();

  assert.deepEqual(outcome, { status: "timed_out" });
});

test("late native rejection is handled after timeout", async () => {
  const nativeAttempt = deferred<string>();
  const outcome = await runBoundedNativeQrAttempt(nativeAttempt.promise, 5);
  nativeAttempt.reject(new Error("late native failure"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(outcome, { status: "timed_out" });
});

test("native unavailable requires software fallback", () => {
  assert.equal(requiresSoftwareQrFallback({
    nativeAvailable: false,
    nativeQrSupported: null,
    consecutiveNativeEmptyResults: 0
  }), true);
});

test("explicitly unsupported native QR requires software fallback", () => {
  assert.equal(requiresSoftwareQrFallback({
    nativeAvailable: true,
    nativeQrSupported: false,
    consecutiveNativeEmptyResults: 0
  }), true);
});

test("supported native decoder remains primary below the empty threshold", () => {
  for (let misses = 0; misses < nativeEmptyFallbackThreshold; misses += 1) {
    assert.equal(requiresSoftwareQrFallback({
      nativeAvailable: true,
      nativeQrSupported: true,
      consecutiveNativeEmptyResults: misses
    }), false);
  }
});

test("three consecutive usable native empty results require software fallback", () => {
  assert.equal(nativeEmptyFallbackThreshold, 3);
  assert.equal(requiresSoftwareQrFallback({
    nativeAvailable: true,
    nativeQrSupported: true,
    consecutiveNativeEmptyResults: 3
  }), true);
});

test("native empty threshold remains deterministic beyond the boundary", () => {
  assert.equal(requiresSoftwareQrFallback({
    nativeAvailable: true,
    nativeQrSupported: null,
    consecutiveNativeEmptyResults: nativeEmptyFallbackThreshold - 1
  }), false);
  assert.equal(requiresSoftwareQrFallback({
    nativeAvailable: true,
    nativeQrSupported: null,
    consecutiveNativeEmptyResults: nativeEmptyFallbackThreshold + 1
  }), true);
});
