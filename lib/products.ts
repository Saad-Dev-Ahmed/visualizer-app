/**
 * Resin bound aggregate catalogue.
 *
 * A blend is described by the stones in it rather than by a photograph, which
 * is what lets the renderer synthesise a seamless, correctly-scaled surface for
 * any camera distance instead of tiling a fixed-resolution swatch image.
 */

export type StoneSize = "1-3mm" | "2-5mm" | "3-6mm";

export type ColourFamily =
  | "Gold & Amber"
  | "Neutral & Cream"
  | "Grey & Silver"
  | "Dark & Charcoal"
  | "Earth & Copper";

/** A stone type in the blend: colour plus how much of the mix it makes up. */
export type Stone = { color: string; weight: number };

export type Product = {
  id: string;
  brand: string;
  name: string;
  sku: string;
  family: ColourFamily;
  stoneSize: StoneSize;
  /** Average stone diameter in millimetres, used to scale the generated grain. */
  grainMm: number;
  stones: Stone[];
  /** Resin tint showing between stones. Kept dark — it reads as depth. */
  binder: string;
  /** 0–1. How glossy the cured surface looks. */
  gloss: number;
  description: string;
  popular?: boolean;
  new?: boolean;
};

export const PRODUCTS: Product[] = [
  {
    id: "arizona",
    brand: "DALTEX Bespoke",
    name: "Arizona",
    sku: "Arizona",
    family: "Gold & Amber",
    stoneSize: "1-3mm",
    grainMm: 2.1,
    stones: [
      { color: "#c9963f", weight: 5 },
      { color: "#e0b968", weight: 4 },
      { color: "#a9702c", weight: 3 },
      { color: "#f0dcae", weight: 2 },
      { color: "#7c4f22", weight: 1.2 },
      { color: "#efeae0", weight: 1 },
    ],
    binder: "#5d3f1c",
    gloss: 0.32,
    description: "A warm golden blend with amber and buff highlights.",
    popular: true,
  },
  {
    id: "eden",
    brand: "DALTEX Bespoke",
    name: "Eden",
    sku: "Eden",
    family: "Dark & Charcoal",
    stoneSize: "1-3mm",
    grainMm: 2.0,
    stones: [
      { color: "#3b3d40", weight: 5 },
      { color: "#8e9297", weight: 3 },
      { color: "#e6e3dc", weight: 2.5 },
      { color: "#c2a35d", weight: 1.6 },
      { color: "#1d1e20", weight: 2 },
    ],
    binder: "#232426",
    gloss: 0.38,
    description: "Deep charcoal with silver and a fine gold fleck.",
    popular: true,
  },
  {
    id: "orchid",
    brand: "DALTEX Bespoke",
    name: "Orchid",
    sku: "Orchid",
    family: "Neutral & Cream",
    stoneSize: "1-3mm",
    grainMm: 2.2,
    stones: [
      { color: "#e9d9c2", weight: 5 },
      { color: "#cfa98a", weight: 3 },
      { color: "#f6efe4", weight: 3 },
      { color: "#a97b62", weight: 1.4 },
      { color: "#6d5647", weight: 0.9 },
    ],
    binder: "#5a4636",
    gloss: 0.3,
    description: "Soft cream and blush tones for a light, open finish.",
  },
  {
    id: "winter-sage",
    brand: "DALTEX Bespoke",
    name: "Winter Sage",
    sku: "Winter Sage",
    family: "Grey & Silver",
    stoneSize: "1-3mm",
    grainMm: 2.0,
    stones: [
      { color: "#e8e8e3", weight: 5 },
      { color: "#8c9187", weight: 3 },
      { color: "#4a4f48", weight: 2 },
      { color: "#b9bdb2", weight: 3 },
      { color: "#262826", weight: 1.2 },
    ],
    binder: "#3a3d39",
    gloss: 0.34,
    description: "Cool white and sage green over a dark base.",
  },
  {
    id: "slate-grey",
    brand: "DALTEX Bespoke",
    name: "Slate Grey",
    sku: "Slate Grey",
    family: "Grey & Silver",
    stoneSize: "2-5mm",
    grainMm: 3.4,
    stones: [
      { color: "#6f7479", weight: 5 },
      { color: "#3c4045", weight: 3.5 },
      { color: "#adb2b6", weight: 2.5 },
      { color: "#dcdcda", weight: 1.4 },
      { color: "#22252a", weight: 1.5 },
    ],
    binder: "#2b2e32",
    gloss: 0.36,
    description: "Classic mid-grey slate tones with a bright fleck.",
    popular: true,
  },
  {
    id: "autumn-gold",
    brand: "DALTEX Bespoke",
    name: "Autumn Gold",
    sku: "Autumn Gold",
    family: "Gold & Amber",
    stoneSize: "2-5mm",
    grainMm: 3.2,
    stones: [
      { color: "#b8823a", weight: 5 },
      { color: "#d9ab5e", weight: 3.5 },
      { color: "#8a5524", weight: 2.4 },
      { color: "#efd9a6", weight: 1.8 },
      { color: "#5a3417", weight: 1 },
    ],
    binder: "#4d3417",
    gloss: 0.3,
    description: "Rich autumnal gold with deep russet stones.",
  },
  {
    id: "cotswold",
    brand: "DALTEX Bespoke",
    name: "Cotswold",
    sku: "Cotswold",
    family: "Neutral & Cream",
    stoneSize: "2-5mm",
    grainMm: 3.3,
    stones: [
      { color: "#e3cfa4", weight: 5 },
      { color: "#c9ad78", weight: 3.5 },
      { color: "#f4ecd8", weight: 2.6 },
      { color: "#9d7f52", weight: 1.6 },
      { color: "#6b563a", weight: 0.8 },
    ],
    binder: "#5c4a30",
    gloss: 0.28,
    description: "Honeyed limestone tones inspired by Cotswold stone.",
  },
  {
    id: "silver-birch",
    brand: "DALTEX Bespoke",
    name: "Silver Birch",
    sku: "Silver Birch",
    family: "Grey & Silver",
    stoneSize: "1-3mm",
    grainMm: 2.1,
    stones: [
      { color: "#d8d8d4", weight: 5 },
      { color: "#a3a5a3", weight: 3 },
      { color: "#f2f1ee", weight: 3 },
      { color: "#5f6163", weight: 1.6 },
      { color: "#2f3133", weight: 0.9 },
    ],
    binder: "#3d3f41",
    gloss: 0.35,
    description: "Bright silver-white, the lightest blend in the range.",
    new: true,
  },
  {
    id: "bronze-beach",
    brand: "DALTEX Bespoke",
    name: "Bronze Beach",
    sku: "Bronze Beach",
    family: "Earth & Copper",
    stoneSize: "2-5mm",
    grainMm: 3.1,
    stones: [
      { color: "#a86b3c", weight: 5 },
      { color: "#d9a06a", weight: 3 },
      { color: "#e9d3b4", weight: 2.4 },
      { color: "#734527", weight: 2 },
      { color: "#3f2716", weight: 1 },
    ],
    binder: "#4a2f1a",
    gloss: 0.31,
    description: "Coppered browns with a pale sand highlight.",
  },
  {
    id: "midnight",
    brand: "DALTEX Bespoke",
    name: "Midnight",
    sku: "Midnight",
    family: "Dark & Charcoal",
    stoneSize: "1-3mm",
    grainMm: 1.9,
    stones: [
      { color: "#26282b", weight: 6 },
      { color: "#45484c", weight: 3 },
      { color: "#101113", weight: 3 },
      { color: "#8b8f94", weight: 1.2 },
    ],
    binder: "#141517",
    gloss: 0.42,
    description: "Near-black basalt for a sharp, contemporary finish.",
    new: true,
  },
  {
    id: "sahara",
    brand: "DALTEX Bespoke",
    name: "Sahara",
    sku: "Sahara",
    family: "Gold & Amber",
    stoneSize: "3-6mm",
    grainMm: 4.4,
    stones: [
      { color: "#dcb977", weight: 5 },
      { color: "#f1e0bd", weight: 3.4 },
      { color: "#b78d47", weight: 2.6 },
      { color: "#8b6430", weight: 1.4 },
    ],
    binder: "#5b431f",
    gloss: 0.27,
    description: "Pale desert gold in a chunky 3–6mm grade.",
  },
  {
    id: "terracotta",
    brand: "DALTEX Bespoke",
    name: "Terracotta",
    sku: "Terracotta",
    family: "Earth & Copper",
    stoneSize: "2-5mm",
    grainMm: 3.2,
    stones: [
      { color: "#b0603c", weight: 5 },
      { color: "#d98d63", weight: 3 },
      { color: "#e8cbb1", weight: 2 },
      { color: "#7a3c22", weight: 2 },
      { color: "#41210f", weight: 1 },
    ],
    binder: "#4b2515",
    gloss: 0.3,
    description: "Warm clay reds with a softened cream fleck.",
  },
];

export const COLOUR_FAMILIES: ColourFamily[] = [
  "Gold & Amber",
  "Neutral & Cream",
  "Grey & Silver",
  "Dark & Charcoal",
  "Earth & Copper",
];

export const STONE_SIZES: StoneSize[] = ["1-3mm", "2-5mm", "3-6mm"];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
