/**
 * Photographed swatches.
 *
 * Part of the catalogue has been shot; the rest still falls back to the
 * procedural swatch in lib/texture/aggregate.ts, so every blend shows a chip
 * either way. Add an entry when a blend is photographed — the path is the
 * browser-facing chip in public/stones/, not the server-side master that
 * assets/stones/ holds for generation.
 */

export const STONE_PHOTOS: Record<string, string> = {
  arizona: "/stones/arizona.webp",
  eden: "/stones/eden.webp",
  orchid: "/stones/orchid.webp",
  "slate-grey": "/stones/slate-grey.webp",
  "winter-sage": "/stones/winter-sage.webp",
  athena: "/stones/athena.webp",
};

/** Chip URL for a blend, or undefined if it has not been photographed yet. */
export function stonePhoto(id: string): string | undefined {
  return STONE_PHOTOS[id];
}
