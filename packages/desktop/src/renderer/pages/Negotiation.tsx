import { useEffect, useState } from "react";
import type { NegoConfig, NegoSessionState } from "@decision-forge/core";
import { ModuleFrame } from "../components/ModuleFrame";
import { KeyPrompt } from "./nego/KeyPrompt";
import { Setup } from "./nego/Setup";
import { SessionView, Debrief } from "./nego/SessionView";
import { negoApi, keychainApi, type NegoDebrief } from "../lib/nego-api";

type Phase = "loading" | "need-key" | "setup" | "active" | "debrief";

export default function Negotiation() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<NegoSessionState | null>(null);
  const [debrief, setDebrief] = useState<NegoDebrief | null>(null);

  useEffect(() => {
    // Key gate is satisfied if the keychain has a key OR the sidecar already
    // has a live driver (e.g. a GEMINI_API_KEY/GOOGLE_API_KEY loaded from
    // packages/py-engine/.env at startup). The latter means no re-entry.
    (async () => {
      const [has, health] = await Promise.all([
        keychainApi.has(),
        negoApi.health().catch(() => ({ driver: null as string | null }))
      ]);
      setPhase(has || health.driver ? "setup" : "need-key");
    })();
  }, []);

  async function launch(
    config: NegoConfig,
    mcSamples?: Record<string, number>
  ) {
    const s = await negoApi.start(config, mcSamples);
    setSession(s);
    setPhase(s.outcome === "active" ? "active" : "debrief");
    if (s.outcome !== "active") {
      const d = await negoApi.debrief(s.id);
      setDebrief(d);
    }
  }

  async function onFinished(s: NegoSessionState) {
    const d = await negoApi.debrief(s.id);
    setSession(s);
    setDebrief(d);
    setPhase("debrief");
  }

  function reset() {
    setSession(null);
    setDebrief(null);
    setPhase("setup");
  }

  return (
    <ModuleFrame
      section="§ II"
      kicker="Persuasion"
      title="Negotiation Dojo"
      accent="var(--sec-nego)"
      lede="A rehearsal room. An opposite number with nerve and guile. Ten rounds to find a handshake or walk with your BATNA intact."
      marginalia={
        <div className="space-y-6">
          <div>
            <div className="eyebrow mb-2">Stage directions</div>
            <p
              className="font-display italic text-[13px] leading-[1.55] text-ink-dim"
              style={{ fontVariationSettings: '"opsz" 14, "wght" 360' }}
            >
              The dojo plays with a single issue at first. Multi-issue trades
              arrive in Plan 4.5. Nothing leaves your machine except the
              model's own tokens, and even those take their leave via your
              OS keychain, not a file.
            </p>
          </div>
          <div className="rule" />
          <div>
            <div className="eyebrow mb-2">Conduct</div>
            <ul className="space-y-1.5 font-mono text-[11px] text-ink-dim">
              <li>— One issue, two seats</li>
              <li>— Persona-shaped agent</li>
              <li>— BATNA never revealed</li>
              <li>— Walk is always an option</li>
            </ul>
          </div>
          {phase !== "need-key" && phase !== "loading" && (
            <>
              <div className="rule" />
              <button
                type="button"
                onClick={async () => {
                  await keychainApi.clear();
                  setPhase("need-key");
                }}
                className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-dim hover:text-ink"
              >
                Forget API key
              </button>
            </>
          )}
        </div>
      }
    >
      {phase === "loading" && <p className="meta italic">Reading the keychain…</p>}
      {phase === "need-key" && <KeyPrompt onReady={() => setPhase("setup")} />}
      {phase === "setup" && <Setup onLaunch={launch} />}
      {phase === "active" && session && (
        <SessionView
          state={session}
          onUpdate={(s) => setSession(s)}
          onFinished={onFinished}
        />
      )}
      {phase === "debrief" && session && debrief && (
        <Debrief state={session} debrief={debrief} onAgain={reset} />
      )}
    </ModuleFrame>
  );
}
