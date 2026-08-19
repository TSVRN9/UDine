import { digest, getRandomValues } from "expo-crypto";

/**
 * Hermes has no WebCrypto: `globalThis.crypto` is `undefined`. @supabase/supabase-js checks for
 * `crypto.subtle` and silently downgrades PKCE's code-challenge method from S256 to plain when it's
 * missing (see its own `console.warn`, "WebCrypto API is not supported"). expo-crypto's `digest`
 * takes the same algorithm-name strings ('SHA-256', ...) and (BufferSource) => Promise<ArrayBuffer>
 * shape as `SubtleCrypto.digest`, and `getRandomValues` matches `Crypto.getRandomValues` exactly, so
 * both wire straight through — no full WebCrypto polyfill needed, just these two methods.
 */
export function installWebCrypto(target: { crypto?: unknown } = globalThis as { crypto?: unknown }): void {
  if (target.crypto) return;
  target.crypto = {
    getRandomValues,
    subtle: {
      digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
        digest(normalizeAlgorithm(algorithm) as Parameters<typeof digest>[0], data),
    },
  };
}

function normalizeAlgorithm(algorithm: AlgorithmIdentifier): string {
  return typeof algorithm === "string" ? algorithm : algorithm.name;
}

installWebCrypto();
