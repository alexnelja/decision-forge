import { useState } from "react";
import type {
  NegoConfig,
  NegoSeat,
  NegoIssue,
  NegoPersona
} from "@decision-forge/core";

const STYLES: Array<NegoPersona["style"]> = [
  "hardball",
  "collaborative",
  "risk-averse",
  "analytical",
  "emotional"
];

function defaultConfig(): NegoConfig {
  return {
    issues: [
      {
        name: "price_per_ton",
        type: "continuous",
        range: [100, 200],
        yourWeight: 0.8
      }
    ],
    seats: [
      {
        id: "buyer",
        label: "Buyer",
        controlledBy: "you",
        private: {
          batna: 180,
          reservationPrice: 175,
          utilityFn: [{ issue: "price_per_ton", weight: 1.0, shape: "linear" }],
          info: "Backup supplier at 180/ton."
        }
      },
      {
        id: "supplier",
        label: "Supplier",
        controlledBy: "ai",
        private: {
          batna: 150,
          reservationPrice: 140,
          utilityFn: [{ issue: "price_per_ton", weight: 1.0, shape: "linear" }],
          info: "Production cost 120/ton; one other buyer in the wings."
        },
        persona: {
          style: "collaborative",
          patience: 0.6,
          deceptiveness: 0.2,
          model: "claude-sonnet-4-6"
        }
      }
    ],
    maxRounds: 10,
    discountFactor: 0.95,
    acceptanceThreshold: 0.05,
    walkAway: true
  };
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="meta tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full"
        style={{ accentColor: "var(--sec-nego)" }}
      />
    </div>
  );
}

