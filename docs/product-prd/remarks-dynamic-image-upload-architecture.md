# Remarks: Dynamic Image Upload Architecture

**Status:** Review notes on the proposed Gemini pipeline
**Reviewed:** `Custom-Stone-Visualizer-Technical-Architecture-Implementation-Blueprint.md`, `prd-visualizer-app-with-gemini-AI-IMAGE-GENERATION-api.md`, the saved Gemini docs, and the current codebase
**Date:** 2 September 2026

---

## Summary

The proposed pipeline is:

```
[User Image] → 1. Gemini File API → 2. Image Understanding → 3. Inpainting (Nano Banana) → [Result]
```

My recommendation is to **keep steps 1 and 2, and drop step 3 from the main loop.**

The app does not break because it lacks an image _generation_ model. It breaks because it lacks _scene understanding_ for uploaded photos. Those are different problems, and only one of them needs solving. Adding generation to the per-swatch path costs roughly 30× more, makes the interaction 2–5 seconds slower per click, and — the part that matters commercially — stops the rendered surface from being a faithful picture of the SKU the customer will actually buy.

There are also three factual issues in the current blueprint that will cause implementation to fail if built as written. Those are in §2.

---

## 1. Diagnosis — why uploads actually break

The renderer is not the problem. `lib/render/surface-renderer.ts` is genuinely good: it lifts lighting out of the original photograph and multiplies it back over a procedurally synthesised aggregate, with perspective from a homography. On the demo scenes it produces convincing results.

It produces convincing results on demo scenes because **each demo scene ships three hand-authored inputs that an upload does not have**:

| Input                                           | Demo scene                                         | Uploaded photo                         | Consequence when wrong                                                                      |
| ----------------------------------------------- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Mask** — which pixels may be replaced         | Hand-checked PNG (`public/demo/driveway-mask.png`) | `maskFromQuad()` — a blurred trapezoid | Cars, planters, steps, and kerbs get paved over. The surface bleeds past its real boundary. |
| **Quad** — the ground plane homography          | Hand-tuned per scene (`lib/scenes.ts`)             | `DEFAULT_UPLOAD_QUAD`, a fixed guess   | Perspective is wrong for every photo that isn't shot from the assumed height and angle.     |
| **planeMetres** — real-world size of that plane | Estimated per scene from the photograph            | A constant                             | Grain scale is wrong. A 1–3mm blend renders like cobblestones, or like sand.                |

So the failure is concentrated in one place: **nothing computes a mask, a quad, or a scale for an arbitrary photo.** That is a perception task. Gemini's image understanding does it directly, and — importantly — returns it as _data_ you can feed into the renderer you already have.

The user-draggable quad in `surface-stage.tsx` is currently the only mechanism bridging this gap, and it asks the user to do the model's job.

---

## 2. Three corrections to the current blueprint

These need fixing before implementation, because the code they imply cannot be written.

### 2.1 `MASK_MODE_SEMANTIC` and `MaskReferenceImage` do not exist in the Gemini API

Both PRDs make this the centrepiece of the masking strategy:

> _"Utilize the `MaskReferenceImage` configuration with `MASK_MODE_SEMANTIC` to automatically isolate specific classes like a floor or walkway"_

Those are parameters from the older **Imagen editing API on Vertex AI**, not the Gemini API. Your own saved documentation confirms what Nano Banana actually offers — `google-gemini-image-generation.md`, line 2034:

> **2. Inpainting (semantic masking)** — _"Conversationally define a 'mask' to edit a specific part of an image while leaving the rest untouched."_

The quotation marks around "mask" are doing real work there. Nano Banana inpainting takes **no pixel mask input at all**. You describe the region in prose — _"change only the driveway to…"_ — and the model decides the boundary internally. You cannot hand it a mask, and you cannot get the mask it used back out.

This is decisive for your product. You need the mask as a first-class artifact: to render into, to cache, to let the user correct, and to keep the surface inside the driveway. A pipeline whose masking is invisible and unadjustable cannot support "drag the corners to fix it," which is your only recovery path when the model gets it wrong.

