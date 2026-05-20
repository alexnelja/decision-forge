/**
 * Gemini API key storage via OS keychain (keytar).
 * Service and account identifiers are stable so the same key persists across upgrades.
 */
const SERVICE = "DecisionForge";
const ACCOUNT = "gemini-api-key";

// Test seam — when DECISION_FORGE_FAKE_KEYCHAIN is set, never touch the real
// OS keychain. keytar.setPassword can block on a macOS Keychain access prompt
// in headless e2e runs; this returns the env value as the stored key and makes
// writes/clears no-ops so specs can drive the key-gated flows deterministically.
function fakeKey(): string | null {
  return process.env.DECISION_FORGE_FAKE_KEYCHAIN || null;
}

type KeytarLike = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

async function loadKeytar(): Promise<KeytarLike | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await import("keytar");
    return (mod.default ?? mod) as unknown as KeytarLike;
  } catch {
    return null;
  }
}

export async function getGeminiKey(): Promise<string | null> {
  const fake = fakeKey();
  if (fake) return fake;
  const keytar = await loadKeytar();
  if (!keytar) return null;
  try {
    return await keytar.getPassword(SERVICE, ACCOUNT);
  } catch {
    return null;
  }
}

export async function setGeminiKey(key: string): Promise<void> {
  if (fakeKey()) return;
  const keytar = await loadKeytar();
  if (!keytar) throw new Error("keytar unavailable — cannot store API key");
  if (!key || !key.trim()) throw new Error("key cannot be empty");
  await keytar.setPassword(SERVICE, ACCOUNT, key.trim());
}

export async function clearGeminiKey(): Promise<void> {
  if (fakeKey()) return;
  const keytar = await loadKeytar();
  if (!keytar) return;
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {
    // ignore
  }
}

export async function hasGeminiKey(): Promise<boolean> {
  const key = await getGeminiKey();
  return !!key;
}
