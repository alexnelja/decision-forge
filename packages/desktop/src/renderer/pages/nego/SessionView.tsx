import { useEffect, useMemo, useState } from "react";
import type {
  NegoSessionState,
  NegoIssue,
  NegoAction,
  NegoTranscriptEntry
} from "@decision-forge/core";
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
  terms,
  dim
}: {
  seatLabel: string;
  kind: string;
  speech?: string;
  terms?: Record<string, number | string>;
  dim?: boolean;
}) {
  const accent = "var(--sec-nego)";
  return (
    <div
      className={`border-l py-2 pl-6 ${
        dim ? "border-ink-faint opacity-40" : "border-ink-faint hover:border-[color:var(--sec-nego)]"
      }`}
    >
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

function initialTerms(issues: NegoIssue[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const issue of issues) {
    if (issue.type === "continuous") {
      const [lo, hi] = issue.range ?? [0, 1];
      out[issue.name] = lo + (hi - lo) / 2;
    } else {
      out[issue.name] = issue.options?.[0] ?? "";
    }
  }
  return out;
}

function IssueInput({
  issue,
  value,
  onChange
}: {
  issue: NegoIssue;
  value: number | string;
  onChange: (v: number | string) => void;
}) {
  if (issue.type === "continuous") {
    const [lo, hi] = issue.range ?? [0, 1];
    const num = typeof value === "number" ? value : parseFloat(value) || lo;
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <label className="eyebrow">{issue.name}</label>
          <span className="font-mono text-[11px] tabular-nums text-ink-dim">
            [{displayValue(lo)} – {displayValue(hi)}]
          </span>
        </div>
        <input
          type="number"
          value={num}
          min={lo}
          max={hi}
          step={(hi - lo) / 100 || 1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-display text-[22px] tabular-nums text-ink focus:border-ink focus:outline-none"
          style={{ fontVariationSettings: '"opsz" 28, "wght" 320' }}
        />
        <input
          type="range"
          value={num}
          min={lo}
          max={hi}
          step={(hi - lo) / 200 || 1}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="mt-1 w-full"
          style={{ accentColor: "var(--sec-nego)" }}
        />
      </div>
    );
  }
  return (
    <div>
      <label className="eyebrow mb-1 block">{issue.name}</label>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border-0 border-b border-ink-faint bg-transparent pb-1 font-display italic text-[16px] text-ink focus:border-ink focus:outline-none"
        style={{ fontVariationSettings: '"opsz" 18, "wght" 380' }}
      >
        {(issue.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
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
  const issues = state.config.issues;

  const [terms, setTerms] = useState<Record<string, number | string>>(() =>
    initialTerms(issues)
  );
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
      | { kind: "offer"; speech: string }
      | { kind: "accept" | "reject" | "walk"; speech: string }
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let payload: NegoAction;
      if (action.kind === "offer") {
        payload = {
          kind: "offer",
          offer: {
            seatId: yourSeatId,
            roundIndex: state.roundIndex,
            terms
          },
          // @ts-expect-error: carry speech alongside; backend pulls it from action
          speech: action.speech || undefined
        };
      } else if (action.kind === "accept") {
        payload = {
          kind: "accept",
          seatId: yourSeatId,
          offerRef: ""
        };
        // @ts-expect-error
        payload.speech = action.speech || "I'll take it.";
      } else if (action.kind === "reject") {
        payload = {
          kind: "reject",
          seatId: yourSeatId,
          offerRef: ""
        };
        // @ts-expect-error
        payload.speech = action.speech || "Not yet.";
      } else {
        payload = { kind: "walk", seatId: yourSeatId };
        // @ts-expect-error
        payload.speech = action.speech || "I'll walk.";
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

  // ZOPA bar shows the first continuous issue only (keeps the marginalia compact).
  const primaryContinuous = issues.find((i) => i.type === "continuous");

  return (
    <div className="grid grid-cols-[1fr_380px] gap-10">
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
      <aside className="space-y-6 border-l border-ink-faint pl-6">
        {/* ZOPA bar — primary continuous issue, with last offer */}
        {primaryContinuous && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <div className="eyebrow">{primaryContinuous.name}</div>
              <span className="meta">range</span>
            </div>
            <div className="relative h-[46px] border-b border-ink-faint">
              <div
                className="absolute left-0 right-0 top-1/2 h-px"
                style={{ background: "var(--sec-nego)", opacity: 0.4 }}
              />
              {lastOffer &&
                typeof lastOffer.terms[primaryContinuous.name] === "number" && (
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: computePosition(
                        primaryContinuous,
                        lastOffer.terms[primaryContinuous.name] as number
                      )
                    }}
                  >
                    <span
                      className="block h-3 w-3 rounded-full"
                      style={{ background: "var(--sec-nego)" }}
                    />
                    <span className="mt-1 block font-mono text-[10px] tabular-nums text-ink-dim">
                      {displayValue(lastOffer.terms[primaryContinuous.name])}
                    </span>
                  </div>
                )}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-ink-faint">
              <span>{displayValue(primaryContinuous.range?.[0] ?? 0)}</span>
              <span>{displayValue(primaryContinuous.range?.[1] ?? 1)}</span>
            </div>
          </div>
        )}

        {/* Your action */}
        {yourTurn ? (
          <div className="slip space-y-5 px-5 py-6">
            <div>
              <div className="eyebrow mb-1">Your move</div>
              <h3
                className="font-display italic text-[22px] leading-tight text-ink"
                style={{ fontVariationSettings: '"opsz" 28, "wght" 380' }}
              >
                What do you offer?
              </h3>
            </div>

            {issues.map((issue) => (
              <IssueInput
                key={issue.name}
                issue={issue}
                value={terms[issue.name] ?? ""}
                onChange={(v) => setTerms((prev) => ({ ...prev, [issue.name]: v }))}
              />
            ))}

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
                onClick={() => submit({ kind: "offer", speech })}
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
 * Debrief — final curtain + scrubber replay
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
  const transcript = debrief.transcript as NegoTranscriptEntry[];
  const [cursor, setCursor] = useState<number>(transcript.length);
  const primaryContinuous = state.config.issues.find((i) => i.type === "continuous");

  // At cursor=k, show the first k entries; "playback" plays from 0 to end.
  const visible = transcript.slice(0, cursor);
  const cursorOffer = useMemo(() => {
    for (let i = visible.length - 1; i >= 0; i--) {
      const a = visible[i].action;
      if (a.kind === "offer") return a.offer;
    }
    return null;
  }, [visible]);

  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (cursor >= transcript.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => c + 1), 900);
    return () => clearTimeout(t);
  }, [playing, cursor, transcript.length]);

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
            {Object.entries(debrief.dealTerms).map(([k, v], i, arr) => (
              <span key={k} className="text-ink">
                {k} = {displayValue(v)}
                {i < arr.length - 1 ? ", " : ""}
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
              <div className="numeral text-[72px]" style={{ color: "var(--sec-nego)" }}>
                {u ? (u.utility * 100).toFixed(0) : "—"}
                <span className="ml-1 align-top font-mono text-[16px] text-ink-dim">u</span>
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
            Equal-gain target utility ≈ {(debrief.nashRef.equalGainTarget * 100).toFixed(0)}. Compare
            to where you actually landed.
          </p>
        </div>
      )}

      {/* Scrubber */}
      {transcript.length > 0 && (
        <div className="border-t border-paper-rule pt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="eyebrow">Replay</div>
            <span className="meta tabular-nums">
              {cursor} / {transcript.length}
            </span>
          </div>

          {/* ZOPA with current cursor offer */}
          {primaryContinuous && (
            <div className="relative mb-4 h-[48px] border-b border-ink-faint">
              <div
                className="absolute left-0 right-0 top-1/2 h-px"
                style={{ background: "var(--sec-nego)", opacity: 0.4 }}
              />
              {cursorOffer && typeof cursorOffer.terms[primaryContinuous.name] === "number" && (
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all"
                  style={{
                    left: computePosition(
                      primaryContinuous,
                      cursorOffer.terms[primaryContinuous.name] as number
                    )
                  }}
                >
                  <span
                    className="block h-3 w-3 rounded-full"
                    style={{ background: "var(--sec-nego)" }}
                  />
                  <span className="mt-1 block font-mono text-[10px] tabular-nums text-ink-dim">
                    {displayValue(cursorOffer.terms[primaryContinuous.name])}
                  </span>
                </div>
              )}
              <div className="absolute -bottom-5 left-0 font-mono text-[10px] tabular-nums text-ink-faint">
                {displayValue(primaryContinuous.range?.[0] ?? 0)}
              </div>
              <div className="absolute -bottom-5 right-0 font-mono text-[10px] tabular-nums text-ink-faint">
                {displayValue(primaryContinuous.range?.[1] ?? 1)}
              </div>
            </div>
          )}

          <input
            type="range"
            min={0}
            max={transcript.length}
            step={1}
            value={cursor}
            onChange={(e) => {
              setPlaying(false);
              setCursor(parseInt(e.target.value, 10));
            }}
            className="w-full"
            style={{ accentColor: "var(--sec-nego)" }}
            aria-label="Replay scrubber"
          />

          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (cursor >= transcript.length) setCursor(0);
                setPlaying((p) => !p);
              }}
              className="border border-ink bg-transparent px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink hover:bg-ink hover:text-paper"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCursor(0);
              }}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim hover:text-ink"
            >
              Rewind
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCursor(transcript.length);
              }}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim hover:text-ink"
            >
              End
            </button>
          </div>

          <div className="mt-6 space-y-2">
            {transcript.map((entry, i) => {
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
                  dim={i >= cursor}
                />
              );
            })}
          </div>
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
