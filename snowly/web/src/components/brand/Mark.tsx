/**
 * The mark: a six-armed flake whose arms are struck through by the horizon of
 * packed ice it will end up in. Drawn rather than fetched, so it is crisp at
 * every size and costs no request.
 */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  const arms = [0, 60, 120];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Snowly"
      className={className}
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {arms.map((angle) => (
          <g key={angle} transform={`rotate(${angle} 16 16)`}>
            <line x1="16" y1="4.5" x2="16" y2="27.5" />
            <line x1="16" y1="8.5" x2="12.6" y2="11.4" />
            <line x1="16" y1="8.5" x2="19.4" y2="11.4" />
            <line x1="16" y1="23.5" x2="12.6" y2="20.6" />
            <line x1="16" y1="23.5" x2="19.4" y2="20.6" />
          </g>
        ))}
      </g>
      {/* The glacier line: what the flake is on its way to becoming. */}
      <line x1="3" y1="21.5" x2="29" y2="21.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.28" />
    </svg>
  );
}
