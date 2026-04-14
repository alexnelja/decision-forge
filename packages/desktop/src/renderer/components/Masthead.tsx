export function Masthead() {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).toUpperCase();

  return (
    <header className="px-10 pt-6 pb-4 border-b border-paper-rule select-none">
      <div className="flex items-baseline justify-between">
        <div className="meta">VOL. I · № 001</div>
        <div className="eyebrow text-ink-dim">A Thinking Instrument</div>
        <div className="meta">{date}</div>
      </div>
      <div className="rule mt-3 mb-3" />
      <div className="flex items-end justify-between">
        <h1 className="font-display text-[44px] leading-none tracking-tightest text-ink">
          <span style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40' }}>
            Decision&nbsp;Forge
          </span>
        </h1>
        <div className="meta pb-1">THE QUARTERLY</div>
      </div>
    </header>
  );
}
