/** Brand facts that appear in more than one place. */

export const TICKER = "$HPAD";

/**
 * The project's X account.
 *
 * Named here rather than inlined because it is a claim about identity: the
 * shorter @hoodpad belongs to someone else, so the site saying which account
 * is real is what lets a reader tell them apart.
 */
export const X_HANDLE = "@gethoodpad";
export const X_URL = "https://x.com/gethoodpad";

/**
 * $HPAD's own launch, posted through the board on 2026-09-16 as notice #1.
 *
 * Written down here because the site claims things about this token that a
 * reader should be able to check without trusting the page: these are the
 * addresses to check them at.
 */
export const HPAD_TOKEN = "0xA3B16698b0dff316dC3214Ab5C2D31DeBcB03096" as const;
export const HPAD_POOL = "0x7261DBa9A5A166db229c3F9A32779d261a7A2349" as const;

/**
 * The wallet that posted the notice, and deployed the board before it.
 *
 * Named because "the team holds nothing" is a balance, not a promise: this is
 * the address to look it up at. It holds no $HPAD, because the launch sent the
 * entire supply into the pool and there was never a transfer out.
 */
export const HPAD_POSTER = "0xA5E1d280EF25B5CD0768deBBaEa2Ee9e0ae56E81" as const;
