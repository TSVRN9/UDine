/** #421/#431: a degenerate HTML address blob (babyBerk's raw `<p><br/>,  </p>`) reduces via
 * htmlToText to a non-blank line that's just punctuation -- a lone ",". Require at least one
 * alphanumeric character before treating a line as real address content, so callers picking the
 * first "real" line (index.tsx's retailSubtitle, CafeSheet's addressLines) skip the stray
 * separator instead of rendering it. */
export function isRealAddressLine(line: string): boolean {
  return /[a-zA-Z0-9]/.test(line);
}
