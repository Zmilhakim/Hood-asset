// Talking to an explorer that rate-limits.
//
// Blockscout's public instance allows a modest number of calls per minute, and
// verifying four contracts — a status read each, a submission each, then polling
// until each one compiles — is more than that. The first version of this treated
// the 429 as a refusal and gave up, which is wrong twice: it is not a refusal,
// and giving up leaves the source unpublished, which is the one thing this whole
// project asks to be checked on.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long the server asked for, when it says. `Retry-After` is either a number
 * of seconds or an HTTP date, and honouring it beats guessing — a wait that is
 * too short spends another request to be told the same thing, which on a
 * per-minute limit pushes the recovery further away.
 */
export function retryAfterMs(headers) {
  const value = headers?.get?.("retry-after")?.trim();
  if (!value) return null;

  // A bare number is seconds, and it is answered here either way. Falling
  // through to Date.parse on a malformed one is how "-5" quietly became a date
  // in the year 5 BC, a delay in the past, and a retry with no wait at all.
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return seconds >= 0 ? seconds * 1000 : null;
  }

  const when = Date.parse(value);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

/**
 * Runs `attempt` until it answers something other than 429, pausing for as long
 * as the server asks — or, when it does not say, five seconds doubling to two
 * minutes.
 *
 * Every call to the explorer goes through here, reads included. A 429 on a read
 * is the trap worth naming: the status endpoint would answer "not verified",
 * which is indistinguishable from a contract that is still compiling, so the
 * script would spend ten more requests confirming it and then report a verified
 * contract as slow.
 *
 * `log` and `wait` are injectable so the pacing can be tested without spending
 * the minutes it describes.
 */
export async function withBackoff(attempt, label, { log = console.log, wait = sleep, tries = 8 } = {}) {
  for (let attemptNumber = 0; attemptNumber < tries; attemptNumber += 1) {
    const result = await attempt();
    if (result.status !== 429) return result;

    // Nothing follows the last attempt, so pausing after it spends two minutes
    // to arrive at the same answer more slowly.
    if (attemptNumber === tries - 1) break;

    const pause = retryAfterMs(result.headers) ?? Math.min(5_000 * 2 ** attemptNumber, 120_000);
    log(`         ${label}: rate limited, waiting ${Math.round(pause / 1000)}s`);
    await wait(pause);
  }
  return { status: 429, text: `rate limited after ${tries} attempts` };
}