**Where masks _are_ available:** the image _understanding_ API returns them as structured data — `google-gemini-image-understanding.md`, §Segmentation, line 617. Each item comes back as `box_2d` (`[ymin, xmin, ymax, xmax]`, normalised 0–1000) plus `mask`, a polygon of `[x, y]` points. That is exactly the input your renderer wants.

### 2.2 Imagen 3 is a deprecated path

The PRD names _"Gemini-Image-Generation Model: Google Imagen 3"_ as the foundational model. Your saved `google-gemini-imagen.md` opens at line 15 with **"Migration to Nano Banana"**, and marks Imagen 4 as deprecated at line 547. Building on Imagen 3 means building on a path Google is actively migrating people off.

### 2.3 The model names conflate two different families

The blueprint refers to _"Gemini 3.7 Flash and 3 Pro (which is to be referred to as the 'Nano Banana' architecture)"_. These are not the same thing. The actual model IDs, from your saved docs (lines 24–31):

| Purpose                                                 | Model ID                      | Notes                                                                |
| ------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Image **understanding** (segmentation, geometry, scale) | `gemini-3.7-flash`            | Text/vision in, structured JSON out. This is your workhorse.         |
| Image **generation** — versatile                        | `gemini-3.1-flash-image`      | Nano Banana 2                                                        |
| Image **generation** — fast/cheap                       | `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite. Not good at multi-reference or sequential edits. |
| Image **generation** — premium                          | `gemini-3-pro-image`          | Nano Banana Pro                                                      |

`gemini-3.7-flash` is not a Nano Banana model and does not generate images. `gemini-3-pro-image` is not `gemini-3-pro`. Getting this wrong produces 404s, not degraded output.

---

## 3. The commercial argument against generating the surface

This is the remark I'd most want you to weigh, because it is not a technical preference — it's product risk.

`lib/products.ts` describes each blend as real, specific data. Arizona is six named stone colours at specific weights, a binder of `#5d3f1c`, gloss `0.32`, mean grain 2.1mm. The customer receives physical material matching that specification.

A diffusion model asked for _"photorealistic Arizona golden gravel driveway, 8k, maintaining existing shadows"_ returns **a** golden gravel. Not Arizona. The colour mix will drift between generations, between photos, and with the lighting of the input scene — because the model is synthesising a plausible gravel from its training distribution, not sampling your six hex values at your six weights.

The exposure: a customer approves a render, orders several thousand pounds of resin-bound aggregate, and the delivered surface does not match the picture. "The AI made up the colour" is not a defence that survives a chargeback or a trading-standards complaint.

Your **current procedural renderer is more accurate than generative inpainting** for this specific job, because its colours come from the SKU record. That is an unusual and genuinely valuable position, and switching to generation would give it away.

The prompt-scale mitigation the blueprint proposes ("large 12x12 inch irregular slabs") helps geometry, not colour fidelity. There is no prompt that makes a diffusion model reproduce a six-way weighted colour mix reliably.

---

## 4. Recommended pipeline

**Generate the understanding, not the surface.**

```
[User Image]
   ↓
1. Normalise client-side (already done — lib/image.ts, 1600px, JPEG q0.9)
   ↓
2. POST to /api/analyze  →  Gemini 3.7 Flash, ONE call per photo
   ↓  structured JSON: mask polygons, occluders, quad, planeMetres, lighting, confidence
3. Cache the analysis (DB, keyed by image hash)
   ↓
4. Rasterise polygons → mask canvas → EXISTING WebGL renderer
   ↓
[Result — and every subsequent swatch click is instant and free]
```

### Why this is materially better

|                          | Proposed (inpaint per click)                      | Recommended (analyse once)           |
| ------------------------ | ------------------------------------------------- | ------------------------------------ |
| AI calls per session     | 1 per stone clicked                               | 1 per photo uploaded                 |
| Cost, 30-swatch browse   | ~30 generations ≈ **$2.40** at your $0.08 overage | 1 understanding call ≈ **cents**     |
| Swatch-switch latency    | 2–5s                                              | **~0ms** (already true today)        |
| SKU colour fidelity      | Model-invented                                    | **Exact, from `products.ts`**        |
| Mask correctable by user | No — mask is internal                             | **Yes — same drag handles as today** |
| Result reproducible      | No                                                | **Yes, via cache**                   |

