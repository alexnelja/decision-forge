/**
 * Anthropic API key storage via OS keychain (keytar).
 * Service and account identifiers are stable so the same key persists across upgrades.
 */
const SERVICE = "DecisionForge";
const ACCOUNT = "anthropic-api-key";

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

export async function getAnthropicKey(): Promise<string | null> {
  const keytar = await loadKeytar();
  if (!keytar) return null;
  try {
    return await keytar.getPassword(SERVICE, ACCOUNT);
  } catch {
    return null;
  }
}

export async function setAnthropicKey(key: string): Promise<void> {
  const keytar = await loadKeytar();
  if (!keytar) throw new Error("keytar unavailable — cannot store API key");
  if (!key || !key.trim()) throw new Error("key cannot be empty");
  await keytar.setPassword(SERVICE, ACCOUNT, key.trim());
}

export async function clearAnthropicKey(): Promise<void> {
  const keytar = await loadKeytar();
  if (!keytar) return;
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {
    // ignore
  }
}

export async function hasAnthropicKey(): Promise<boolean> {
  const key = await getAnthropicKey();
  return !!key;
}
