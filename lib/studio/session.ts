/**
 * The room the user picked on the landing screen, handed to the visualizer.
 * Kept in sessionStorage so a refresh or a direct link to /visualizer still
 * finds the photo, without needing a server round trip.
 */

export type SceneSource =
  | { kind: "demo"; id: string }
  | {
      kind: "upload";
      dataUrl: string;
      width: number;
      height: number;
      name: string;
    };

const KEY = "studio:scene";

export function saveScene(source: SceneSource) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(source));
  } catch {
    // Storage full or blocked; the visualizer falls back to the first demo.
  }
}

export function loadScene(): SceneSource | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SceneSource) : null;
  } catch {
    return null;
  }
}

export function clearScene() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