The latency column is the one to feel. The current app feels good precisely because clicking a stone is instantaneous. Putting a 2–5 second generation behind every click doesn't just cost money — it removes the interaction that makes the product pleasant. And your `<3s` NFR is unachievable on a per-click generative path once you add upload and network time.

### Where Nano Banana still earns a place

I am not arguing it has no role. Two good ones:

1. **A "photorealistic finish" step on the final chosen blend only.** User explores freely with the fast procedural renderer, picks one, then presses a button that spends one generation to produce a polished shareable image. One generation per session, at the moment of highest intent — and your existing render is the reference input, which constrains the colour drift considerably.
2. **Fallback when segmentation confidence is low.** If Gemini can't find the surface, conversational inpainting is a graceful degradation instead of a dead end.

Both are opt-in, both are one call, both fit your pricing tiers naturally.

---

## 5. What to ask the understanding model for

One structured-output call per photo. Request all of it at once — you're paying for the image tokens either way.

```jsonc
{
  "sceneType": "exterior",           // interior | exterior — informs segmentation granularity
  "surface": {
    "label": "driveway",
    "box_2d": [420, 0, 1000, 1000],  // ymin, xmin, ymax, xmax — normalised 0-1000
    "mask": [[x, y], ...]            // polygon within the bbox, normalised 0-1000
  },
  "occluders": [                     // SUBTRACT these from the mask
    { "label": "car", "box_2d": [...], "mask": [[x, y], ...] },
    { "label": "planter", "box_2d": [...], "mask": [[x, y], ...] }
  ],
  "quad": [[x, y], [x, y], [x, y], [x, y]],  // ground plane: far-L, far-R, near-R, near-L
  "planeMetres": [3.7, 4.0],
  "scaleAnchor": "car width ≈ 1.8m",         // make the model show its working
  "lighting": { "direction": "upper-left", "hardness": 0.7, "colourCast": "warm" },
  "confidence": 0.82
}
```

Notes on the fields that matter:

- **`occluders` is what fixes the visible failure.** The mask must be `surface MINUS occluders`. This is the difference between paving around a parked car and paving over it. Ask for them explicitly — the model will not volunteer them.
- **`planeMetres` is the scale trick.** Vision models estimate absolute distance poorly in the abstract but reason well about known object sizes. Instruct it to anchor on something measurable in frame — a car is ~1.8m wide, a UK brick course ~215mm, a standard door ~2.0m, a paving slab ~450mm — and to report which anchor it used in `scaleAnchor`. That field is also your debugging handle when grain size comes out wrong.
- **`lighting`** maps onto the shader uniforms already in `surface-renderer.ts` (`u_shading`, `u_colorCast`), which are currently hand-tuned constants.
- **`confidence`** drives the UX fallback ladder in §7. Ask for it, and calibrate the threshold against real photos before trusting it.

### Implementation notes

- Add `maskFromPolygons()` alongside the existing `maskFromQuad()` in `lib/image.ts` — same 3px blur, same output shape, so the renderer is untouched. Rasterise via Canvas2D `fill()` for the surface, then `globalCompositeOperation = "destination-out"` for each occluder.
- **Skip the File API for this path.** It is for requests over 20MB (`google-gemini-image-understanding.md`, line 234) or for reusing one image across many calls. `prepareUpload()` already downscales to 1600px / ~400KB, and you're making one call. Inline base64 is simpler and one round trip shorter. Revisit only if you add multi-step refinement.
- **Set expectations on mask quality.** Gemini's segmentation polygons are coarser than a dedicated model like SAM. They will be good enough to beat the current trapezoid comfortably, but they will not be pixel-perfect on a curved path with planting. Keep the draggable quad as a manual override: **the AI proposes, the user adjusts.** This is also better UX than a black box — it makes a wrong result recoverable in two seconds instead of abandoning the session.

---

## 6. Caching and persistence