export function Setup({ onLaunch }: { onLaunch: (cfg: NegoConfig) => void }) {
  const [config, setConfig] = useState<NegoConfig>(defaultConfig);

  function updateIssue(index: number, patch: Partial<NegoIssue>) {
    setConfig((prev) => ({
      ...prev,
      issues: prev.issues.map((i, k) => (k === index ? ({ ...i, ...patch } as NegoIssue) : i))
    }));
  }

  function updateSeat(index: number, patch: Partial<NegoSeat>) {
    setConfig((prev) => ({
      ...prev,
      seats: prev.seats.map((s, k) => (k === index ? ({ ...s, ...patch } as NegoSeat) : s))
    }));
  }

  const issue = config.issues[0];
  const buyer = config.seats[0];
  const supplier = config.seats[1];

  return (
    <div className="space-y-10">
      {/* Act I — Setting */}
      <section>
        <div className="mb-5 flex items-baseline gap-4">
          <span
            className="font-display italic text-[14px]"
            style={{ color: "var(--sec-nego)", fontVariationSettings: '"opsz" 14, "wght" 400' }}
          >
            Act I
          </span>
          <span className="rule flex-1" style={{ background: "var(--sec-nego)", opacity: 0.3 }} />
          <span className="eyebrow" style={{ color: "var(--sec-nego)" }}>The setting</span>
        </div>
        <p
          className="font-display italic text-[17px] leading-[1.5] text-ink-dim"
          style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
        >
          A single issue in contention. Draw the range. Declare the stakes.
        </p>

        <div className="mt-6 grid grid-cols-[1fr_auto_auto] gap-6 border-b border-ink-faint pb-4">
          <div>
            <label htmlFor="iss-name" className="eyebrow mb-1 block">Issue</label>
            <input
              id="iss-name"
              value={issue.name}
              onChange={(e) => updateIssue(0, { name: e.target.value })}
              className="w-full border-0 bg-transparent font-display text-[24px] italic text-ink focus:outline-none"
              style={{ fontVariationSettings: '"opsz" 32, "wght" 380' }}
            />
          </div>
          <div>
            <label htmlFor="iss-lo" className="eyebrow mb-1 block">Min</label>
            <input
              id="iss-lo"
              type="number"
              value={issue.range?.[0] ?? 0}
              onChange={(e) =>
                updateIssue(0, {
                  range: [parseFloat(e.target.value) || 0, issue.range?.[1] ?? 1]
                })
              }
              className="w-24 border-0 bg-transparent pb-1 font-mono text-[15px] tabular-nums text-ink focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="iss-hi" className="eyebrow mb-1 block">Max</label>
            <input
              id="iss-hi"
              type="number"
              value={issue.range?.[1] ?? 1}
              onChange={(e) =>
                updateIssue(0, {
                  range: [issue.range?.[0] ?? 0, parseFloat(e.target.value) || 1]
                })
              }
              className="w-24 border-0 bg-transparent pb-1 font-mono text-[15px] tabular-nums text-ink focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Act II — Dramatis Personae */}
      <section>
        <div className="mb-5 flex items-baseline gap-4">
          <span
            className="font-display italic text-[14px]"
            style={{ color: "var(--sec-nego)", fontVariationSettings: '"opsz" 14, "wght" 400' }}
          >
            Act II
          </span>
          <span className="rule flex-1" style={{ background: "var(--sec-nego)", opacity: 0.3 }} />
          <span className="eyebrow" style={{ color: "var(--sec-nego)" }}>Dramatis personae</span>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* You */}
          <div className="specimen px-6 py-7">
            <div className="eyebrow mb-2">You</div>
            <input
              value={buyer.label}
              onChange={(e) => updateSeat(0, { label: e.target.value })}
              className="w-full border-0 bg-transparent font-display text-[32px] italic leading-none text-ink focus:outline-none"
              style={{ fontVariationSettings: '"opsz" 56, "SOFT" 20, "wght" 360' }}
            />
            <div className="mt-5 space-y-4">
              <div>
                <label className="eyebrow mb-1 block">BATNA</label>
                <input
                  type="number"
                  value={buyer.private.batna as number}
                  onChange={(e) =>
                    updateSeat(0, {
                      private: { ...buyer.private, batna: parseFloat(e.target.value) || 0 }
                    })
                  }
                  className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[16px] tabular-nums text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="eyebrow mb-1 block">Reservation</label>
                <input
                  type="number"
                  value={buyer.private.reservationPrice}
                  onChange={(e) =>
                    updateSeat(0, {
                      private: { ...buyer.private, reservationPrice: parseFloat(e.target.value) || 0 }
                    })
                  }
                  className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[16px] tabular-nums text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="eyebrow mb-1 block">Private intel</label>
                <textarea
                  value={buyer.private.info}
                  rows={2}
                  onChange={(e) =>
                    updateSeat(0, {
                      private: { ...buyer.private, info: e.target.value }
                    })
                  }
                  className="w-full resize-none border-0 border-b border-ink-faint bg-transparent pb-1 font-display italic text-[14px] leading-snug text-ink focus:border-ink focus:outline-none"
                  style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
                />
              </div>
            </div>
          </div>

          {/* AI */}
          <div className="specimen px-6 py-7">
            <div className="eyebrow mb-2">Opposite number</div>
            <input
              value={supplier.label}
              onChange={(e) => updateSeat(1, { label: e.target.value })}
              className="w-full border-0 bg-transparent font-display text-[32px] italic leading-none text-ink focus:outline-none"
              style={{ fontVariationSettings: '"opsz" 56, "SOFT" 20, "wght" 360' }}
            />

            {/* Persona picker */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
              {STYLES.map((style) => {
                const active = supplier.persona?.style === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() =>
                      updateSeat(1, {
                        persona: { ...(supplier.persona as NegoPersona), style }
                      })
                    }
                    className={`font-display text-[12px] italic transition-colors ${
                      active ? "text-ink" : "text-ink-faint hover:text-ink-dim"
                    }`}
                    style={{
                      fontVariationSettings: '"opsz" 14, "wght" 380',
                      textDecoration: active ? "underline" : "none",
                      textUnderlineOffset: "3px"
                    }}
                  >
                    {style}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-4">
              <Slider
                label="Patience"
                value={supplier.persona?.patience ?? 0.5}
                onChange={(v) =>
                  updateSeat(1, {
                    persona: { ...(supplier.persona as NegoPersona), patience: v }
                  })
                }
              />
              <Slider
                label="Deceptiveness"
                value={supplier.persona?.deceptiveness ?? 0.3}
                onChange={(v) =>
                  updateSeat(1, {
                    persona: { ...(supplier.persona as NegoPersona), deceptiveness: v }
                  })
                }
              />
              <div>
                <label className="eyebrow mb-1 block">Private intel (hidden from you)</label>
                <textarea
                  value={supplier.private.info}
                  rows={2}
                  onChange={(e) =>
                    updateSeat(1, {
                      private: { ...supplier.private, info: e.target.value }
                    })
                  }
                  className="w-full resize-none border-0 border-b border-ink-faint bg-transparent pb-1 font-display italic text-[14px] leading-snug text-ink focus:border-ink focus:outline-none"
                  style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
                />
              </div>
              <div>
                <label className="eyebrow mb-1 block">Model</label>
                <select
                  value={supplier.persona?.model ?? "claude-sonnet-4-6"}
                  onChange={(e) =>
                    updateSeat(1, {
                      persona: {
                        ...(supplier.persona as NegoPersona),
                        model: e.target.value as NegoPersona["model"]
                      }
                    })
                  }
                  className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
                >
                  <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                  <option value="claude-haiku-4-5">claude-haiku-4-5 (cheap)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Act III — Rules */}
      <section>
        <div className="mb-5 flex items-baseline gap-4">
          <span
            className="font-display italic text-[14px]"
            style={{ color: "var(--sec-nego)", fontVariationSettings: '"opsz" 14, "wght" 400' }}
          >
            Act III
          </span>
          <span className="rule flex-1" style={{ background: "var(--sec-nego)", opacity: 0.3 }} />
          <span className="eyebrow" style={{ color: "var(--sec-nego)" }}>The rules</span>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div>
            <label htmlFor="max-rounds" className="eyebrow mb-1 block">Max rounds</label>
            <input
              id="max-rounds"
              type="number"
              min={1}
              max={50}
              value={config.maxRounds}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, maxRounds: parseInt(e.target.value, 10) || 10 }))
              }
              className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-display text-[22px] tabular-nums text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="discount" className="eyebrow mb-1 block">Discount / round</label>
            <input
              id="discount"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={config.discountFactor}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  discountFactor: parseFloat(e.target.value) || 0.95
                }))
              }
              className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-display text-[22px] tabular-nums text-ink focus:border-ink focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="accept-thresh" className="eyebrow mb-1 block">Accept threshold</label>
            <input
              id="accept-thresh"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={config.acceptanceThreshold}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  acceptanceThreshold: parseFloat(e.target.value) || 0.05
                }))
              }
              className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-display text-[22px] tabular-nums text-ink focus:border-ink focus:outline-none"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={() => onLaunch(config)}
          className="border px-8 py-4 font-display text-[16px] tracking-[0.3em] transition-all"
          style={{
            borderColor: "var(--sec-nego)",
            background: "var(--sec-nego)",
            color: "var(--paper)",
            fontVariationSettings: '"opsz" 20, "wght" 500'
          }}
        >
          BEGIN
        </button>
      </div>
    </div>
  );
}
