/**
 * Saved blends, backed by localStorage.
 *
 * Exposed as an external store rather than component state so the sidebar can
 * read it through `useSyncExternalStore`: React then hydrates against the
 * empty server snapshot and swaps in the stored set on the client, with no
 * markup mismatch and no state-setting effect.
 */

const KEY = "visualizer:favourites";
const EMPTY: ReadonlySet<string> = new Set();

let snapshot: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

function read(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function subscribeFavourites(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getFavourites(): ReadonlySet<string> {
  snapshot ??= read();
  return snapshot;
}

/** Server render has no storage, so nothing is saved yet. */
export function getServerFavourites(): ReadonlySet<string> {
  return EMPTY;
}

export function toggleFavourite(id: string) {
  const next = new Set(getFavourites());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Storage full or blocked; the choice still applies for this session.
  }
  for (const listener of listeners) listener();
}
