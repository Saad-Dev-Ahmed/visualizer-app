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
      { color: "#f9f3e8", weight: 5 },
      { color: "#dfc9a7", weight: 4.4 },
      { color: "#b89a6e", weight: 4.2 },
      { color: "#806849", weight: 4.3 },
      { color: "#493a27", weight: 4.1 },
    ],
    binder: "#2c2015",
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
      { color: "#f5e9d1", weight: 4.5 },
      { color: "#e1c592", weight: 5 },
      { color: "#a3977d", weight: 4.1 },
      { color: "#696657", weight: 4.4 },
      { color: "#383831", weight: 4.9 },
    ],
    binder: "#1e1e1b",
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
      { color: "#f7f2e8", weight: 3.3 },
      { color: "#cfc5b3", weight: 5 },
      { color: "#ab9b85", weight: 4.2 },
      { color: "#7f6a54", weight: 3.4 },
      { color: "#4b3323", weight: 2.9 },
    ],
    binder: "#2d1911",
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
      { color: "#f6f4ed", weight: 3.2 },
      { color: "#cac5b8", weight: 2.5 },
      { color: "#8d8d84", weight: 2.3 },
      { color: "#525653", weight: 3.6 },
      { color: "#272b2b", weight: 5 },
    ],
    binder: "#0e1212",
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
      { color: "#f9f8f0", weight: 1.7 },
      { color: "#b4b7af", weight: 2.3 },
      { color: "#787f79", weight: 3.1 },
      { color: "#48504d", weight: 4.6 },
      { color: "#222928", weight: 5 },
    ],
    binder: "#0b0f0f",
    gloss: 0.36,
    description: "Classic mid-grey slate tones with a bright fleck.",
    popular: true,
  },
  {
    id: "athena",
    brand: "DALTEX Bespoke",
    name: "Athena",
    sku: "Athena",
    family: "Earth & Copper",
    stoneSize: "2-5mm",
    grainMm: 3.2,
    stones: [
      { color: "#f7f1ea", weight: 2 },
      { color: "#cca798", weight: 3 },
      { color: "#c37154", weight: 4.4 },
      { color: "#815444", weight: 5 },
      { color: "#462a21", weight: 4.1 },
    ],
    binder: "#26100c",
    gloss: 0.3,
    description: "Red granite with a white and grey fleck.",
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
