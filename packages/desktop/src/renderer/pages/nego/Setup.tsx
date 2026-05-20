import { useState } from "react";
import type {
  NegoConfig,
  NegoSeat,
  NegoIssue,
  NegoPersona,
  BatnaMCRef
} from "@decision-forge/core";
import { BatnaPicker } from "./BatnaPicker";
import { useLatestMCVariables } from "../../lib/mc-store";
import { variablePercentile } from "../../lib/mc-percentile";

function isMCRef(v: unknown): v is BatnaMCRef {
  return typeof v === "object" && v !== null && "refMCVar" in (v as object);
}

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
          model: "gemini-2.5-pro"
        }
      }
    ],
    maxRounds: 10,
    discountFactor: 0.95,
    acceptanceThreshold: 0.05,
    walkAway: true
  };
}

function rebalanceUtility(seats: NegoSeat[], issues: NegoIssue[]): NegoSeat[] {
  // Keep each seat's utilityFn in sync with the current issues list —
  // preserve weights where the issue name still exists, uniform-fill new ones,
  // drop rows for removed issues, then normalise to sum 1.
  const names = issues.map((i) => i.name);
  return seats.map((seat) => {
    const old = Object.fromEntries(seat.private.utilityFn.map((r) => [r.issue, r]));
    const rows = names.map((name) => {
      const existing = old[name];
      if (existing) return existing;
      return { issue: name, weight: 1 / Math.max(1, names.length), shape: "linear" as const };
    });
    const total = rows.reduce((a, r) => a + r.weight, 0) || 1;
    const normalised = rows.map((r) => ({ ...r, weight: r.weight / total }));
    return {
      ...seat,
      private: { ...seat.private, utilityFn: normalised }
    };
  });
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

function IssueRow({
  issue,
  index,
  onChange,
  onRemove,
  removable
}: {
  issue: NegoIssue;
  index: number;
  onChange: (patch: Partial<NegoIssue>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="specimen relative grid grid-cols-[1fr_auto_auto_auto_auto] items-end gap-4 px-5 py-5">
      <div className="absolute left-4 top-3 flex items-baseline gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-ink-dim">
        <span>{String.fromCharCode(97 + index)}</span>
        <span className="text-ink-faint">·</span>
        <span>{issue.type}</span>
      </div>
      {removable && (
        <button
          type="button"
          aria-label="Remove issue"
          onClick={onRemove}
          className="absolute right-3 top-2 h-6 w-6 font-display text-[18px] leading-none text-ink-faint hover:text-ink"
        >
          ×
        </button>
      )}
      <div className="mt-4">
        <label className="eyebrow mb-1 block">Name</label>
        <input
          value={issue.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full border-0 bg-transparent font-display text-[22px] italic text-ink focus:outline-none"
          style={{ fontVariationSettings: '"opsz" 28, "wght" 380' }}
        />
      </div>
      <div className="mt-4">
        <label className="eyebrow mb-1 block">Kind</label>
        <select
          value={issue.type}
          onChange={(e) => {
            const t = e.target.value as "continuous" | "discrete";
            if (t === "continuous") {
              onChange({ type: "continuous", range: issue.range ?? [0, 100], options: undefined });
            } else {
              onChange({ type: "discrete", options: issue.options ?? ["option_a", "option_b"], range: undefined });
            }
          }}
          className="border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
        >
          <option value="continuous">continuous</option>
          <option value="discrete">discrete</option>
        </select>
      </div>
      {issue.type === "continuous" ? (
        <>
          <div className="mt-4">
            <label className="eyebrow mb-1 block">Min</label>
            <input
              type="number"
              value={issue.range?.[0] ?? 0}
              onChange={(e) =>
                onChange({ range: [parseFloat(e.target.value) || 0, issue.range?.[1] ?? 1] })
              }
              className="w-24 border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[13px] tabular-nums text-ink focus:outline-none"
            />
          </div>
          <div className="mt-4">
            <label className="eyebrow mb-1 block">Max</label>
            <input
              type="number"
              value={issue.range?.[1] ?? 1}
              onChange={(e) =>
                onChange({ range: [issue.range?.[0] ?? 0, parseFloat(e.target.value) || 1] })
              }
              className="w-24 border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[13px] tabular-nums text-ink focus:outline-none"
            />
          </div>
          <div className="mt-4">
            <label className="eyebrow mb-1 block">Weight</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={issue.yourWeight}
              onChange={(e) => onChange({ yourWeight: parseFloat(e.target.value) || 0 })}
              className="w-20 border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[13px] tabular-nums text-ink focus:outline-none"
            />
          </div>
        </>
      ) : (
        <div className="col-span-3 mt-4">
          <label className="eyebrow mb-1 block">Options (comma-separated)</label>
          <input
            value={(issue.options ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                options: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
            className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-mono text-[13px] text-ink focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

export function Setup({
  onLaunch
}: {
  onLaunch: (cfg: NegoConfig, mcSamples?: Record<string, number>) => void;
}) {
  const [config, setConfig] = useState<NegoConfig>(defaultConfig);
  const mcVariables = useLatestMCVariables();

  function resolveMCSamples(cfg: NegoConfig): Record<string, number> {
    const out: Record<string, number> = {};
    for (const seat of cfg.seats) {
      const b = seat.private.batna;
      if (isMCRef(b)) {
        const v = mcVariables.find((x) => x.name === b.refMCVar);
        if (v) out[b.refMCVar] = variablePercentile(v, b.percentile);
      }
    }
    return out;
  }

  function updateIssue(index: number, patch: Partial<NegoIssue>) {
    setConfig((prev) => {
      const nextIssues = prev.issues.map((i, k) =>
        k === index ? ({ ...i, ...patch } as NegoIssue) : i
      );
      const nextSeats = rebalanceUtility(prev.seats, nextIssues);
      return { ...prev, issues: nextIssues, seats: nextSeats };
    });
  }

  function addIssue() {
    setConfig((prev) => {
      const name = `issue_${prev.issues.length + 1}`;
      const nextIssues: NegoIssue[] = [
        ...prev.issues,
        {
          name,
          type: "continuous",
          range: [0, 100],
          yourWeight: 1 / (prev.issues.length + 1)
        }
      ];
      const nextSeats = rebalanceUtility(prev.seats, nextIssues);
      return { ...prev, issues: nextIssues, seats: nextSeats };
    });
  }

  function removeIssue(index: number) {
    setConfig((prev) => {
      if (prev.issues.length <= 1) return prev;
      const nextIssues = prev.issues.filter((_, k) => k !== index);
      const nextSeats = rebalanceUtility(prev.seats, nextIssues);
      return { ...prev, issues: nextIssues, seats: nextSeats };
    });
  }

  function updateSeat(index: number, patch: Partial<NegoSeat>) {
    setConfig((prev) => ({
      ...prev,
      seats: prev.seats.map((s, k) => (k === index ? ({ ...s, ...patch } as NegoSeat) : s))
    }));
  }

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
          Declare the issues in contention. One, or several. Continuous bounds or a
          short list of choices.
        </p>

        <div className="mt-6 space-y-4">
          {config.issues.map((issue, i) => (
            <IssueRow
              key={i}
              issue={issue}
              index={i}
              removable={config.issues.length > 1}
              onChange={(patch) => updateIssue(i, patch)}
              onRemove={() => removeIssue(i)}
            />
          ))}
          <button
            type="button"
            onClick={addIssue}
            className="w-full border border-dashed border-ink-faint/60 bg-transparent px-4 py-3 text-left font-display italic text-[14px] text-ink-dim hover:border-ink hover:text-ink"
            style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
          >
            <span className="font-mono text-[11px] not-italic tracking-[0.2em] text-ink-faint">+</span>{" "}
            Append an issue
          </button>
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
              <BatnaPicker
                value={buyer.private.batna}
                onChange={(v) =>
                  updateSeat(0, { private: { ...buyer.private, batna: v } })
                }
              />

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
                    className={`font-display text-[12px] italic ${
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
                  value={supplier.persona?.model ?? "gemini-2.5-pro"}
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
                  <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (cheap)</option>
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
          onClick={() => {
            const mcSamples = resolveMCSamples(config);
            onLaunch(
              config,
              Object.keys(mcSamples).length > 0 ? mcSamples : undefined
            );
          }}
          className="border px-8 py-4 font-display text-[16px] tracking-[0.3em]"
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
