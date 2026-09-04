# Phase 5 — Generative finish

**Goal:** one button, one generation, one polished photoreal image of the blend
the customer actually chose.

**Ships:** the Nano Banana upsell — as a finishing touch, not a dependency.

**Estimate:** 1.5 days. **Depends on:** 1, 3, 4. **Gated by decisions D4 and D5.**

---

## The shape, and why it is a button and not the main loop

The user explores freely and instantly with the procedural renderer — free,
colour-exact, ~0 ms per swatch. They pick one. **Then** they press *"Photorealistic
finish"*, which spends exactly one generation.

One call per session, at the moment of highest intent. Compare with the rejected
design of generating on every swatch click:

| | Generate per click | Generate on demand |
| --- | --- | --- |
| Calls, 30-swatch browse | ~30 ≈ **$2.40** | **1** |
| Swatch latency | 2–5 s | **~0 ms** |
| Colour fidelity | Model-invented | Exact until the final image, then reference-constrained |
| `<3s` NFR | Unachievable | Met |

And the reference image is what makes the final image trustworthy: you send the
actual 1024² photograph of the stone from phase 1. The model is documented as
handling up to 10 reference images with high fidelity and excelling at
multi-reference consistency. **That is a far stronger constraint than any prompt**,
and it is why this phase depends on phase 1 being done properly rather than
approximately.

---

## Steps

### 1. Dependency and credentials

```powershell
npm i cloudinary
```

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` into
`.env.local`. **Server-side only.** No `NEXT_PUBLIC_` prefix on the secret, ever —
that is a credential leak into every browser bundle, and it is the single most
common way this integration goes wrong.

### 2. `app/api/render/route.ts`

Model: **`gemini-3.1-flash-image`** (Nano Banana 2). Not `-lite-` (weak on
multi-reference, which is the entire point here), not `gemini-3-pro-image` (pay
for it only if 2 proves insufficient, and prove it against the benchmark set).

Input order matters — scene first, reference second, prompt as text:

```ts
const input = [
  { type: "text",  text: prompt },
  { type: "image", mime_type: "image/jpeg", data: sceneBase64 },      // the photo
  { type: "image", mime_type: "image/jpeg", data: stoneReferenceBase64(productId) },
];

const interaction = await ai.interactions.create({
  model: "gemini-3.1-flash-image",
  input,
  response_format: {
    type: "image",
    aspect_ratio: nearestSupportedRatio(width, height),   // NOT defaulted
    image_size: "2K",
  },
});
// interaction.output_image.data is base64
```

**Do not let `aspect_ratio` default.** A mismatch against the uploaded photo's
dimensions letterboxes or crops the result, and it will not be obvious in a
thumbnail. Supported ratios are `1:1 3:2 2:3 3:4 4:3 4:5 5:4 9:16 16:9 21:9` —
write a small `nearestSupportedRatio()` helper and unit-check it on the benchmark
set's actual dimensions, which include portrait phone photos.

### 3. The prompt — `lib/vision/render-prompt.ts`

Parameterised from `Product` + the phase-3 analysis + the phase-1 manifest:

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

Preserve the original lighting: keep the existing shadows, ambient occlusion,
and the direction and warmth of the light.
```

The `{referenceWidthMm}` sentence is doing real work — a texture image carries no
scale, and that line is the only thing telling the model how big the stones are.
It is the whole reason phase 1 asks you to *measure* rather than assume 150.

`RENDER_PROMPT_VERSION`, bumped on every edit. Same discipline, same reason.

### 4. Cache, before generating

Phase 4's `renderKey`. Flow:

```
renderKey → cache hit?  → return the stored secure_url        ← the common path after launch
          → miss        → generate → Cloudinary → cache.set → return
```

Cloudinary: set **`public_id` = the render cache key**. Then the existence check
is a URL fetch rather than a store round trip, and re-uploads are naturally
idempotent with `overwrite: false`. Store `secure_url` **and** `version`; deliver
with `f_auto,q_auto`.

Sign uploads server-side. The browser gets a URL back, never a credential.

### 5. Failure handling — three distinct paths back to the procedural render

**The procedural render is the fallback, and it is already on screen.** That is
the good fortune of this architecture: nothing here can produce an empty canvas,
because the thing it improves on is already visible.

