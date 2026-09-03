# Implementation Plan: Dynamic Image Upload

**Companion to:** `remarks-dynamic-image-upload-architecture.md`
**Target:** start Day 1 tomorrow; working end-to-end by Day 5
**Date:** 2 September 2026

---

## Decision log — what changed since the review

Two things settled since the architecture remarks, both worth recording:

1. **Stone reference images resolve most of the colour-fidelity objection (§3 of the review).** Passing the actual stone photograph as a reference input is a far stronger constraint than any text prompt. `gemini-3.1-flash-image` is documented as handling _"up to 10 images of objects with high-fidelity"_ and _"excelling at multiple reference image processing and consistency"_ (`google-gemini-image-generation.md` §397–409). This makes the generative path commercially viable in a way that prompt-only generation was not. **The reference images are worth building properly — they are the fidelity control.**

2. **The procedural renderer becomes the instant preview, not a competitor.** This directly answers the "proper loader with fallback image" requirement: the WebGL render appears in ~0 ms on swatch click, and the Gemini result cross-fades over it when ready. The user never sees a spinner over an empty canvas, and if generation fails or times out, the procedural render _is_ the fallback — already correct in colour, already on screen.

Both paths are built. Neither is wasted.

---

## Part 1 — Where the stone images live, and at what resolution

### 1.1 The one API fact that decides this

The generation API accepts image input as **inline base64** or a **File API URI**. It does not accept an arbitrary HTTPS URL:

```json
{ "type": "image", "mime_type": "image/png", "data": "<BASE64_IMAGE_DATA>" }
```

So a Cloudinary URL cannot be handed to Gemini directly — your server would have to fetch it and base64 it anyway, adding a network round trip on every generation. **Reading the file off local disk is strictly faster and simpler.** Keep the reference images in the repo.

### 1.2 Two assets, two jobs — do not conflate them

|                       | UI swatch chip          | Gemini reference texture          |
| --------------------- | ----------------------- | --------------------------------- |
| Consumed by           | Browser, in the sidebar | Server only, inside `/api/render` |
| Size                  | 256×256                 | **1024×1024**                     |
| Format                | WebP                    | JPEG q92 or PNG                   |
| Location              | `public/stones/`        | `assets/stones/`                  |
| Publicly downloadable | Yes (fine)              | No                                |

Keeping the high-quality masters out of `public/` matters for a second reason beyond tidiness: that is your product photography, and `public/` makes it a public download.

### 1.3 Directory layout

```
assets/stones/                       ← server-only masters, committed to git
  arizona.jpg                          1024×1024, the thing Gemini sees
  silver-birch.jpg
  ...
public/stones/                       ← generated, browser-facing
  arizona.webp                         256×256 UI chips
  ...
scripts/build-stone-swatches.mjs     ← masters → chips (same pattern as scripts/generate-masks.js)
lib/stones/manifest.ts               ← id → file + physical scale metadata
lib/stones/reference.ts              ← server-side base64 loader with warm cache
```

Add to `package.json`, alongside the existing `masks` script:

```json
"scripts": { "stones": "node scripts/build-stone-swatches.mjs" }
```

### 1.4 Resolution — 1024×1024, and here is the arithmetic

Your saved `google-gemini-image-understanding.md` §832 gives the tokenisation rule:

> 258 tokens if both dimensions ≤ 384 pixels. Larger images are tiled into 768×768 pixel tiles, each costing 258 tokens.
> Crop unit size ≈ `floor(min(width, height) / 1.5)`; divide each dimension by it and multiply.

Working that through for a square texture:

| Reference size | Crop unit | Tiles     | Tokens   | Verdict                                                 |
| -------------- | --------- | --------- | -------- | ------------------------------------------------------- |
| 384×384        | —         | flat rate | **258**  | Cheapest, but too few stones legible for a 1–3 mm blend |
| 512×512        | 341       | 2×2       | 1032     | Same cost as 1024, less detail                          |
| 768×768        | 512       | 2×2       | 1032     | Same cost as 1024, less detail                          |
| **1024×1024**  | 682       | 2×2       | **1032** | **Best detail available in this cost bucket**           |
| 2048×2048      | 1365      | 2×2       | 1032     | No extra cost, but no benefit — resized before tiling   |

**The jump is between 384 and 512, not between 768 and 1024.** Once you are paying 1032 tokens you may as well have the detail, so **1024×1024** is the answer. At roughly 1000 tokens per reference this is negligible next to the generated image itself.

_(Arithmetic derived from the doc's own "rough formula" — worth confirming against a real `countTokens` call in Day 1, it takes two minutes.)_

### 1.5 What the reference photograph must look like — this matters more than resolution

A 4K marketing hero shot of a stone pile will produce **worse** results than a modest flat texture sample. The model reproduces what it is shown, including the lighting. Shooting requirements:

- **Orthogonal.** Camera perpendicular to the material, no perspective, no vanishing edges.
- **Flat, diffuse light.** No hard shadows, no specular hotspots, no directional raking light. Overcast daylight or a softbox. Any lighting baked into the reference gets baked into the driveway.
- **Cropped to material only.** No bag, no hand, no trowel, no scale card, no background. Edge to edge aggregate.
- **Colour-accurate.** White-balance against a grey card. This is the whole point of the exercise — if the reference is 200 K warm, every render of that SKU is wrong.
- **Consistent physical framing across every SKU.** Shoot the same real-world area each time — **150 mm across is a good standard**. If Arizona is shot at 100 mm and Silver Birch at 300 mm, the model will read Silver Birch as having smaller stones, and the relative grain sizes across your catalogue will be wrong.
- **Enough stones to read the mix.** Roughly 30–60 stones in frame. At 150 mm across, a 1–3 mm blend gives you plenty; a 3–6 mm blend still reads.

**Record the framing in the manifest.** A texture image carries no scale on its own — the prompt has to supply it (§2.4).

### 1.6 Manifest and loader

```ts
// lib/stones/manifest.ts
export type StoneAsset = {
  /** File in assets/stones/ — the 1024² master. */
  file: string;
  /** Real-world width the reference photograph covers, in mm. */
  referenceWidthMm: number;
  /** Optional: shoot date, for re-shoot tracking. */
  captured?: string;
};

export const STONE_ASSETS: Record<string, StoneAsset> = {
  arizona: { file: "arizona.jpg", referenceWidthMm: 150, captured: "2026-09" },
  // ...one per Product id in lib/products.ts
};
```

```ts
// lib/stones/reference.ts  — server only
import { readFile } from "node:fs/promises";
import path from "node:path";
import { STONE_ASSETS } from "./manifest";

// Module scope: survives warm invocations, so each stone is read from disk once
// per container rather than once per request.
const cache = new Map<string, string>();

export async function stoneReferenceBase64(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) return hit;

  const asset = STONE_ASSETS[id];
  if (!asset) throw new Error(`No reference image for stone "${id}"`);

  const bytes = await readFile(
    path.join(process.cwd(), "assets/stones", asset.file),
  );
  const encoded = bytes.toString("base64");
  cache.set(id, encoded);
  return encoded;
}
```

> **⚠ Deployment gotcha — this will bite you on the first deploy.** Files outside `public/` are not automatically traced into a serverless bundle. Add to `next.config.ts`:
>
> ```ts
> outputFileTracingIncludes: { "/api/render": ["./assets/stones/**"] }
> ```
>
> Symptom without it: works perfectly on `next dev`, throws `ENOENT` in production. Verify on a preview deploy during Day 1, not on Day 5.

### 1.7 A parity test worth writing on Day 1

Every `Product.id` in `lib/products.ts` must have a `STONE_ASSETS` entry, and every file referenced must exist on disk. One test, ten lines, saves a class of 500s that only appear for the one SKU nobody clicked during QA.

---

## Part 1b — Accepting any upload format

**Requirement: whatever the user uploads works, regardless of format.**

This is achievable in practice. One correction to how it's usually assumed to work, though: **Gemini's format support is not the constraint.**

### 1b.1 Why Gemini's MIME list doesn't matter here

Gemini accepts exactly five formats (`google-gemini-image-understanding.md` §797):

> PNG · JPEG · WEBP · HEIC · HEIF

That looks restrictive, but `prepareUpload()` in `lib/image.ts` already draws every upload onto a canvas and re-encodes with `toDataURL("image/jpeg", 0.9)`. **Gemini never sees the original file — it only ever receives JPEG.** So the real question is not "what does Gemini accept" but **"what can we decode into a canvas."** That is the only boundary that matters, and it is entirely ours to widen.

### 1b.2 The decode ladder

```
File (any format)
  │
  ├─ 1. Client decode: createImageBitmap → canvas → JPEG
  │      covers JPEG, PNG, WebP, GIF, BMP, AVIF everywhere; HEIC on Safari/iOS
  │
  ├─ 2. Fallback: direct client → Cloudinary upload, fetch back as f_jpg,w_1600
  │      covers HEIC on desktop, TIFF, PSD, and most of the long tail
  │
  └─ 3. Still failing → clear error naming the format and suggesting a re-save
```

**Step 2 is why this is cheap.** Cloudinary is already in the stack for Day 4, its format coverage is broader than `sharp`'s, and the client uploads to it directly — which sidesteps the serverless request body limit entirely. Routing a 20 MB HEIC through your own `/api/decode` would 413 on Vercel's default body cap; going direct to Cloudinary never touches your function.

So: **no new dependency, no new infrastructure, and one fallback branch.**

### 1b.3 Changes to `lib/image.ts`

**Drop the allowlist.** `ACCEPTED_TYPES` currently names four formats and gates on them. Replace the gate with "try to decode it" — the decoder is the only honest test of whether a file is usable.

```ts
// Replace the ACCEPTED_TYPES check. The <input> can still hint with
// accept="image/*", but nothing should be rejected on MIME type alone —
// browsers report .heic as "" or "application/octet-stream" often enough
// that a type allowlist rejects files that would have decoded fine.
```

**Switch `loadImage()` to `createImageBitmap`.** Three wins over `new Image()` + object URL: it decodes off the main thread, it works on the `File` directly, and — the one that matters — it takes an explicit orientation flag:

```ts
const bitmap = await createImageBitmap(file, {
  imageOrientation: "from-image",
});
```

**Raise `MAX_UPLOAD_BYTES`.** 20 MB rejects large HEIC bursts and most TIFFs. 50 MB is a reasonable ceiling now that step 2 exists.

### 1b.4 ⚠ EXIF orientation — the bug this pipeline is uniquely exposed to

Phone photos carry an EXIF orientation flag. A portrait photo is very often stored as landscape bytes plus "rotate 90°".

In a normal gallery app, getting this wrong means a sideways picture — annoying, obvious, easy to spot. **In your pipeline it means something worse and much harder to diagnose:** Gemini returns the mask polygon and quad in the coordinate space of _the bytes you sent it_. If the browser displays the photo auto-rotated but you sent the unrotated bytes, the mask arrives rotated 90° relative to what the user sees. The surface renders in the wrong place, the perspective is nonsense, and nothing in the response looks wrong.

**Fix it once, at the edge:** normalise orientation during `prepareUpload()` so the JPEG that leaves the browser is already visually upright, with the flag stripped. Every downstream stage — hash, Gemini, mask, renderer, Cloudinary — then shares one coordinate space. `imageOrientation: "from-image"` plus the canvas re-encode does this; Cloudinary auto-orients on upload for the step-2 path.

Add a portrait phone photo with a non-trivial orientation flag to the Day 1 benchmark set. This will not be caught by testing with desktop screenshots.

### 1b.5 What stays genuinely out of reach

Honest boundary, so nobody promises it:

| Format                              | Status                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JPEG, PNG, WebP, GIF, BMP, AVIF     | Client decode, everywhere                                                                                                                                                                                        |
| HEIC / HEIF                         | Client on Safari; Cloudinary fallback elsewhere                                                                                                                                                                  |
| TIFF, PSD                           | Cloudinary fallback                                                                                                                                                                                              |
| **Camera RAW** (CR2, NEF, ARW, DNG) | **Not supported.** Every RAW contains a full-size embedded JPEG preview that could be extracted, but nobody photographs their driveway in RAW for this. Reject with a clear message rather than building for it. |
| SVG                                 | Reject deliberately — vector input is meaningless here and SVG upload is an XSS vector.                                                                                                                          |

Everything above the RAW line is realistic consumer input. That is what "any format" should mean in practice.

---

## Part 2 — The build, day by day

Each day is one PR, and each ends somewhere shippable.

---

### Day 1 — Assets and catalogue

**Goal: every stone has a correct reference image, wired to its product record.**

1. Create `assets/stones/` and `public/stones/`. Add `assets/stones/` to git (it is source material, not build output).
2. Drop in the stone masters at 1024×1024, processed to the §1.5 spec.
3. Write `lib/stones/manifest.ts` with `referenceWidthMm` per SKU.
4. Write `scripts/build-stone-swatches.mjs` — masters → 256² WebP into `public/stones/`. Model it on the existing `scripts/generate-masks.js`.
5. Write `lib/stones/reference.ts` with the warm cache.
6. Add `outputFileTracingIncludes` to `next.config.ts`. **Push a preview deploy and confirm the file reads.**
7. Write the manifest/product parity test.
8. Run one `countTokens` call against a 1024² reference to confirm the ~1032 figure.

**Also on Day 1, before writing pipeline code — build the benchmark set.** Collect **20–30 real photos**: interior and exterior, straight-on and oblique, curved paths, driveways with a car parked on them, steps, planters, overcast and hard-sun, one deliberately terrible phone snap. Include **a portrait photo straight off an iPhone (HEIC, with an EXIF orientation flag)** and **one TIFF or PSD** — those two exercise the whole of Part 1b. Every subsequent day is evaluated against this set. Skipping this means tuning prompts against three photos and discovering the failure modes in production.

9. Implement the Part 1b decode ladder in `lib/image.ts`: drop `ACCEPTED_TYPES`, switch to `createImageBitmap` with `imageOrientation: "from-image"`, raise `MAX_UPLOAD_BYTES` to 50 MB, and stub the Cloudinary fallback branch (wire it up properly on Day 4 when Cloudinary credentials land).

**Done when:** `npm run stones` regenerates every chip, the parity test passes, a preview deploy can read a master from disk, and every photo in the benchmark set — HEIC and TIFF included — reaches the canvas upright.

---

### Day 2 — Scene understanding

**Goal: `/api/analyze` returns a usable mask, quad and scale for any uploaded photo.**

1. `app/api/analyze/route.ts` — accepts the normalised data URL from `prepareUpload()`, calls `gemini-3.7-flash` with structured output.
2. Request the schema from §5 of the review: `sceneType`, `surface` (`box_2d` + `mask` polygon), `occluders[]`, `quad`, `planeMetres`, `scaleAnchor`, `lighting`, `confidence`.
3. `maskFromPolygons()` in `lib/image.ts`, beside the existing `maskFromQuad()` — same 3 px blur, same output shape, so the renderer needs no changes. Canvas2D `fill()` for the surface, then `globalCompositeOperation = "destination-out"` per occluder.
4. Wire into `visualizer-shell.tsx`: on upload, call analyze, feed the result into the existing scene state instead of `DEFAULT_UPLOAD_QUAD`.
5. Keep the drag handles live as manual override.
6. **Run the full benchmark set.** Record per photo: mask quality (1–5 by eye), whether occluders were caught, grain scale plausibility, latency, reported confidence. This table is what calibrates your confidence threshold — do not guess it.

**Done when:** uploads render as well as demo scenes on a clear majority of the benchmark set, with zero generation calls.

> This day alone probably fixes the reported breakage. Confirm that before moving on — if it does, everything after is enhancement, and you can re-sequence with that knowledge.

---

### Day 3 — Generation with reference

**Goal: `/api/render` produces a photorealistic result for one photo + one stone.**

1. `app/api/render/route.ts` — model `gemini-3.1-flash-image`.
2. Inputs, in order: **the scene photo**, **the stone reference** (base64 from `stoneReferenceBase64`), then the prompt.
3. Set `response_format.aspect_ratio` from the uploaded photo's dimensions and `image_size` to `"2K"`. Do not let it default — a ratio mismatch letterboxes or crops the result.

**Prompt template** (parameterised from `Product` + the Day 2 analysis + the manifest):

```
You are editing a photograph of a property.

Replace ONLY the ground surface identified as: {surfaceLabel}.
Leave everything else exactly as it is — the building, sky, planting,
boundaries, vehicles, and every object standing on the surface, including
their contact shadows.

The new surface is resin-bound aggregate matching the attached reference
texture. The reference photograph shows a {referenceWidthMm}mm-wide area of
{productName}: a {stoneSize} blend with an average stone diameter of
{grainMm}mm. Reproduce that exact colour mix and stone size.

Lay the aggregate flat and seamless across the whole surface, in correct
perspective for the scene, running beneath any object standing on it.

Preserve the original lighting: keep the existing shadows, ambient
occlusion, and the direction and warmth of the light.
```

The `{referenceWidthMm}` line is doing real work — it is the only thing telling the model the physical scale of the texture it has been handed.

4. **Evaluate colour fidelity properly, not by eye.** Sample the mean RGB of the rendered surface region and compare against the weighted mean of the SKU's `stones[]` from `products.ts`. Set a ΔE tolerance and record it per SKU across the benchmark set. If a blend consistently drifts, the reference photo needs re-shooting — this is exactly the failure the review warned about, and this metric is how you catch it before a customer does.
5. Handle failure explicitly: timeout, safety refusal, and empty response each need a distinct path back to the procedural render.

**Done when:** a photo + stone produces a result whose surface colour is within tolerance of the SKU across the benchmark set.

---

### Day 4 — Cache, Cloudinary, database

**Goal: nothing is ever generated twice.**

**Cache keys** — two layers, per §6 of the review:

```
analysis:  sha256(normalised image bytes)          // one row per photo
render:    sha256(image_hash + product_id + prompt_version + model_version)
```

The version fields are mandatory. Without them, a prompt fix serves pre-fix results forever with no way to identify the poisoned rows.

**Schema:**

```prisma
model SceneAnalysis {
  imageHash    String   @id
  sceneType    String
  surfaceMask  Json
  occluders    Json
  quad         Json
  planeMetres  Json
  lighting     Json
  confidence   Float
  modelVersion String
  promptVersion String
  createdAt    DateTime @default(now())
  renders      Render[]
}

model Render {
  cacheKey      String   @id
  imageHash     String
  productId     String
  cloudinaryId  String
  secureUrl     String
  version       String
  modelVersion  String
  promptVersion String
  createdAt     DateTime @default(now())
  analysis      SceneAnalysis @relation(fields: [imageHash], references: [imageHash])

  @@index([imageHash, productId])
}
```

**Cloudinary:**

- `public_id` = the render cache key. Existence checks become a URL fetch, uploads are idempotent with `overwrite: false`.
- Sign uploads **server-side only**. The secret never reaches the browser.
- Store `secure_url` _and_ `version`; deliver with `f_auto,q_auto`.

**Request flow in `/api/render`:**

```
hash photo → analysis cache hit? → else analyze, store
           → render cache hit?   → return secure_url  ← the common path
           → else generate → upload to Cloudinary → store row → return
```

> **⚠ Retention decision blocks this day.** The blueprint promises 24-hour purge of uploads; caching renders indefinitely contradicts it. These are photographs of people's homes. **Recommended: store only the derived analysis plus generated renders, and purge the original upload at 24 h** — a re-upload re-hashes to the same key and still hits the cache, so you keep nearly all the saving. Settle this before writing the schema, not after.

**Done when:** the second request for the same photo + stone returns a Cloudinary URL with zero Gemini calls, provably, from logs.

---

### Day 5 — UX states

**Goal: the flow the requirement describes — loader, fallback, no dead ends.**

```
idle → uploading → analysing → ready ⇄ swatch click
                                          ↓
                        procedural render paints INSTANTLY (the fallback)
                                          ↓
                        generation runs; result cross-fades over it
                                          ↓
                              cached hit? → skip straight to result
```

- **Analysing is the only unavoidable wait,** and it happens once per photo. Label the phases: _"Finding the surface…"_ → _"Measuring perspective…"_ Same duration, reads as progress rather than as broken.
- **The procedural render is the fallback image.** On swatch click it appears immediately in the right colours. Generation improves it; failure leaves it standing. No spinner over an empty canvas, ever.
- **Cross-fade, don't cut.** ~250 ms. `visualizer-shell.tsx:186` already keeps the previous texture during a blend load — extend that pattern.
- **Cache hits skip the loader entirely.** Show the cached result immediately. Most clicks after launch will be cache hits, and they should feel like it.
- **Confidence-driven fallback ladder:** AI mask → last good mask for this photo → `DEFAULT_UPLOAD_QUAD` with handles pre-opened → demo scene with an explanation. Below the Day 2 threshold, auto-open the handles with _"Drag the corners to match your driveway."_
- **Reject non-property photos** on `sceneType: "unsupported"` with a friendly retry.
- **Debounce swatch clicks** ~400 ms. A user clicking through ten stones should not fire ten generations for nine surfaces they never looked at. This is a real cost line, not a nicety.

**Done when:** every state has a visible, sensible screen, and no failure leaves the canvas empty.

---

## Environment and dependencies

```
GEMINI_API_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
DATABASE_URL
```

```
@google/genai   cloudinary   prisma  @prisma/client   zod   sharp
```

`sharp` is for the Day 1 swatch script only — build-time, not request-path.

---

## Guardrails

| Thing        | Guard                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Cost runaway | Debounce clicks; rate-limit `/api/render` per session; log every uncached generation with its key                       |
| Prompt drift | `promptVersion` in the cache key, bumped on every prompt edit                                                           |
| Colour drift | ΔE check from Day 3, run over the benchmark set in CI                                                                   |
| Deploy break | `outputFileTracingIncludes` verified on preview during Day 1                                                            |
| Privacy      | Retention decision settled before the Day 4 schema                                                                      |
| Watermark    | Every generated image carries a SynthID watermark. Confirm that is acceptable for customer-facing quotes before launch. |

---

## Open questions to settle before Day 4

1. **Retention** — store uploads, or only derived analysis and renders? Blocks the schema. _(Recommendation: derived only.)_
2. **How many SKUs get reference photography for v1?** All of them, or the top ten by sales with procedural-only for the tail? Affects Day 1 scope directly.
3. **Does the SynthID watermark matter** for a customer-facing quotation image?

---

## The shortest honest summary

Day 1 gets the assets right. Day 2 probably fixes the bug you actually reported. Days 3–5 add the photorealistic layer on top of a system that already works without it.

If Day 2 alone makes uploads good enough, that is a real result — treat Days 3–5 as an upgrade you choose, rather than a commitment you already made.
