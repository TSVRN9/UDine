import type { ServeTarget } from "../logic/dishSheet";

/**
 * Where-served from a dish sheet that is not on the Halls tab (the plate's): the Halls screen registers what pushes a hall over it,
 * and the plate's sheet asks. A module bus like the dish sheet's store: the two never share a parent.
 */
interface Handlers { push: (t: ServeTarget) => void; go: () => void }
let handlers: Handlers | null = null;
export const registerServe = (h: Handlers) => { handlers = h; return () => { if (handlers === h) handlers = null; }; };
export const serveOnHalls = { push: (t: ServeTarget) => handlers?.push(t), go: () => handlers?.go() };
