/**
 * Procedural resin bound aggregate.
 *
 * Rather than tiling a photographed swatch (which locks the stone size to
 * whatever distance the swatch was shot at, and shows obvious repeats), the
 * surface is synthesised from the blend definition. A jittered-grid Worley
 * pattern gives densely packed stones; each cell gets a colour drawn from the
 * blend and is shaded as a small dome so it reads as a pebble rather than a
 * flat patch. The grid wraps, so the result tiles seamlessly.
 */

import type { Product } from "@/lib/products";

export type AggregateOptions = {
  /** Output edge length in pixels. Must be a power of two for GPU mipmaps. */
  sizePx: number;
  /** Physical resolution: how many pixels one metre of real surface occupies. */
  pxPerMetre: number;
  seed?: number;
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/* ------------------------------------------------------------------ */
/* generator                                                           */
/* ------------------------------------------------------------------ */

export function renderAggregate(
  product: Product,
  { sizePx, pxPerMetre, seed }: AggregateOptions
): ImageData {
  const N = sizePx;
  const rand = mulberry32(seed ?? hashString(product.id));

  // Stone diameter in pixels drives the cell grid. The grid count has to be a
  // whole number of cells across the tile or the pattern will not wrap.
  const grainPx = (product.grainMm / 1000) * pxPerMetre;
  const cells = Math.max(4, Math.round(N / Math.max(1.6, grainPx)));
  const cell = N / cells;

  // Site position and appearance, one entry per cell.
  const sx = new Float32Array(cells * cells);
  const sy = new Float32Array(cells * cells);
  const sr = new Uint8Array(cells * cells * 3); // stone colour
  const sv = new Float32Array(cells * cells); // per-stone brightness jitter

  const palette = product.stones.map((s) => hexToRgb(s.color));
  const cumulative: number[] = [];
  let total = 0;
  for (const s of product.stones) {
    total += s.weight;
    cumulative.push(total);
  }
  const pickStone = (r: number) => {
    const t = r * total;
    for (let i = 0; i < cumulative.length; i++) if (t <= cumulative[i]) return i;
    return cumulative.length - 1;
  };

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = cy * cells + cx;
      // Jitter kept under half a cell so stones stay roughly evenly packed.
      sx[i] = (cx + 0.5 + (rand() - 0.5) * 0.86) * cell;
      sy[i] = (cy + 0.5 + (rand() - 0.5) * 0.86) * cell;
      const [r, g, b] = palette[pickStone(rand())];
      sr[i * 3] = r;
      sr[i * 3 + 1] = g;
      sr[i * 3 + 2] = b;
      sv[i] = 0.82 + rand() * 0.36;
    }
  }

  const [br, bg, bb] = hexToRgb(product.binder);
  const out = new Uint8ClampedArray(N * N * 4);

  // Light comes from the upper left and slightly toward the viewer, matching
  // how the shading transfer treats the photograph.
  const LX = -0.42, LY = -0.52, LZ = 0.744;
  const HX = -0.27, HY = -0.33, HZ = 0.904; // half-vector for the specular lobe
  const spec = product.gloss;

  const radius = cell * 0.72; // dome radius, slightly larger than a cell
  const grain = mulberry32((seed ?? hashString(product.id)) ^ 0x9e3779b9);
  // Pre-rolled fine noise, tiled at a size that divides N so it stays seamless.
  const NOISE = 64;
  const noise = new Float32Array(NOISE * NOISE);
  for (let i = 0; i < noise.length; i++) noise[i] = (grain() - 0.5) * 0.09;

  for (let y = 0; y < N; y++) {
    const cy0 = Math.floor(y / cell);
    for (let x = 0; x < N; x++) {
      const cx0 = Math.floor(x / cell);

      let best = Infinity, second = Infinity, bestI = 0, bdx = 0, bdy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = (cy0 + oy + cells) % cells;
        // Wrap offset so distance is measured across the tile seam correctly.
        const wy = (cy0 + oy) < 0 ? -N : (cy0 + oy) >= cells ? N : 0;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = (cx0 + ox + cells) % cells;
          const wx = (cx0 + ox) < 0 ? -N : (cx0 + ox) >= cells ? N : 0;
          const i = gy * cells + gx;
          const dx = sx[i] + wx - x;
          const dy = sy[i] + wy - y;
          const d = dx * dx + dy * dy;
          if (d < best) {
            second = best;
            best = d;
            bestI = i;
            bdx = dx;
            bdy = dy;
          } else if (d < second) {
            second = d;
          }
        }
      }

      const dist = Math.sqrt(best);
      const gap = Math.sqrt(second) - dist; // small near a stone boundary

      // Crushed aggregate is angular, not spherical, so the rim of each stone
      // wobbles with the angle around its centre.
      const ang = Math.atan2(bdy, bdx);
      const seedv = sv[bestI];
      const wobble =
        1 + 0.17 * Math.sin(ang * 5 + seedv * 9) + 0.1 * Math.sin(ang * 3 - seedv * 5);

      // Dome normal: flat across the crown, falling away toward the rim. The
      // lateral term is damped — a fully spherical normal reads as ball
      // bearings once the swatch is viewed close up.
      const t = Math.min(1, dist / (radius * wobble));
      const nz = Math.sqrt(Math.max(0.02, 1 - t * t));
      const inv = t > 1e-4 ? (t * 0.78) / dist : 0;
      const nx = bdx * -inv;
      const ny = bdy * -inv;

      let diff = nx * LX + ny * LY + nz * LZ;
      diff = 0.46 + 0.54 * Math.max(0, diff);
      const sd = Math.max(0, nx * HX + ny * HY + nz * HZ);
      const hl = spec * Math.pow(sd, 38) * 0.85;

      // Binder darkens the seams between stones.
      const seam = Math.min(1, gap / (cell * 0.34));
      const bind = (1 - seam) * 0.72;

      const ni = ((y & (NOISE - 1)) * NOISE + (x & (NOISE - 1))) | 0;
      const shade = sv[bestI] * diff * (1 + noise[ni]);

      const o = (y * N + x) * 4;
      const sc = bestI * 3;
      out[o] = (sr[sc] * shade + hl * 255) * (1 - bind) + br * bind;
      out[o + 1] = (sr[sc + 1] * shade + hl * 255) * (1 - bind) + bg * bind;
      out[o + 2] = (sr[sc + 2] * shade + hl * 255) * (1 - bind) + bb * bind;
      out[o + 3] = 255;
    }
  }

  return new ImageData(out, N, N);
}