Your instinct here is right and it's the highest-leverage thing in this document. One refinement: with the hybrid pipeline, **the expensive cacheable artifact is the analysis, not the image** — which means far fewer rows and much higher hit rates.

### Layer 1 — Scene analysis cache (the money saver)

**Key:** `sha256(normalised image bytes)` — hash _after_ `prepareUpload()` so the same photo hashes identically across devices.

```
scene_analysis
  image_hash        text primary key
  scene_type        text
  surface_mask      jsonb    -- polygon
  occluders         jsonb    -- polygon[]
  quad              jsonb
  plane_metres      jsonb
  lighting          jsonb
  confidence        real
  model_version     text     -- 'gemini-3.7-flash'
  prompt_version    text     -- bump to invalidate
  created_at        timestamptz
```

Hit rate is high in practice: users refresh, come back the next day, re-upload the same photo after trying a different room, and share links with colleagues. One row serves every product in the catalogue for that photo — with the per-click generative design you'd need one row _per photo × per product_, roughly 30× the rows for a fraction of the hit rate.

### Layer 2 — Rendered image cache (only for the optional generative finish)

**Key:** `sha256(image_hash + product_id + surface_type + prompt_version + renderer_version)`

The version fields are not optional. Omit them and every prompt tweak you ever ship will serve stale results from before the fix, permanently, with no way to tell which rows are poisoned.

### Cloudinary specifics

- **Set `public_id` to the cache key.** Then the existence check is a URL fetch, not a DB round trip, and re-uploads are naturally idempotent (`overwrite: false`).
- **Sign uploads server-side.** Never expose the API secret to the browser. Route through `/api/render` — you need the DB write there anyway.
- **Store `secure_url` _and_ `version`** in the DB, and deliver with `f_auto,q_auto` so format and quality adapt to the client.
- **Store the derived analysis, not necessarily the photo.** See the conflict below.

### ⚠️ Retention conflict — needs an explicit decision

The blueprint commits to:

> _"S3 Lifecycle Policies (TTL) ensure all user-uploaded images and temporary data are purged within 24 hours."_

That is directly incompatible with caching results indefinitely to save cost. These are photographs of people's homes, frequently including number plates, house numbers, and occasionally people — squarely personal data under UK GDPR. You cannot quietly keep them because caching is cheaper.

Three coherent resolutions — pick one deliberately, don't let it be decided by whichever code ships first:

1. **Cache only the derived analysis** (polygons and numbers, no pixels), purge the photo at 24h. Preserves nearly all the cost saving, since re-uploading the same photo re-hashes to the same key and still hits the cache. **This is my recommendation.**
2. **Ask for consent** to retain, with a clear opt-in at upload and a delete control in the UI.
3. **Match the cache TTL to the retention policy** (24h) and accept the lower hit rate.

Option 1 is unusually clean here: a polygon and six floats are not a photograph of someone's house, and they're all the renderer needs.

---

## 7. UX for the upload flow

The state machine, with the slow step isolated:

```
idle → uploading → analysing → ready ⇄ rendering(per swatch, instant)
                       ↓ low confidence
                  needs-adjustment (corner handles active, nudge shown)
```

**Analysing is the only slow step, and it happens once.** That is the whole UX argument for the hybrid: you spend the user's patience a single time, on upload, where a wait is expected — instead of taxing every stone click, where it isn't.

