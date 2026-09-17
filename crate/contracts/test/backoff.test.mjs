// What the script does when the explorer says "not so fast".
//
// This is the part of verifying that actually failed in practice: two contracts
// published, two turned away with a 429, and the source of the seal — the one
// thing this project asks to be checked on — left unreadable. So the pacing is
// tested rather than assumed, with the waiting injected so the test costs
// nothing to run.
import assert from "node:assert/strict";
import test from "node:test";

import { retryAfterMs, withBackoff } from "../lib/backoff.mjs";

/** Just enough of a Headers object to answer one question. */
const headers = (value) => ({ get: (name) => (name === "retry-after" && value != null ? value : null) });

/** Collects what was waited for instead of waiting for it. */
function recorder() {
  const waits = [];
  const logs = [];
  return { waits, logs, options: { wait: async (ms) => waits.push(ms), log: (line) => logs.push(line) } };
}

test("an answer that is not 429 comes straight back", async () => {
  const { waits, options } = recorder();
  const result = await withBackoff(async () => ({ status: 200, text: "fine" }), "CrateSeal", options);

  assert.equal(result.status, 200);
  assert.deepEqual(waits, [], "nothing should have been waited for");
});

test("a 429 is a pause, not an answer", async () => {
  const { waits, logs, options } = recorder();
  let calls = 0;

  const result = await withBackoff(
    async () => (calls++ < 2 ? { status: 429, text: "Too many requests" } : { status: 200, text: "verified" }),
    "CrateToken",
    options,
  );

  assert.equal(result.status, 200, "it should have kept asking until it got through");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5_000, 10_000], "five seconds, then double");
  assert.match(logs[0], /CrateToken: rate limited, waiting 5s/);
});

test("the wait doubles but stops at two minutes", async () => {
  const { waits, options } = recorder();
  await withBackoff(async () => ({ status: 429, text: "Too many requests" }), "CrateRouter", options);

  assert.deepEqual(waits, [5_000, 10_000, 20_000, 40_000, 80_000, 120_000, 120_000]);
  assert.equal(waits.length, 7, "eight attempts means seven gaps between them");
});

test("giving up says so rather than looking like something else", async () => {
  const { options } = recorder();
  const result = await withBackoff(async () => ({ status: 429, text: "Too many requests" }), "CrateToken", options);

  assert.equal(result.status, 429);
  assert.match(result.text, /rate limited after 8 attempts/);
});

test("when the server says how long to wait, that is what is waited", async () => {
  const { waits, options } = recorder();
  let calls = 0;

  await withBackoff(
    async () =>
      calls++ === 0 ? { status: 429, text: "slow down", headers: headers("45") } : { status: 200, text: "ok" },
    "CrateSeal",
    options,
  );

  assert.deepEqual(waits, [45_000], "45 seconds, not the 5 the schedule would have guessed");
});

test("retryAfterMs reads both forms, and refuses the rest", () => {
  assert.equal(retryAfterMs(headers("30")), 30_000);
  assert.equal(retryAfterMs(headers(" 0 ")), 0);
  assert.equal(retryAfterMs(headers(null)), null, "no header means no opinion");
  assert.equal(retryAfterMs(undefined), null, "a response without headers must not throw");
  assert.equal(retryAfterMs(headers("soon")), null, "nonsense is not a number of seconds");
  assert.equal(retryAfterMs(headers("-5")), null, "a negative wait is not a wait");

  const inTwoMinutes = new Date(Date.now() + 120_000).toUTCString();
  const parsed = retryAfterMs(headers(inTwoMinutes));
  assert.ok(parsed > 110_000 && parsed <= 120_000, `an HTTP date should become a delay, got ${parsed}`);

  assert.equal(retryAfterMs(headers(new Date(Date.now() - 60_000).toUTCString())), 0, "a past date means now");
});
