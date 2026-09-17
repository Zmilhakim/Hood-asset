// Every command-line script, started with nothing set.
//
// A script that cannot start is a script that has not been run, so each one is
// actually started, and the bar is low on purpose: it must fail the way a
// program fails, with a sentence, not the way a mistake fails, with a stack
// trace about a name nobody defined.
//
// What this does not catch is worth stating, because it was tried. A patch to
// pack.mjs once left a name used but never declared, and starting the script
// with nothing set did not find it — the script exited at its first check, a
// long way above the broken line. Only reading the file finds that, which is
// why `no-undef` is in eslint.config.mjs and why `pretest` runs it.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS = ["deploy.mjs", "pack.mjs", "deploy-router.mjs", "verify.mjs", "preflight.mjs", "whoami.mjs"];

// Nothing supplied, and nothing inherited: a variable that happens to be set in
// the shell running the tests would hide exactly what this is looking for.
const BARE_ENV = { PATH: process.env.PATH, HOME: process.env.HOME };

for (const script of SCRIPTS) {
  test(`${script} starts, and stops with a sentence`, () => {
    const run = spawnSync(process.execPath, [join(root, script)], {
      env: BARE_ENV,
      encoding: "utf8",
      timeout: 30_000,
    });

    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;

    // The failure this is here to catch. A half-applied edit reads a name that
    // was never declared, and the first sign of it is a stack trace.
    assert.ok(
      !/ReferenceError|is not defined|TypeError: Cannot read/.test(output),
      `${script} crashed rather than reporting a problem:\n${output.slice(0, 600)}`,
    );

    // Without a key or an address there is nothing any of these can do, so all
    // of them should say so and stop.
    assert.notEqual(run.status, 0, `${script} exited 0 with nothing configured`);
    assert.ok(output.trim().length > 0, `${script} failed silently`);
  });
}
