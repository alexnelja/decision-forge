import { NavLink } from "react-router-dom";
import { DropCap } from "../components/ModuleFrame";

const toc = [
  {
    to: "/mc",
    roman: "I",
    kicker: "Uncertainty",
    title: "Monte Carlo",
    dek: "A simulator for decisions whose outcomes cannot be known, only bounded. Draw distributions, run thousands of trials, read the shape of the possible.",
    folio: "p. 03",
    accent: "var(--sec-mc)",
    status: "Plan 3"
  },
  {
    to: "/negotiation",
    roman: "II",
    kicker: "Rehearsal",
    title: "Negotiation",
    dek: "A dojo for difficult conversations. Practice against a counterparty tuned to your scenario. Replay the transcript. Learn the tells you leak when the stakes are real.",
    folio: "p. 17",
    accent: "var(--sec-nego)",
    status: "Plan 4"
  },
  {
    to: "/forecast",
    roman: "III",
    kicker: "Calibration",
    title: "Forecast",
    dek: "A journal for the predictions you make, and the scoring that tells you, eventually, whether your confidence was earned or borrowed.",
    folio: "p. 31",
    accent: "var(--sec-forecast)",
    status: "Plan 2"
  }
];

export default function Home() {
  return (
    <section className="flex-1 overflow-auto">
      <div className="px-12 py-10 max-w-[1180px]">
        <div className="flex items-center gap-4 mb-8 fade-up">
          <span className="eyebrow">In&nbsp;this&nbsp;issue</span>
          <span className="rule flex-1 rule-draw" />
          <span className="meta">THREE SECTIONS</span>
        </div>

        <h2
          className="font-display text-[96px] leading-[0.9] tracking-tightest text-ink headline-kinetic max-w-[14ch]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60, "wght" 300' }}
        >
          A gym for<br />
          <em className="not-italic" style={{ color: "var(--sec-mc)" }}>consequential</em><br />
          thinking.
        </h2>

        <div className="mt-12 mb-16 max-w-[56ch] fade-up fade-up-2">
          <DropCap>
            {
              "Three instruments, one desk. Monte Carlo for the futures you cannot predict. Negotiation for the conversations that decide them. Forecast for the judgements you must calibrate in order to trust your own. Open a section."
            }
          </DropCap>
        </div>

        <div className="rule mb-10 rule-draw" />

        <ol className="space-y-0">
          {toc.map((item, i) => (
            <li key={item.to} className={`fade-up fade-up-${Math.min(i + 2, 4)}`}>
              <NavLink
                to={item.to}
                className="group block py-8 border-t border-paper-rule focus-ring"
              >
                <div className="grid grid-cols-[56px_1fr_160px_80px] gap-6 items-start">
                  <div>
                    <div
                      className="font-display text-[44px] leading-none tracking-tighter transition-colors"
                      style={{
                        color: "var(--ink-faint)",
                        fontVariationSettings: '"opsz" 144, "wght" 300'
                      }}
                    >
                      <span className="group-hover:hidden">{item.roman}</span>
                      <span
                        className="hidden group-hover:inline"
                        style={{ color: item.accent }}
                      >
                        {item.roman}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow mb-2" style={{ color: item.accent }}>
                      § {item.roman} &nbsp;·&nbsp; {item.kicker}
                    </div>
                    <h3
                      className="font-display text-[40px] leading-none tracking-tight text-ink transition-transform duration-300 group-hover:translate-x-1"
                      style={{ fontVariationSettings: '"opsz" 80, "SOFT" 30, "wght" 380' }}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="mt-3 font-display text-[16px] leading-[1.45] text-ink-dim max-w-[60ch]"
                      style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
                    >
                      {item.dek}
                    </p>
                  </div>
                  <div className="pt-2">
                    <div className="meta">STATUS</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: item.accent }}
                      />
                      <span className="font-mono text-[11px] text-ink">{item.status}</span>
                    </div>
                  </div>
                  <div className="text-right pt-2">
                    <div className="meta">FOLIO</div>
                    <div
                      className="font-mono text-[12px] text-ink-dim mt-1 group-hover:text-ink transition-colors"
                    >
                      {item.folio} →
                    </div>
                  </div>
                </div>
              </NavLink>
            </li>
          ))}
          <li className="border-t border-paper-rule" />
        </ol>

        <div className="mt-16 grid grid-cols-3 gap-10 text-ink-dim">
          <div>
            <div className="eyebrow mb-2">Colophon</div>
            <p className="font-display text-[13px] leading-[1.55]" style={{ fontVariationSettings: '"opsz" 14' }}>
              Set in Fraunces &amp; IBM Plex. Bound in Electron. Math by FastAPI sidecar.
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Editorial</div>
            <p className="font-display text-[13px] leading-[1.55]" style={{ fontVariationSettings: '"opsz" 14' }}>
              A private quarterly. Circulation: one.
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Next issue</div>
            <p className="font-display text-[13px] leading-[1.55]" style={{ fontVariationSettings: '"opsz" 14' }}>
              When the forecast column has a hundred entries.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
