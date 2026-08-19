import { digest, getRandomValues } from "expo-crypto";

/**
 * Hermes has no WebCrypto: `globalThis.crypto` is `undefined`. @supabase/supabase-js checks for
 * `crypto.subtle` and silently downgrades PKCE's code-challenge method from S256 to plain when it's
 * missing (see its own `console.warn`, "WebCrypto API is not supported"). expo-crypto's `digest`
 * takes the same algorithm-name strings ('SHA-256', ...) and (BufferSource) => Promise<ArrayBuffer>
 * shape as `SubtleCrypto.digest`, and `getRandomValues` matches `Crypto.getRandomValues` exactly, so
 * both wire straight through — no full WebCrypto polyfill needed, just these two methods.
 */
export function installWebCrypto(target: { crypto?: Partial<Crypto> } = globalThis as { crypto?: Partial<Crypto> }): void {
  const existing = target.crypto;
  if (existing?.subtle) return; // already has a real crypto.subtle - nothing to do
  target.crypto = {
    // Preserve a runtime-provided getRandomValues (e.g. react-native-get-random-values) if one is
    // already present; only crypto.subtle is guaranteed missing on Hermes.
    getRandomValues: existing?.getRandomValues ?? getRandomValues,
    subtle: {
      digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
        digest(normalizeAlgorithm(algorithm) as Parameters<typeof digest>[0], data),
    },
  } as Crypto;
}

function normalizeAlgorithm(algorithm: AlgorithmIdentifier): string {
  return (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase();
}

installWebCrypto();
