/** Brand facts that appear in more than one place. */

export const TICKER = "$HPAD";

export const TAGLINE = "Plain tools for launching on Robinhood Chain";

/**
 * The Hood characters whose art lives in public/hood. Ordered the way the
 * landing page lines them up.
 */
export const HOOD_FAMILY = [
  { slug: "pandahood", name: "Pandahood", note: "Ink and patience." },
  { slug: "falconhood", name: "Falconhood", note: "Struck like a badge." },
  { slug: "flickhood", name: "Flickhood", note: "One flame, kept lit." },
  { slug: "foxyhood", name: "Foxyhood", note: "Logged, sighted, gone." },
] as const;
