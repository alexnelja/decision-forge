import { ReactNode } from "react";

interface ModuleFrameProps {
  section: string;          // e.g. "§ I"
  kicker: string;           // e.g. "Uncertainty"
  title: string;            // headline, e.g. "Monte Carlo"
  accent: string;           // CSS color var
  lede?: string;            // dek / subtitle
  marginalia?: ReactNode;   // right-column notes
  children: ReactNode;
}

export function ModuleFrame({
  section,
  kicker,
  title,
  accent,
  lede,
  marginalia,
  children
}: ModuleFrameProps) {
  return (
    <section className="flex-1 overflow-auto">
      <div className="grid grid-cols-[1fr_220px] gap-10 px-12 py-10 max-w-[1180px]">
        {/* Main column */}
        <article>
          <div className="flex items-center gap-4 mb-6 fade-up">
            <span
              className="font-display text-[13px] tracking-widest2"
              style={{ color: accent }}
            >
              {section}
            </span>
            <span className="rule flex-1 rule-draw" style={{ background: accent, opacity: 0.4 }} />
            <span className="eyebrow" style={{ color: accent }}>{kicker}</span>
          </div>

          <h1
            className="font-display font-light text-[84px] leading-[0.92] tracking-tightest text-ink headline-kinetic"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 320' }}
          >
            {title}
          </h1>

          {lede && (
            <p
              className="mt-8 font-display text-[22px] leading-[1.35] text-ink-dim max-w-[62ch] fade-up fade-up-2"
              style={{ fontVariationSettings: '"opsz" 32, "wght" 350' }}
            >
              {lede}
            </p>
          )}

          <div className="mt-12 fade-up fade-up-3">
            {children}
          </div>
        </article>

        {/* Marginalia column */}
        <aside className="pt-[92px]">
          {marginalia && (
            <div className="fade-up fade-up-4 border-l border-paper-rule pl-5">
              {marginalia}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export function DropCap({ children }: { children: string }) {
  const [first, ...rest] = children;
  return (
    <p
      className="font-display text-[17px] leading-[1.55] text-ink/90 max-w-[62ch]"
      style={{ fontVariationSettings: '"opsz" 18, "wght" 380' }}
    >
      <span
        className="float-left font-display text-[78px] leading-[0.85] mr-2 mt-1 text-ink"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 20, "wght" 500' }}
      >
        {first}
      </span>
      {rest.join("")}
    </p>
  );
}
