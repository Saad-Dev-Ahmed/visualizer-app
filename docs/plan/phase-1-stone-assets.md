# Phase 1 — Stone reference assets

**Goal:** every blend has one high-quality, server-only, physically-scaled
reference photograph, wired to its product record and verified by a test.

**Ships:** a build script, a manifest, a loader, a parity test. No user-visible
change.

**Estimate:** half a day (plus photography time, if the current masters are not
good enough — see step 2).

**Depends on:** phase 0. **Blocks:** phase 5 (the reference images *are* the
colour-fidelity control for generation).

---

## Why this phase exists, and why it is not just "add some jpegs"

In phase 5 you hand Gemini the actual photograph of the stone alongside the scene
photo. That reference is the single strongest constraint on colour drift — far
stronger than any prompt. Nano Banana 2 is documented as handling up to 10
reference images with high fidelity and as excelling at multi-reference
consistency. **The reference images are the fidelity control, so they are worth
building properly.**

They are also *not* the same asset as the swatch chip in the sidebar, and
conflating the two is the mistake to avoid:

| | UI swatch chip | Gemini reference texture |
| --- | --- | --- |
| Consumed by | Browser, in the sidebar | Server only, inside `/api/render` |
| Size | 256×256 | **1024×1024** |
| Format | WebP | JPEG q92 |
| Location | `public/stones/` | `assets/stones/` (repo root) |
| Publicly downloadable | Yes, fine | **No** |

The second reason for keeping masters out of `public/` matters beyond tidiness:
that is the client's product photography, and anything in `public/` is a public
download.

## Current state — read this before starting

- `public/stones/*.webp` — six chips exist, wired through
  `lib/stones/manifest.ts` → `STONE_PHOTOS`. Working.
- `app/assets/stones/*.jpeg` — six files exist. **Nothing imports them**
  (`grep -rn "assets/stones" --include=*.ts*` returns only a comment). Their
  resolution and shooting quality are unverified.

So part of this phase is already half-done, in the wrong place, at an unknown
quality. Step 1 moves it; step 2 verifies it.

---

## Steps

### 1. Move the masters to the repo root

```powershell
git mv app/assets/stones assets/stones
```

`app/` is for routes and colocated route files. Loose image masters there are a
category error, and if a future Next version tightens what it scans in `app/`
you will get a confusing failure. Root `assets/` is the conventional home for
server-only source material.

Nothing imports them, so this move is free. Verify:

```powershell
npx tsc --noEmit
```

### 2. Audit the masters against the spec — do this before writing any code

```powershell
node -e "const s=require('sharp');for(const f of require('fs').readdirSync('assets/stones')) s('assets/stones/'+f).metadata().then(m=>console.log(f,m.width+'x'+m.height,m.format))"
```

(`sharp` is already in `node_modules` as a transitive dep; if that call fails,
`npm i -D sharp` first — step 4 needs it anyway.)

Then open each one and check it against this list. **This matters more than
resolution.** A 4K marketing hero shot of a stone pile produces *worse* results
than a modest flat texture sample, because the model reproduces what it is shown
— including the lighting baked into the shot.

- [ ] **Orthogonal.** Camera perpendicular to the material. No perspective, no
      vanishing edges.
- [ ] **Flat, diffuse light.** No hard shadows, no specular hotspots, no raking
      light. Overcast daylight or a softbox. Any lighting in the reference gets
      baked into the customer's driveway.
- [ ] **Cropped to material only.** No bag, no hand, no trowel, no scale card, no
      background. Edge to edge aggregate.
- [ ] **Colour-accurate.** White-balanced. If the reference is 200 K warm, every
      render of that SKU is wrong, forever, in a way no prompt fixes.
- [ ] **Consistent physical framing across every SKU.** Shoot the same real-world
      area each time — **150 mm across is a good standard.** If Arizona is shot at
      100 mm and Slate Grey at 300 mm, the model reads Slate Grey as having
      smaller stones and your whole catalogue's relative grain sizes are wrong.
- [ ] **Enough stones to read the mix** — roughly 30–60 in frame.
- [ ] **At least 1024×1024.**

**If they fail, they need re-shooting, and that is a real finding worth raising
with the client now rather than in phase 5.** Write down per SKU what is wrong.
An imperfect reference is still better than none — proceed with what you have,
record the debt, and re-shoot before launch.

### 3. Why 1024×1024 and not more

From the tokenisation rule in `../product-prd/google-gemini-image-understanding.md`
§832 — 258 tokens if both dimensions ≤384 px, otherwise tiled into 768² tiles at
258 tokens each, with crop unit ≈ `floor(min(w,h) / 1.5)`:

| Reference size | Crop unit | Tiles | Tokens | Verdict |
| --- | --- | --- | --- | --- |
| 384² | — | flat | **258** | Cheapest, but too few stones legible for a 1–3 mm blend |
| 512² | 341 | 2×2 | 1032 | Same cost as 1024, less detail |
| 768² | 512 | 2×2 | 1032 | Same cost as 1024, less detail |
| **1024²** | 682 | 2×2 | **1032** | **Best detail in this cost bucket** |
| 2048² | 1365 | 2×2 | 1032 | No extra cost, no benefit — resized before tiling |

The cost step is between 384 and 512, **not** between 768 and 1024. Once you are
paying 1032 tokens you may as well have the detail. ~1000 tokens per reference is
negligible beside the generated image itself.

*This arithmetic is derived from the doc's own rough formula. Confirm it with one
real `countTokens` call in phase 3 when you have an API key — it takes two
minutes and it either confirms the table or saves you from acting on a wrong one.*

### 4. `scripts/build-stone-swatches.mjs`

