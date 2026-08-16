import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("device lifecycle routes custody transitions through the atomic RPC", async () => {
  const actions = await read("../lib/devices/actions.ts");

  assert.match(actions, /transitionCustodyWithRpc/);
  assert.match(actions, /rpc\("transition_residence_device_custody"/);
  assert.match(actions, /transition === "check_in" && lifecycleDevice\.status === "checked_out"/);
  assert.match(actions, /operation: "return"/);
  assert.match(actions, /transition === "check_out"/);
  assert.match(actions, /operation: "release"/);
  assert.match(actions, /transition === "mark_missing"/);
  assert.match(actions, /operation: "mark_missing"/);
  assert.match(actions, /lifecycleDevice\.status === "lost"/);
  assert.match(actions, /operation: "recover_missing"/);
  assert.match(actions, /transition === "set_inactive"/);
  assert.doesNotMatch(actions, /lifecycleEventAction/);
});

test("scanner preserves all lookup methods and sends QR/manual method to the atomic RPC", async () => {
  const actions = await read("../lib/devices/actions.ts");
  const scanner = await read("../app/app/returns/return-scanner.tsx");

  for (const lookup of ["id", "qr_token", "asset_tag", "serial_number"]) {
    assert.match(actions, new RegExp(lookup));
  }
  assert.match(actions, /method,[\s\S]*operation: "return"/);
  assert.match(scanner, /setMethod\("qr_scan"\)/);
  assert.match(scanner, /setMethod\("manual"\)/);
});

test("scanner no longer offers or submits duplicate return confirmation", async () => {
  const actions = await read("../lib/devices/actions.ts");
  const scanner = await read("../app/app/returns/return-scanner.tsx");

  assert.doesNotMatch(scanner, /confirmDuplicate|Record duplicate return/);
  assert.doesNotMatch(actions, /formData, "confirmDuplicate"/);
  assert.match(actions, /result\.outcome === "stale_status"/);
  assert.match(actions, /already returned or is no longer eligible for return/);
});
