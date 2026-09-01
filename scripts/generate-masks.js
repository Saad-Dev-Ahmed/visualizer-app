// Segments the ground/floor surface out of each demo photo and writes an 8-bit
// grayscale PNG mask (255 = replaceable surface). Run with `npm run masks`.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const jpeg = require("jpeg-js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public/demo");
// Set MASK_DEBUG_DIR to also write mask-over-photo overlays for eyeballing.
const DEBUG = process.env.MASK_DEBUG_DIR;

/* ---------- colour ---------- */
function srgbToLab(r, g, b) {
  const f = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.9505;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.089;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = k(x); y = k(y); z = k(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/* ---------- PNG (grayscale, 8-bit) ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writeGrayPng(file, gray, w, h) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = gray[y * w + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}
function writeRgbPng(file, rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}

/* ---------- morphology / blur ---------- */
function dilate(m, w, h, r) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (m[ny * w + nx]) { v = 1; break; }
        }
      out[y * w + x] = v;
    }
  return out;
}
function erode(m, w, h, r) {
  const inv = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = d[i] ? 0 : 1;
  return out;
}
function boxBlur(g, w, h, r) {
  const tmp = new Float32Array(g.length);
  const out = new Uint8Array(g.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        s += g[y * w + nx]; n++;
      }
      tmp[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        s += tmp[ny * w + x]; n++;
      }
      out[y * w + x] = Math.round(s / n);
    }
  return out;
}
function largestComponent(m, w, h) {
  const lab = new Int32Array(m.length).fill(-1);
  let best = -1, bestSize = 0;
  const stack = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    const id = i;
    let size = 0;
    stack.push(i);
    lab[i] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (m[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = lab[i] === best ? 1 : 0;
  return out;
}
/** Fill holes: anything not reachable from the border through background. */
function fillHoles(m, w, h) {
  const bg = new Uint8Array(m.length);
  const stack = [];
  const push = (i) => { if (!m[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      push(ny * w + nx);
    }
  }
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] || !bg[i] ? 1 : 0;
  return out;
}

/* ---------- segmentation ---------- */
function segment(img, cfg) {
  const { width: w, height: h, data } = img;
  const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const [l, a, b] = srgbToLab(data[p], data[p + 1], data[p + 2]);
    L[i] = l; A[i] = a; B[i] = b;
  }

  // Reference colour = median of the seed patches.
  const sl = [], sa = [], sb = [];
  for (const [sx, sy] of cfg.seeds) {
    const cx = Math.round(sx * w), cy = Math.round(sy * h);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        sl.push(L[i]); sa.push(A[i]); sb.push(B[i]);
      }
  }
  const med = (arr) => arr.slice().sort((p, q) => p - q)[arr.length >> 1];
  const rL = med(sl), rA = med(sa), rB = med(sb);

  // Flood fill. Chroma tolerance is tight (hue identifies the material);
  // lightness tolerance is loose because shadows fall across these surfaces.
  const inside = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const stack = [];
  const { chromaTol, lightTolDown, lightTolUp, bounds } = cfg;
  const [bx0, by0, bx1, by1] = bounds ?? [0, 0, 1, 1];
  const X0 = Math.round(bx0 * w), Y0 = Math.round(by0 * h);
  const X1 = Math.round(bx1 * w), Y1 = Math.round(by1 * h);
  const ok = (i) => {
    const dc = Math.hypot(A[i] - rA, B[i] - rB);
    const dl = L[i] - rL;
    return dc <= chromaTol && dl >= -lightTolDown && dl <= lightTolUp;
  };
  for (const [sx, sy] of cfg.seeds) {
    const i = Math.round(sy * h) * w + Math.round(sx * w);
    if (!visited[i]) { visited[i] = 1; inside[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < X0 || ny < Y0 || nx >= X1 || ny >= Y1) continue;
      const q = ny * w + nx;
      if (visited[q]) continue;
      visited[q] = 1;
      if (ok(q)) { inside[q] = 1; stack.push(q); }
    }
  }

  let m = inside;
  m = dilate(m, w, h, cfg.close ?? 2);
  m = erode(m, w, h, cfg.close ?? 2);
  m = fillHoles(m, w, h);
  m = largestComponent(m, w, h);
  m = erode(m, w, h, cfg.open ?? 1);
  m = dilate(m, w, h, cfg.open ?? 1);
  m = fillHoles(m, w, h);

  // Trim a hair off the silhouette so the new surface never bleeds over edging,
  // then feather so the seam reads as a soft contact edge rather than a cutout.
  m = erode(m, w, h, cfg.shrink ?? 1);
  let g = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) g[i] = m[i] ? 255 : 0;
  g = boxBlur(g, w, h, cfg.feather ?? 2);
  return g;
}

/* ---------- scenes ---------- */
const SCENES = [
  {
    file: "driveway.jpg",
    seeds: [[0.5, 0.75], [0.2, 0.6], [0.75, 0.62], [0.5, 0.45], [0.15, 0.95], [0.85, 0.9], [0.35, 0.4]],
    chromaTol: 13,
    lightTolDown: 62,
    lightTolUp: 30,
    bounds: [0, 0.33, 1, 1],
    close: 3,
    open: 2,
    shrink: 1,
    feather: 2,
  },
  {
    file: "patio.jpg",
    // The dark inlay band is a second aggregate, so it is seeded explicitly and
    // the lightness tolerance is opened up to carry the fill across it.
    seeds: [[0.5, 0.8], [0.25, 0.85], [0.8, 0.75], [0.6, 0.66], [0.5, 0.95]],
    chromaTol: 12,
    lightTolDown: 58,
    lightTolUp: 30,
    bounds: [0, 0.55, 1, 1],
    close: 3,
    open: 3,
    shrink: 1,
    feather: 2,
  },
  {
    file: "path.jpg",
    seeds: [[0.45, 0.85], [0.5, 0.6], [0.42, 0.42], [0.35, 0.3], [0.3, 0.24], [0.55, 0.95]],
    chromaTol: 12,
    lightTolDown: 40,
    lightTolUp: 34,
    bounds: [0, 0.13, 1, 1],
    close: 3,
    open: 2,
    shrink: 1,
    feather: 2,
  },
];

for (const cfg of SCENES) {
  const img = jpeg.decode(fs.readFileSync(path.join(OUT, cfg.file)), { useTArray: true });
  const g = segment(img, cfg);
  const base = cfg.file.replace(/\.jpg$/, "");
  writeGrayPng(path.join(OUT, `${base}-mask.png`), g, img.width, img.height);

  if (DEBUG) {
    const rgb = Buffer.alloc(img.width * img.height * 3);
    for (let i = 0, p = 0; i < img.width * img.height; i++, p += 4) {
      const a = g[i] / 255;
      rgb[i * 3] = Math.round(img.data[p] * (1 - a) + 255 * a);
      rgb[i * 3 + 1] = Math.round(img.data[p + 1] * (1 - a) + 0 * a);
      rgb[i * 3 + 2] = Math.round(img.data[p + 2] * (1 - a) + 128 * a);
    }
    writeRgbPng(path.join(DEBUG, `${base}-overlay.png`), rgb, img.width, img.height);
  }

  let cov = 0;
  for (let i = 0; i < g.length; i++) cov += g[i] / 255;
  console.log(`${cfg.file}: ${img.width}x${img.height} coverage ${(100 * cov / g.length).toFixed(1)}%`);
}