/* ------------------------------------------------------------------ */
/* caches                                                              */
/* ------------------------------------------------------------------ */

/** Tile used on the floor: half a metre of surface, so repeats are not legible. */
export const FLOOR_TILE_PX = 512;
export const FLOOR_TILE_METRES = 0.5;
const FLOOR_PX_PER_METRE = FLOOR_TILE_PX / FLOOR_TILE_METRES;

const floorCache = new Map<string, ImageData>();

export function getFloorTile(product: Product): ImageData {
  let hit = floorCache.get(product.id);
  if (!hit) {
    hit = renderAggregate(product, {
      sizePx: FLOOR_TILE_PX,
      pxPerMetre: FLOOR_PX_PER_METRE,
    });
    floorCache.set(product.id, hit);
  }
  return hit;
}

const swatchCache = new Map<string, string>();

/**
 * Close-up swatch for the product list — roughly a 90mm crop, which is the
 * scale a physical sample board is photographed at.
 */
export function getSwatchDataUrl(product: Product, sizePx = 128): string {
  const key = `${product.id}@${sizePx}`;
  const hit = swatchCache.get(key);
  if (hit) return hit;

  const data = renderAggregate(product, {
    sizePx,
    pxPerMetre: sizePx / 0.09,
    seed: hashString(product.id) ^ 0x5bf03635,
  });
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  canvas.getContext("2d")!.putImageData(data, 0, 0);
  const url = canvas.toDataURL("image/png");
  swatchCache.set(key, url);
  return url;
}

/** Warms the floor-tile cache off the critical path. */
export function prewarmFloorTiles(products: Product[]) {
  const queue = [...products];
  const step = () => {
    const next = queue.shift();
    if (!next) return;
    getFloorTile(next);
    if (queue.length) schedule(step);
  };
  schedule(step);
}

function schedule(fn: () => void) {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(fn);
  else setTimeout(fn, 60);
}
