/** Column-agnostic 3x3, stored row-major: [a b c d e f g h i]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export type Point = [number, number];
/** Four points, in the order that maps to (0,0) (1,0) (1,1) (0,1). */
export type Quad = [Point, Point, Point, Point];

/**
 * Heckbert's projective mapping of the unit square onto an arbitrary
 * quadrilateral. Used to relate the flat plane the aggregate is laid out on to
 * where that plane lands in the photograph.
 */
export function homographyFromQuad(q: Quad): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // Affine: the quad is a parallelogram.
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  }

  const dx1 = x1 - x2, dx2 = x3 - x2;
  const dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ];
}

export function apply3(m: Mat3, p: Point): [number, number, number] {
  const [a, b, c, d, e, f, g, h, i] = m;
  return [a * p[0] + b * p[1] + c, d * p[0] + e * p[1] + f, g * p[0] + h * p[1] + i];
}

/** WebGL wants column-major mat3. */
export function toColumnMajor(m: Mat3): Float32Array {
  const [a, b, c, d, e, f, g, h, i] = m;
  return new Float32Array([a, d, g, b, e, h, c, f, i]);
}

export function negate3(m: Mat3): Mat3 {
  return m.map((v) => -v) as Mat3;
}
