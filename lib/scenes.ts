import type { Quad } from "@/lib/render/homography";

export type DemoScene = {
  id: string;
  label: string;
  caption: string;
  photo: string;
  mask: string;
  width: number;
  height: number;
  /**
   * Reference rectangle on the ground plane, in normalised image coordinates,
   * ordered far-left, far-right, near-right, near-left. The corners sit well
   * outside the frame on purpose — the rectangle describes the whole ground
   * plane, not the visible surface, which the mask handles separately.
   */
  quad: Quad;
  /** Real size of that rectangle in metres, estimated from the photograph. */
  planeMetres: [number, number];
};

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "driveway",
    label: "Driveway",
    caption: "Front driveway, mid-morning sun",
    photo: "/demo/driveway.jpg",
    mask: "/demo/driveway-mask.png",
    width: 600,
    height: 400,
    quad: [
      [0.2476, 0.36],
      [0.7524, 0.36],
      [1.3, 1.0],
      [-0.3, 1.0],
    ],
    planeMetres: [3.72, 3.96],
  },
  {
    id: "patio",
    label: "Patio",
    caption: "Enclosed courtyard, soft overcast light",
    photo: "/demo/patio.jpg",
    mask: "/demo/patio-mask.png",
    width: 508,
    height: 400,
    quad: [
      [0.141, 0.62],
      [0.859, 0.62],
      [1.2, 1.0],
      [-0.2, 1.0],
    ],
    planeMetres: [3.3, 1.76],
  },
  {
    id: "path",
    label: "Path",
    caption: "Curved garden path with stone edging",
    photo: "/demo/path.jpg",
    mask: "/demo/path-mask.png",
    width: 400,
    height: 533,
    quad: [
      [0.43, 0.15],
      [0.57, 0.15],
      [1.1, 1.0],
      [-0.1, 1.0],
    ],
    planeMetres: [1.4, 6.97],
  },
];

export function getDemoScene(id: string) {
  return DEMO_SCENES.find((s) => s.id === id);
}

/**
 * Starting guess for a photo we know nothing about: camera held at chest
 * height, horizon a little above the middle, surface running to the bottom
 * edge. The user drags the corners from here.
 */
export const DEFAULT_UPLOAD_QUAD: Quad = [
  [0.241, 0.62],
  [0.759, 0.62],
  [1.25, 1.0],
  [-0.25, 1.0],
];

export const DEFAULT_UPLOAD_METRES: [number, number] = [4, 4];