- **Label the phases in the loader.** A 3-second spinner feels broken; _"Finding the surface…"_ → _"Measuring perspective…"_ → _"Preparing your blend…"_ feels like progress. Same duration, different perception.
- **Never blank the canvas.** `visualizer-shell.tsx:186` already keeps the previous texture visible while a new blend loads. Extend that pattern to analysis: show the raw photo underneath, overlay a subtle scrim, and cross-fade the surface in.
- **Fallback ladder, in order:** AI mask → last good mask for this photo → `DEFAULT_UPLOAD_QUAD` with handles pre-opened (today's behaviour) → demo scene with an explanatory message. Every rung is usable; none is a dead end.
- **Surface low confidence as an invitation, not an error.** Below threshold, auto-activate the drag handles with _"Drag the corners to match your driveway"_ — the user fixes it in two seconds and never learns the model was unsure.
- **Reject non-property photos early.** Users will upload selfies and screenshots. Have the analysis call return `sceneType: "unsupported"` and show a friendly retry rather than rendering gravel onto someone's face.

---

## 8. Stack remarks

Two pieces of the blueprint specify infrastructure the chosen architecture doesn't need.

**Python/FastAPI backend.** The blueprint calls for it for _"superior Pydantic-based validation and direct AI library integration."_ The repo is already Next.js 16 with working Route Handlers (`app/api/enquiries/route.ts`, `app/api/handoff/[id]/route.ts`). The orchestration is one HTTPS call to Gemini plus a DB write — that is a Route Handler, not a second service in a second language with its own deployment, auth, and CORS surface. Zod covers the validation. If a Python service earns its place later for genuinely heavy work, add it then.

**Kubernetes HPA and "regional-locked GPU instances."** There are no GPUs in this design. Gemini is a hosted API; the only compute you run is JSON marshalling and a Cloudinary upload. This section appears to be inherited from a self-hosted-diffusion architecture that was considered earlier. As written it would cost real money to operate for no benefit. Vercel or any serverless host covers this workload, and scales to zero between sessions.

Both cuts also shorten the path to Milestone 1 considerably.

---

## 9. Risks and open questions

| Risk                                   | Assessment                                                                                                   | Mitigation                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<3s` NFR                              | Achievable for analysis (~2–4s, once). **Not** achievable per-click with generation.                         | Hybrid pipeline. Re-baseline the NFR as "time to first render after upload."                                                                            |
| Segmentation quality on complex scenes | Curved paths with planting will be imperfect.                                                                | Manual quad override; treat AI as a strong starting point, not ground truth.                                                                            |
| Non-determinism                        | Same photo may segment slightly differently across calls.                                                    | The cache makes it deterministic in practice — first result wins.                                                                                       |
| Rate limits / quota                    | Unknown at your volume.                                                                                      | Benchmark in Milestone 1. Queue with backpressure; the cache absorbs most repeat load.                                                                  |
| Pricing model mismatch                 | Your tiers are priced _per generation_. Under the hybrid, generations ≈ photos uploaded, not stones clicked. | **Revisit the pricing tiers — this is an opportunity.** Your marginal cost per session drops sharply; you can either widen the tiers or improve margin. |
| Abuse / inappropriate uploads          | Users will upload anything.                                                                                  | `sceneType: "unsupported"` path plus Google's safety filtering.                                                                                         |

**Open question I can't answer from the docs:** what is the actual retention decision in §6? Everything else can proceed in parallel, but the DB schema depends on whether you store photos or only derived analysis.

---

## 10. Suggested milestones

**M1 — Understanding, no generation.** `/api/analyze` route calling `gemini-3.7-flash` with structured output. `maskFromPolygons()` in `lib/image.ts`. Wire into the existing renderer. Benchmark latency and mask quality across 20–30 real photos (interior, exterior, curved, occluded, poor light) before tuning anything. _Success: uploads render as well as demo scenes, with no generation calls._

**M2 — Cache and persist.** Scene-analysis table, image hashing, Cloudinary integration behind signed server-side uploads, retention decision implemented. Instrument cache hit rate from day one. _Success: repeat uploads cost nothing and return instantly._

**M3 — UX polish and optional generative finish.** Phase-labelled loader, confidence-driven fallback ladder, non-property rejection. Then Nano Banana as a one-call "photorealistic finish" on the chosen blend, using the procedural render as the reference input. _Success: the generative path is a paid upsell, not a dependency._

The ordering matters: M1 alone probably fixes the reported breakage. Prove that before spending on generation.

---

## Bottom line

Your instinct that dynamic uploads need AI is right. The specific model you need is the **understanding** one, and you need its output as _data_ — polygons, a quad, and a scale — feeding the renderer you have already built and which is more faithful to your actual product than any diffusion model will be.

Keep steps 1 and 2 of your pipeline. Move step 3 out of the hot path and sell it as a finishing touch.