| Failure | Handling |
| --- | --- |
| Timeout (>30 s — generation is slower than analysis) | Keep the procedural render, toast "Couldn't generate the finish — your preview is still accurate" |
| Safety refusal | Same, different copy. Do not retry automatically |
| Empty response | Same. Log it — this is a prompt or ratio bug |

Never leave the user worse off than before they pressed the button. Do not clear
the canvas while generating; overlay a progress state on top of the existing
render.

### 6. UI — in `studio-toolbar.tsx` (forked in phase 0)

A single action. Enabled only when a blend is selected and the scene is analysed.
Result cross-fades over the procedural render at ~250 ms — **do not cut.** The
shell already keeps the previous texture during a blend load
(`visualizer-shell.tsx:186` in the original); extend that pattern.

Give the user a way back to the procedural view. A toggle, not a one-way door —
they may prefer it, and if the generated image drifted on colour they need to be
able to see that side by side. The existing compare wipe is right there.

### 7. Cloudinary also unlocks phase 2's rung 2

Credentials now exist, so implement the decode fallback: direct client upload →
fetch back as `f_jpg,w_1600`. That covers HEIC on desktop, TIFF, and PSD.

Use an **unsigned, restricted upload preset** for this — it is a client-side
upload and must not carry your secret. Restrict it to image formats and a size
cap in the Cloudinary console.

### 8. Colour fidelity — measure it, do not eyeball it

This is the risk the whole architecture was designed around, so verify it rather
than assuming the reference image solved it:

1. Sample the mean RGB of the rendered surface region (use the phase-3 mask to
   know where it is).
2. Compare against the weighted mean of that SKU's `stones[]` from
   `lib/products.ts`.
3. Convert to Lab, compute ΔE. Record per SKU across the benchmark set.

Set a tolerance — **ΔE < 5 is a reasonable starting line** (roughly "a
non-expert would not call it a different colour"), but calibrate it by measuring
the *procedural* render the same way first, since that is your known-good
reference point.

If a blend consistently drifts, **the reference photograph needs re-shooting** —
that is exactly the failure the architecture review predicted, and this metric is
how you catch it before a customer orders three tonnes of the wrong colour.

---

## Done when

```powershell
npx tsc --noEmit
npm run lint
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

- [ ] One photo + one stone produces a photoreal result whose surface ΔE is within
      tolerance of the SKU, across the benchmark set
- [ ] Second press for the same photo + stone returns the cached Cloudinary URL,
      **zero generation calls**
- [ ] Aspect ratio is correct for a portrait photo — no letterbox, no crop
- [ ] All three failure modes leave the procedural render standing and readable
- [ ] The user can toggle back to the procedural view
- [ ] `outputFileTracingIncludes` works: `/api/render` reads a stone master **on a
      real deployment**, not just `next dev`. This is the phase-1 gotcha coming due
- [ ] Cloudinary secret is absent from the client bundle — grep the built output
- [ ] The ΔE table exists, per SKU
- [ ] D4 (SynthID watermark) has an answer from the client

## What I will check

1. Model ID is exactly `gemini-3.1-flash-image`.
2. `aspect_ratio` is computed, never defaulted.
3. The stone reference is actually being sent — I will look for the second image
   in the input array. It is easy to write this route, have it work, and never
   notice the reference was dropped.
4. Cache check precedes generation. An expensive call after a cheap check that
   was never wired up is a classic.
5. The fallback keeps the procedural render on screen.
6. ΔE numbers exist and are real. This is the phase's actual deliverable — the
   pretty picture is table stakes, the proof it matches the SKU is the product.
7. `RENDER_PROMPT_VERSION` moved while you iterated.

## Do NOT do in this phase

- Do not put generation on the swatch-click path. Not "just for the popular ones",
  not "just on desktop". That decision was made in the architecture review for
  cost, latency, and fidelity reasons, all three of which still hold.
- Do not use `MASK_MODE_SEMANTIC` or `MaskReferenceImage`. **They do not exist in
  this API.** Both PRDs are wrong about this. Nano Banana inpainting takes no
  pixel mask.
- Do not send the phase-3 mask to the generator expecting it to be honoured. It
  cannot be. The prose `surfaceLabel` is your only handle on the region.
- Do not skip the ΔE measurement because the image looks good. Looking good is
  what diffusion models do; matching the SKU is what you are selling.