Masters → 256² WebP chips into `public/stones/`. Model it on the existing
`scripts/generate-masks.js` — same shape, same logging style, run the same way.

```js
// assets/stones/*.jpg  →  public/stones/*.webp  (256², q80)
// Idempotent: safe to re-run, overwrites in place.
// sharp is a devDependency: this is build-time only, never on the request path.
```

Register it in `package.json` beside the existing `masks` script:

```json
"scripts": { "stones": "node scripts/build-stone-swatches.mjs" }
```

Regenerate and confirm the chips still look right in `/visualizer`'s sidebar —
they are shared, so a bad chip is the one way this phase *could* touch the demo.

### 5. `lib/stones/reference.ts` — server-only loader

```ts
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { STONE_ASSETS } from "./assets";

// Module scope: survives warm invocations, so each stone is read from disk once
// per container rather than once per request.
const cache = new Map<string, string>();

export async function stoneReferenceBase64(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) return hit;

  const asset = STONE_ASSETS[id];
  if (!asset) throw new Error(`No reference image for stone "${id}"`);

  const bytes = await readFile(path.join(process.cwd(), "assets/stones", asset.file));
  const encoded = bytes.toString("base64");
  cache.set(id, encoded);
  return encoded;
}
```

Add `server-only` (`npm i server-only`) or at minimum a loud header comment. This
module reads from disk and must never be pulled into a client bundle; the import
guard turns that mistake into a build error instead of a runtime one.

### 6. `lib/stones/assets.ts` — the manifest

**New file. Do not edit `lib/stones/manifest.ts`** — that one holds `STONE_PHOTOS`
for the browser chips and is imported by the demo sidebar.

```ts
export type StoneAsset = {
  /** File in assets/stones/ — the 1024² master. */
  file: string;
  /** Real-world width the reference photograph covers, in mm. */
  referenceWidthMm: number;
  /** Shoot date, for re-shoot tracking. */
  captured?: string;
  /** Known problems with this master, from the phase-1 audit. */
  audit?: string;
};

export const STONE_ASSETS: Record<string, StoneAsset> = {
  arizona:       { file: "arizona.jpeg",     referenceWidthMm: 150, captured: "2026-09" },
  eden:          { file: "eden.jpeg",        referenceWidthMm: 150 },
  orchid:        { file: "orchid.jpeg",      referenceWidthMm: 150 },
  "winter-sage": { file: "winter-sage.jpeg", referenceWidthMm: 150 },
  "slate-grey":  { file: "slate-grey.jpeg",  referenceWidthMm: 150 },
  athena:        { file: "athena.jpeg",      referenceWidthMm: 150 },
};
```

**`referenceWidthMm` is not bookkeeping — it is load-bearing.** A texture image
carries no scale of its own. In phase 5 the prompt says *"the reference shows a
150 mm-wide area"*, and that sentence is the only thing telling the model how big
the stones are. If you guess it, you are guessing the grain size of every render.
Measure it, per SKU, honestly. If a master was shot at an unknown framing, record
your best estimate and put it in `audit`.

### 7. The parity test

Ten lines that save a class of 500s that only appear for the one SKU nobody
clicked during QA:

```ts
// Every Product.id has a STONE_ASSETS entry, and every referenced file exists.
for (const p of PRODUCTS) {
  assert(STONE_ASSETS[p.id], `no reference asset for ${p.id}`);
  assert(existsSync(join("assets/stones", STONE_ASSETS[p.id].file)), `missing file for ${p.id}`);
}
```

There is no test runner in this project yet. **Do not add one for this** — that is
a whole decision you do not need to make today. Write it as
`scripts/check-stone-assets.mjs`, exit non-zero on failure, and add:

```json
"scripts": { "check:stones": "node scripts/check-stone-assets.mjs" }
```

When a test runner arrives later (it should, before phase 7), this becomes a test
in one move.

### 8. `next.config.ts` — the deploy gotcha

Files outside `public/` are **not** automatically traced into a serverless bundle.

```ts
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/render": ["./assets/stones/**"],
  },
};
```

Symptom without it: works perfectly on `next dev`, throws `ENOENT` in production.
Check the current key name against
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/`
before writing it — this option has been renamed across versions and the docs in
`node_modules` are authoritative for *this* version.

The route does not exist until phase 5, and an entry for a non-existent route is
harmless. Add it now, while you remember, and **verify it on a preview deploy in
this phase, not on the day you ship generation.**

---

## Done when

```powershell
npm run stones          # regenerates all six chips, exits 0
npm run check:stones    # exits 0
npx tsc --noEmit        # clean
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

- [ ] `assets/stones/` is at the repo root, committed, six masters ≥1024²
- [ ] `/visualizer` sidebar chips still render correctly after regeneration
- [ ] `lib/stones/reference.ts` cannot be imported from a client component
      (try it — it should fail the build)
- [ ] A preview deploy has a route that successfully reads one master from disk
      (a throwaway `/api/_probe` route is fine; delete it after)
- [ ] The audit from step 2 is written down — per SKU, pass or what is wrong

## What I will check

1. `referenceWidthMm` values are measured, not copy-pasted 150s. Tell me how you
   established them.
2. `lib/stones/manifest.ts` is untouched and the new manifest is a separate file.
3. The masters are genuinely not in `public/`.
4. `outputFileTracingIncludes` uses the key this Next version actually supports.
5. The step-2 audit exists and is honest. "They all look fine" is not an audit.

## Do NOT do in this phase

- Do not call Gemini. No API key needed yet.
- Do not add a test framework.
- Do not put `sharp` in `dependencies` — it is `devDependencies`, build-time only.
  It must never appear on the request path.
