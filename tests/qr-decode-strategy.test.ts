import assert from "node:assert/strict";
import test from "node:test";

const strategyUrl = new URL("../lib/qr/decode-strategy.ts", import.meta.url).href;
const {
  nativeEmptyFallbackThreshold,
  requiresSoftwareQrFallback
}: typeof import("../lib/qr/decode-strategy") = await import(strategyUrl);

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
