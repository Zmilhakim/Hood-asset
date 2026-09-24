import { SHELF_IS_OPEN } from "@/lib/contracts";

/**
 * The line across the top that says this is not live yet.
 *
 * It renders only while there is no launchpad address configured, and it
 * disappears on its own the moment there is one — so it cannot be left up by
 * mistake, and it cannot be taken down early either.
 */
export function PreviewBanner() {
  if (SHELF_IS_OPEN) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <p className="mx-auto max-w-6xl px-4 py-2 text-xs leading-relaxed text-amber-200/90">
        <span className="micro mr-2 font-semibold text-amber-300">Preview</span>
        Clayspad is not deployed. Nothing here can be launched, bought or claimed, and the shelf is empty because there
        is genuinely nothing on it — not because anything is loading.
      </p>
    </div>
  );
}
