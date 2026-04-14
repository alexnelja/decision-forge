import { useEffect, useMemo, useState } from "react";
import type { NegoSessionState, NegoIssue } from "@decision-forge/core";
import { negoApi, type NegoDebrief } from "../../lib/nego-api";

function displayValue(v: number | string): string {
  if (typeof v === "number") {
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return v;
}

function TranscriptLine({
  seatLabel,
  kind,
  speech,
  terms
}: {
  seatLabel: string;
  kind: string;
  speech?: string;
  terms?: Record<string, number | string>;
}) {
  const accent = "var(--sec-nego)";
  return (
    <div className="group border-l border-ink-faint pl-6 py-2 transition-colors hover:border-[color:var(--sec-nego)]">
      <div className="eyebrow" style={{ color: accent, letterSpacing: "0.3em" }}>
        {seatLabel} — {kind}
      </div>
      {terms && (
        <div className="mt-1 font-mono text-[12px] text-ink-dim">
          [{Object.entries(terms).map(([k, v]) => `${k} = ${displayValue(v)}`).join(", ")}]
        </div>
      )}
      {speech && (
        <p
          className="mt-2 font-display text-[17px] italic leading-[1.5] text-ink"
          style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
        >
          &ldquo;{speech}&rdquo;
        </p>
      )}
    </div>
  );
}

function getSeat(state: NegoSessionState, id: string) {
  return state.config.seats.find((s) => s.id === id);
}

function computePosition(issue: NegoIssue, value: number): string {
  const [lo, hi] = issue.range ?? [0, 1];
  if (hi === lo) return "50%";
  const pct = ((value - lo) / (hi - lo)) * 100;
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export function SessionView({
  state,
  onUpdate,
  onFinished
}: {
  state: NegoSessionState;
  onUpdate: (s: NegoSessionState) => void;
  onFinished: (s: NegoSessionState) => void;
}) {
  const currentSeat = getSeat(state, state.currentSeatId);
  const yourTurn = currentSeat?.controlledBy === "you";
  const yourSeatId =
    state.config.seats.find((s) => s.controlledBy === "you")?.id ?? state.currentSeatId;
  const issue = state.config.issues[0];
  const [offerValue, setOfferValue] = useState<number>(() => {
    const mid = (issue.range?.[0] ?? 0) + ((issue.range?.[1] ?? 1) - (issue.range?.[0] ?? 0)) / 2;
    return mid;
  });
  const [speech, setSpeech] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastOffer = useMemo(() => {
    for (let i = state.transcript.length - 1; i >= 0; i--) {
      const a = state.transcript[i].action;
      if (a.kind === "offer") return a.offer;
    }
    return null;
  }, [state]);

  useEffect(() => {
    if (state.outcome !== "active") {
      onFinished(state);
    }
  }, [state, onFinished]);

  async function submit(
    action:
      | { kind: "offer"; value: number; speech: string }
      | { kind: "accept" | "reject" | "walk"; speech: string }
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let payload: Parameters<typeof negoApi.action>[1];
      if (action.kind === "offer") {
        payload = {
          kind: "offer",
          offer: {
            seatId: yourSeatId,
            roundIndex: state.roundIndex,
            terms: { [issue.name]: action.value }
          },
          speech: action.speech || undefined
        } as unknown as Parameters<typeof negoApi.action>[1];
      } else if (action.kind === "accept") {
        payload = {
          kind: "accept",
          seatId: yourSeatId,
          offerRef: "",
          speech: action.speech || "I'll take it."
        } as unknown as Parameters<typeof negoApi.action>[1];
      } else if (action.kind === "reject") {
        payload = {
          kind: "reject",
          seatId: yourSeatId,
          offerRef: "",
          speech: action.speech || "Not yet."
        } as unknown as Parameters<typeof negoApi.action>[1];
      } else {
        payload = {
          kind: "walk",
          seatId: yourSeatId,
          speech: action.speech || "I'll walk."
        } as unknown as Parameters<typeof negoApi.action>[1];
      }
      const updated = await negoApi.action(state.id, payload);
      setSpeech("");
      onUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const [lo, hi] = issue.range ?? [0, 1];

  return (
    <div className="grid grid-cols-[1fr_360px] gap-10">
      {/* Script column */}
      <div className="space-y-6">
        <div className="flex items-baseline gap-4 border-b border-ink-faint pb-2">
          <span
            className="font-display italic text-[14px]"
            style={{ color: "var(--sec-nego)", fontVariationSettings: '"opsz" 14, "wght" 400' }}
          >
            Act {toRoman(state.roundIndex + 1)} · Scene {state.transcript.length + 1}
          </span>
          <span className="rule flex-1" style={{ background: "var(--sec-nego)", opacity: 0.3 }} />
          <span className="eyebrow">
            At stage:{" "}
            <span className="text-ink">{currentSeat?.label ?? "—"}</span>
          </span>
        </div>

        {state.transcript.length === 0 && (
          <p
            className="font-display italic text-[18px] leading-[1.6] text-ink-dim"
            style={{ fontVariationSettings: '"opsz" 20, "wght" 360' }}
          >
            (The stage is set. The curtain rises on silence. {currentSeat?.label} speaks first.)
          </p>
        )}

        <div className="space-y-3">
          {state.transcript.map((entry, i) => {
            const a = entry.action;
            const sid =
              a.kind === "offer"
                ? a.offer.seatId
                : "seatId" in a
                ? (a as { seatId: string }).seatId
                : "?";
            const seat = getSeat(state, sid);
            const label = seat?.label ?? sid;
            return (
              <TranscriptLine
                key={i}
                seatLabel={label}
                kind={a.kind}
                speech={entry.speech}
                terms={a.kind === "offer" ? a.offer.terms : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Action / marginalia column */}
      <aside className="space-y-6 pl-6 border-l border-ink-faint">
        {/* ZOPA bar — visualises range and last offer */}
        <div>
          <div className="eyebrow mb-2">Range</div>
          <div className="relative h-[46px] border-b border-ink-faint">
            <div
              className="absolute left-0 right-0 top-1/2 h-px"
              style={{ background: "var(--sec-nego)", opacity: 0.4 }}
            />
            {lastOffer && typeof lastOffer.terms[issue.name] === "number" && (
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: computePosition(issue, lastOffer.terms[issue.name] as number) }}
              >
                <span className="block h-3 w-3 rounded-full" style={{ background: "var(--sec-nego)" }} />
                <span className="mt-1 block font-mono text-[10px] text-ink-dim tabular-nums">
                  {displayValue(lastOffer.terms[issue.name])}
                </span>
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint tabular-nums">
            <span>{displayValue(lo)}</span>
            <span>{displayValue(hi)}</span>
          </div>
        </div>

        {/* Your action */}
        {yourTurn ? (
          <div className="slip space-y-4 px-5 py-6">
            <div>
              <div className="eyebrow mb-1">Your move</div>
              <h3
                className="font-display italic text-[22px] leading-tight text-ink"
                style={{ fontVariationSettings: '"opsz" 28, "wght" 380' }}
              >
                What do you offer?
              </h3>
            </div>

            <div>
              <label htmlFor="offer-val" className="eyebrow mb-1 block">
                {issue.name}
              </label>
              <input
                id="offer-val"
                type="number"
                value={offerValue}
                min={lo}
                max={hi}
                step={(hi - lo) / 100 || 1}
                onChange={(e) => setOfferValue(parseFloat(e.target.value) || 0)}
                className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-display text-[32px] tabular-nums text-ink focus:border-ink focus:outline-none"
                style={{ fontVariationSettings: '"opsz" 40, "wght" 320' }}
              />
              <input
                type="range"
                value={offerValue}
                min={lo}
                max={hi}
                step={(hi - lo) / 200 || 1}
                onChange={(e) => setOfferValue(parseFloat(e.target.value))}
                className="mt-2 w-full"
                style={{ accentColor: "var(--sec-nego)" }}
              />
            </div>

            <div>
              <label htmlFor="speech" className="eyebrow mb-1 block">What you say</label>
              <textarea
                id="speech"
                value={speech}
                onChange={(e) => setSpeech(e.target.value)}
                rows={2}
                placeholder="Optional line…"
                className="w-full resize-none border-0 border-b border-ink-faint bg-transparent pb-1 font-display italic text-[14px] leading-snug text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => submit({ kind: "offer", value: offerValue, speech })}
                disabled={busy}
                className="border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-paper"
                style={{ borderColor: "var(--sec-nego)", background: "var(--sec-nego)" }}
              >
                Offer
              </button>
              <button
                type="button"
                onClick={() => submit({ kind: "accept", speech })}
                disabled={busy || !lastOffer || lastOffer.seatId === yourSeatId}
                className="border border-ink bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => submit({ kind: "reject", speech })}
                disabled={busy || !lastOffer}
                className="border border-ink-faint bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim hover:border-ink hover:text-ink disabled:opacity-40"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => submit({ kind: "walk", speech })}
                disabled={busy}
                className="border border-ink-faint bg-transparent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim hover:border-ink hover:text-ink"
              >
                Walk
              </button>
            </div>
            {error && (
              <div
                className="border-l-2 bg-[color:var(--sec-nego)]/5 px-3 py-2"
                style={{ borderColor: "var(--sec-nego)" }}
              >
                <div className="eyebrow" style={{ color: "var(--sec-nego)" }}>
                  The line stalls
                </div>
                <p
                  className="mt-1 font-display italic text-[13px] leading-snug text-ink"
                  style={{ fontVariationSettings: '"opsz" 14, "wght" 380' }}
                >
                  {error.replace(/^Error invoking remote method '[^']+': Error:\s*/, "").replace(/^upstream:\s*/, "")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-ink-faint px-5 py-4">
            <div className="eyebrow mb-1">Awaiting</div>
            <p
              className="font-display italic text-[16px] text-ink running"
              style={{ fontVariationSettings: '"opsz" 18, "wght" 380' }}
            >
              {currentSeat?.label} thinks
            </p>
          </div>
        )}

        <div className="rule" />

        <div>
          <div className="eyebrow mb-2">Round</div>
          <div className="flex items-baseline justify-between font-mono text-[11px] text-ink-dim">
            <span>{state.roundIndex + 1} / {state.config.maxRounds}</span>
            <span>discount {state.config.discountFactor}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];
  let out = "";
  let remaining = n;
  for (const [v, s] of map) {
    while (remaining >= v) {
      out += s;
      remaining -= v;
    }
  }
  return out;
}

/* ———————————————————————————————
 * Debrief — final curtain
 * ——————————————————————————————— */

export function Debrief({
  state,
  debrief,
  onAgain
}: {
  state: NegoSessionState;
  debrief: NegoDebrief;
  onAgain: () => void;
}) {
  const outcomeHeadline: Record<string, string> = {
    deal: "A handshake.",
    walked: "The chair scrapes back.",
    "rounds-exhausted": "The clock ran out.",
    active: "—"
  };

  const seats = state.config.seats;

  return (
    <div className="space-y-10">
      <div>
        <div className="eyebrow" style={{ color: "var(--sec-nego)" }}>Final curtain</div>
        <h2
          className="mt-3 font-display text-[56px] italic leading-[0.96] text-ink"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40, "wght" 300', letterSpacing: "-0.03em" }}
        >
          {outcomeHeadline[debrief.outcome] ?? "—"}
        </h2>
        {debrief.dealTerms && (
          <p
            className="mt-4 font-display italic text-[22px] leading-[1.45] text-ink-dim"
            style={{ fontVariationSettings: '"opsz" 24, "wght" 360' }}
          >
            Terms:{" "}
            {Object.entries(debrief.dealTerms).map(([k, v]) => (
              <span key={k} className="text-ink">
                {k} = {displayValue(v)}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-10 border-t border-paper-rule pt-6">
        {seats.map((seat) => {
          const u = debrief.utilities[seat.id];
          return (
            <div key={seat.id}>
              <div className="eyebrow mb-2">{seat.label}</div>
              <div
                className="numeral text-[72px]"
                style={{ color: "var(--sec-nego)" }}
              >
                {u ? (u.utility * 100).toFixed(0) : "—"}
                <span className="ml-1 font-mono text-[16px] text-ink-dim align-top">u</span>
              </div>
              <div className="meta mt-1">
                BATNA reference: {u ? displayValue(u.batna) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {debrief.nashRef && (
        <div className="border-t border-paper-rule pt-6">
          <div className="eyebrow mb-1">Nash bargaining reference</div>
          <p
            className="font-display italic text-[18px] text-ink-dim"
            style={{ fontVariationSettings: '"opsz" 20, "wght" 360' }}
          >
            Equal-gain target utility ≈ {(debrief.nashRef.equalGainTarget * 100).toFixed(0)}. Compare to
            where you actually landed.
          </p>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={onAgain}
          className="border border-ink bg-transparent px-6 py-3 font-mono text-[11px] uppercase tracking-[0.28em] text-ink hover:bg-ink hover:text-paper"
        >
          Another round
        </button>
      </div>
    </div>
  );
}
