// Reads shared/vectors/*.json (the cross-language case files written by shared/scripts/gen-vectors.ts)
// and registers one Deno.test per case. Needs --allow-read=shared/vectors.
//
// Each Deno copy of a rule is a hand-written duplicate of shared/src, so a copy may disagree with a
// vector. Disagreements are never "fixed" here (which side is right is the owner's call): list the
// case in the test file's KNOWN_DIVERGENT instead. A listed case must still disagree, so the list
// cannot go stale when either side changes.

export interface VectorCase {
  kind: string;
  name: string;
  // deno-lint-ignore no-explicit-any
  input: any;
  // deno-lint-ignore no-explicit-any
  expected: any;
}

export function loadVector(file: string): VectorCase[] {
  const url = new URL(`../../../../shared/vectors/${file}`, import.meta.url);
  return JSON.parse(Deno.readTextFileSync(url)).cases;
}

/** `check` returns null when the Deno copy agrees with the vector, else a one-line description of the
 * disagreement. Cases whose kind is not in `kinds` are not covered by this copy and are skipped. */
export function defineVectorTests(
  label: string,
  file: string,
  kinds: string[],
  check: (c: VectorCase) => string | null,
  knownDivergent: Record<string, string>,
) {
  const cases = loadVector(file).filter((c) => kinds.includes(c.kind));
  Deno.test(`${label}: covers ${cases.length} ${file} cases of kind ${kinds.join("/")}`, () => {
    if (cases.length === 0) throw new Error(`no ${kinds.join("/")} cases in ${file}`);
    const stale = Object.keys(knownDivergent).filter((n) => !cases.some((c) => c.name === n));
    if (stale.length) throw new Error(`KNOWN_DIVERGENT names no case: ${stale.join("; ")}`);
  });
  for (const c of cases) {
    Deno.test(`${label} [${c.kind}] ${c.name}`, () => {
      const diff = check(c);
      const divergent = c.name in knownDivergent;
      if (diff && !divergent) throw new Error(`Deno disagrees with ${file}: ${diff}`);
      if (!diff && divergent) throw new Error(`now agrees with ${file}: remove it from KNOWN_DIVERGENT`);
    });
  }
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
