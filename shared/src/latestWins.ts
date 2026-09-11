/**
 * Guards search-as-you-type (or any debounced/typeahead async call) against out-of-order
 * responses -- a slow earlier request resolving after a faster later one must not clobber it. Call
 * start() right before firing the request, then only apply the response if isLatest(token) still
 * holds when it resolves.
 */
export function createLatestWins() {
  let current = 0;
  return {
    start(): number {
      return ++current;
    },
    isLatest(token: number): boolean {
      return token === current;
    },
  };
}
