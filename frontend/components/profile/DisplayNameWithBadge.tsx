export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0 ${className ?? ""}`}
      title="Verified"
      aria-label="Verified"
    >
      ✓
    </span>
  );
}

export function DisplayNameWithBadge({
  name,
  verified,
  highlighted,
  className,
}: {
  name: string;
  verified?: boolean;
  /** Set via DB: users.display_name_highlighted = true */
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 max-w-full ${className ?? ""}`}>
      <span className={`truncate ${highlighted ? "display-name-shimmer font-semibold" : ""}`}>{name}</span>
      {verified && <VerifiedBadge />}
    </span>
  );
}
