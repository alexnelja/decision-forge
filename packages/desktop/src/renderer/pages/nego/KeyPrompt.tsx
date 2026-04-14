import { useState } from "react";
import { keychainApi } from "../../lib/nego-api";

export function KeyPrompt({ onReady }: { onReady: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value.trim()) {
      setError("A key is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await keychainApi.set(value.trim());
      onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="specimen mx-auto max-w-[640px] px-10 py-12">
      <div className="eyebrow mb-4" style={{ color: "var(--sec-nego)" }}>
        Entrance — required
      </div>
      <h2
        className="font-display text-[40px] italic leading-[1.02] text-ink"
        style={{
          fontVariationSettings: '"opsz" 72, "SOFT" 30, "wght" 320',
          letterSpacing: "-0.025em"
        }}
      >
        The players need an ear.
      </h2>
      <p
        className="mt-5 font-display text-[17px] leading-[1.55] text-ink-dim"
        style={{ fontVariationSettings: '"opsz" 18, "wght" 360' }}
      >
        Paste an Anthropic API key to populate the room with negotiators. It is
        stored in the macOS keychain — never the filesystem, never a scenario
        file, never the transcript. The Python sidecar receives it only at
        launch time, via an environment variable.
      </p>

      <div className="mt-8 border-b border-ink-faint pb-2">
        <label htmlFor="anthropic-key" className="eyebrow mb-2 block">
          sk-ant-…
        </label>
        <input
          id="anthropic-key"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-ant-api03-…"
          className="w-full border-0 bg-transparent px-0 font-mono text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
      </div>

      {error && (
        <p className="mt-3 font-mono text-[11px]" style={{ color: "var(--sec-nego)" }}>
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <p className="meta italic">Keychain service · "DecisionForge"</p>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="border border-ink bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.28em] text-paper hover:bg-paper hover:text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Raise curtain"}
        </button>
      </div>
    </div>
  );
}
