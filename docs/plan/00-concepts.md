# How it works — the mental model

Read this before any phase file. No tasks here, only the model. If you can explain
the diagram in §5 to someone else, you have it.

---

## 1. What the app is actually doing

A customer photographs their driveway. They tap "Arizona". The driveway in their
photograph becomes Arizona resin-bound aggregate — in the right perspective, with
the right stone size, under the same sunlight and the same hedge shadow as the
original photo.

There are exactly two ways to do that, and the whole architecture is a decision
between them.

**Way A — ask a diffusion model to redraw the photo.** "Here is a picture, replace
the driveway with golden gravel." The model paints a new image. This is
Nano Banana / `gemini-3.1-flash-image`.

**Way B — composite it yourself.** Work out which pixels are driveway, work out
the geometry of the ground, synthesise the aggregate from the SKU's actual colour
recipe, and paint it in with the original photograph's own lighting.

**The app is built on Way B.** That is already written, in
[lib/render/surface-renderer.ts](../../lib/render/surface-renderer.ts), and it is
good. The reason it is Way B is commercial, not technical, and it is worth
holding onto:

> Arizona is a specific physical product: five named stone colours at five
> specific weights, `grainMm: 2.1`, binder `#2c2015`, gloss `0.32`
> ([lib/products.ts:41-60](../../lib/products.ts#L41-L60)). A customer approves a
> picture and then takes delivery of several tonnes of that material. A diffusion
> model asked for "Arizona golden gravel" returns _a_ golden gravel — a plausible
> one from its training distribution, drifting between generations and between
> photos. "The AI made up the colour" is not a defence that survives a chargeback.
>
> Way B's colours come out of the SKU record. It is _more_ accurate than the AI
> for this specific job. That is an unusual position to be in, and switching to
> Way A would give it away.

---

## 2. The three numbers that make Way B work

The shader in `surface-renderer.ts` needs three inputs per scene that the
photograph does not carry:

| Input           | What it is                                                                                                                                    | Demo scene                                                         | Uploaded photo, today                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **mask**        | A greyscale image: white where the surface may be replaced, black everywhere else                                                             | Hand-painted PNG, `public/demo/driveway-mask.png`                  | `maskFromQuad()` — a blurred trapezoid ([lib/image.ts:62](../../lib/image.ts#L62))  |
| **quad**        | Four normalised points describing a rectangle _lying on the ground plane_, as seen by this camera. Far-left, far-right, near-right, near-left | Hand-tuned per scene ([lib/scenes.ts:31](../../lib/scenes.ts#L31)) | `DEFAULT_UPLOAD_QUAD` — a fixed guess ([lib/scenes.ts:82](../../lib/scenes.ts#L82)) |
| **planeMetres** | How big that rectangle is in real life, e.g. `[3.72, 3.96]`                                                                                   | Estimated per scene by eye                                         | `[4, 4]`, a constant                                                                |

And here is what goes wrong when each is wrong:

- **Wrong mask** → the aggregate paves over the parked car, the planters, the
  steps, and bleeds past the kerb onto the lawn.
- **Wrong quad** → the perspective is wrong. Stones near the camera and stones at
  the far end are the same size, or the surface skews sideways.
- **Wrong planeMetres** → the grain is the wrong size. A 1–3 mm blend renders like
  cobblestones or like sand. This is the subtle one; it looks "off" without
  looking obviously broken.

**That is the entire bug.** Uploads do not break because there is no AI in the
loop. They break because _nothing computes a mask, a quad, or a scale for an
arbitrary photograph._ Everything downstream is fine.

---

## 3. How the renderer turns those three numbers into pixels

Worth understanding, because it explains why Gemini's output feeds it so neatly.

### 3a. The aggregate tile — `lib/texture/aggregate.ts`

Not a photograph. A **procedurally synthesised** square that tiles seamlessly. A
jittered-grid Worley pattern packs stones edge to edge; each cell takes a colour
drawn from `product.stones[]` weighted by `weight`, and is shaded as a small dome
so it reads as a pebble rather than a flat blob
([aggregate.ts:1-10](../../lib/texture/aggregate.ts#L1-L10)).

Crucially it is generated at a **known physical resolution** — `pxPerMetre` — so
`grainMm: 2.1` produces stones that are genuinely 2.1 mm across in the surface's
own coordinate space ([aggregate.ts:67](../../lib/texture/aggregate.ts#L67)).
This is why the tile can be re-scaled correctly for any camera distance, and why
a photographed swatch could never do the same job: a swatch is locked to whatever
distance it was shot at.

### 3b. The homography — `lib/render/homography.ts`

Four points on a plane, plus their four positions in the image, uniquely determine
a 3×3 projective matrix. Invert it and you can ask, for _any_ pixel in the photo,
"where on the ground is this?" — in metres.

That inverse is `u_hinv`, and the shader uses it on line 62 of the fragment
shader. When `q.z <= 0` the pixel is at or beyond the horizon and has no valid
ground position, so the mask is forced to zero there — that is the guard on
[surface-renderer.ts:66](../../lib/render/surface-renderer.ts#L66).

### 3c. The lighting transfer — the trick that sells it

This is the clever part and it is only about eight lines of GLSL
([surface-renderer.ts:89-101](../../lib/render/surface-renderer.ts#L89-L101)):

1. Downsample the photograph hard. What survives is _only_ the light — the sun,
   the hedge shadow, the fall-off toward the house. That is `u_light`.
2. For each pixel, compute `ratio = luminance(light) / refLuma`, where `refLuma`
   is the mean brightness of the original surface. Above 1 means "this spot was
   brighter than average", below 1 means "in shadow".
3. Multiply the synthetic aggregate by that ratio. The new surface inherits the
   original photograph's exact lighting.
4. Carry the _chromaticity_ across too — `tint = light / luminance(light)` — so
   warm sun stays warm and cool shade stays cool.
5. Add back the high-frequency detail the downsample destroyed
   (`detail = luma(photo) - luma(light)`): crisp leaf-shadow edges, tyre marks,
   the darkening where the surface meets a kerb.
6. Blend with the photograph using the mask: `mix(photo, lit, m)`.

The new surface supplies **colour only**. All the light is the real light from the
real photograph. That is why it does not look like a sticker.

**Consequence worth internalising: swatch clicks are free and instant.** Changing
blend only regenerates the tile — a few hundred milliseconds of pixel work, then
one texture upload. Nothing else in the pipeline re-runs. That instantaneous feel
is the best thing about the product today, and any design that puts a 2–5 second
network call behind each swatch click destroys it.

---

## 4. Where Gemini comes in — two different models, two different jobs

This is where the original PRDs went wrong, so be precise.

### 4a. `gemini-3.7-flash` — image **understanding**. This is the workhorse.

Vision in, **structured JSON out**. It does not make images. You send it the
photograph and a schema, and it returns data.

It can do segmentation natively: for each object it gives you `box_2d` as
`[ymin, xmin, ymax, xmax]` normalised 0–1000, a `label`, and `mask` — a polygon of
`[x, y]` points, also 0–1000
(`../product-prd/google-gemini-image-understanding.md`, §Segmentation).

**Look at what that is.** A polygon in normalised coordinates is exactly what
`maskFromQuad()` already rasterises, only with more than four points. So the
integration is: ask for polygons, rasterise them to a canvas, hand the canvas to
the renderer. The renderer does not change at all.

One call gets you all three missing numbers plus more:

```jsonc
{
  "sceneType": "exterior",              // interior | exterior | unsupported
  "surface": { "label": "driveway", "box_2d": [...], "mask": [[x,y], ...] },
  "occluders": [                        // SUBTRACT these from the mask
    { "label": "car",     "box_2d": [...], "mask": [[x,y], ...] },
    { "label": "planter", "box_2d": [...], "mask": [[x,y], ...] }
  ],
  "quad": [[x,y],[x,y],[x,y],[x,y]],    // far-L, far-R, near-R, near-L
  "planeMetres": [3.7, 4.0],
  "scaleAnchor": "car width ~= 1.8m",   // make the model show its working
  "lighting": { "direction": "upper-left", "hardness": 0.7, "colourCast": "warm" },
  "confidence": 0.82
}
```

Three fields deserve special attention:

- **`occluders`** is what fixes the most visible failure. Final mask =
  `surface MINUS occluders`. This is the difference between paving _around_ a
  parked car and paving _over_ it. The model will not volunteer them — ask.
- **`planeMetres`** is the scale trick. Vision models are poor at absolute
  distance in the abstract but reason well about known object sizes. Instruct it
  to anchor on something measurable — a car is ~1.8 m wide, a UK brick course
  ~215 mm, a standard door ~2.0 m, a paving slab ~450 mm — and to _report which
  anchor it used_ in `scaleAnchor`. That field is your debugging handle the day
  grain size comes out wrong.
- **`lighting`** maps onto shader uniforms that are hand-tuned constants today
  (`u_shading`, `u_colorCast`).

**One call per photograph**, not per swatch. That is the whole cost and latency
argument in a sentence.

### 4b. `gemini-3.1-flash-image` (Nano Banana 2) — image **generation**

Photo in, photo out. Genuinely impressive, and it _does_ have a place — but not in
the main loop, for three reasons:

1. **~30× the cost.** A 30-swatch browse is ~30 generations (≈$2.40 at $0.08) vs
   one understanding call (cents).
2. **2–5 s per click**, versus ~0 ms today. It removes the thing that makes the
   product pleasant, and makes the `<3s` NFR unachievable.
3. **Colour drift** — §1 above.

There is also a hard structural reason it cannot be the masking strategy. Nano
Banana "inpainting" is _conversational_: you describe the region in prose and the
model decides the boundary internally. **You cannot hand it a pixel mask, and you
cannot get its mask back out.** So there is nothing to cache, nothing to render
into, and nothing for the user to drag and correct when it gets the boundary
wrong. Your only recovery path — "drag the corners to fix it" — is impossible on
that path.

> The PRDs specify `MASK_MODE_SEMANTIC` and `MaskReferenceImage` for this. **Those
> parameters do not exist in the Gemini API.** They belong to the older Imagen
> editing API on Vertex AI. Code written against them will not run. Same for
> "Imagen 3 as the foundational model" — the saved docs open with _Migration to
> Nano Banana_ and mark Imagen 4 deprecated.

**Where generation genuinely earns its place** (this is phase 5): the user
explores freely and instantly with the procedural renderer, picks one blend, then
presses a button that spends _one_ generation to produce a polished, shareable,
photoreal image. One call per session, at maximum intent. And the input to that
call includes **the actual photograph of the stone** as a reference image, which
constrains the colour drift far more tightly than any prompt could — the model is
documented as handling up to 10 reference images with high fidelity.

### 4c. The mnemonic

> **Generate the understanding, not the surface.**

---

## 5. The data flow, end to end

```
   ┌────────────────────────────────────────────────────────────────┐
   │ BROWSER                                                        │
   └────────────────────────────────────────────────────────────────┘

   User picks a file  (jpg / png / webp / heic / tiff …)
            │
            │  phase 2 — lib/upload/prepare.ts
            │  decode → EXIF-upright → downscale 1600px → JPEG q0.9
            ▼
   normalised dataURL ──► sha256(bytes) = imageHash
            │
            │  POST /api/analyze { dataUrl }
            ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ SERVER — app/api/analyze/route.ts            phase 3           │
   │                                                                │
   │   KV lookup: analysis:{imageHash}          phase 4             │
   │        hit ──────────────────────────────────► return cached   │
   │        miss                                                    │
   │          │                                                     │
   │          ▼                                                     │
   │   gemini-3.7-flash, one call, structured output                │
   │   input:  [ prompt text, { type:"image", data: base64 } ]      │
   │   output: mask polygons, occluders, quad, planeMetres,         │
   │           lighting, sceneType, confidence                      │
   │          │                                                     │
   │          └──► write KV, return                                 │
   └────────────────────────────────────────────────────────────────┘
            │
            ▼  analysis JSON  (polygons + ~8 floats — no pixels)
   ┌────────────────────────────────────────────────────────────────┐
   │ BROWSER                                                        │
   │                                                                │
   │   lib/vision/mask.ts  —  maskFromPolygons()      phase 3       │
   │     canvas fill(surface polygon)                               │
   │     then globalCompositeOperation="destination-out"            │
   │          per occluder polygon                                  │
   │     then 3px blur   ← same shape maskFromQuad() returns        │
   │          │                                                     │
   │          ▼                                                     │
   │   EXISTING SurfaceRenderer  ── UNCHANGED ──                    │
   │     setScene(photo, mask, { quad, planeMetres })               │
   │     setTexture(getFloorTile(product))                          │
   │          │                                                     │
   │          ▼                                                     │
   │   ★ RESULT — and every swatch click after this is ~0ms & free  │
   └────────────────────────────────────────────────────────────────┘
            │
            │  ── optional, user presses "Photorealistic finish" ──
            ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ SERVER — app/api/render/route.ts             phase 5           │
   │                                                                │
   │   KV lookup: render:{imageHash+productId+promptV+modelV}       │
   │        hit ──────────────────────► return Cloudinary URL       │
   │        miss                                                    │
   │          ▼                                                     │
   │   gemini-3.1-flash-image  (Nano Banana 2)                      │
   │   input: [ scene photo, STONE REFERENCE 1024², prompt ]        │
   │          │                                                     │
   │          ▼                                                     │
   │   Cloudinary (public_id = cache key) → KV → secure_url         │
   └────────────────────────────────────────────────────────────────┘
```

Note the shape of it: **the expensive artifact is the analysis, and it is tiny.**
One row of polygons and floats serves the entire catalogue for that photograph.
Under the rejected per-click design you would need one row _per photo × per
product_ — roughly 30× the rows for a fraction of the hit rate.

---

## 6. Two things that will bite, worth knowing before you meet them

### EXIF orientation

Phone photos store a rotation flag rather than rotating the pixels. A portrait
photo is very often landscape bytes plus "rotate 90°".

In a gallery app, mishandling this means a sideways picture — obvious, easy to
spot. **Here it is worse and much harder to diagnose:** Gemini returns polygons in
the coordinate space of _the bytes you sent it_. If the browser displays the photo
auto-rotated but you sent unrotated bytes, the mask arrives rotated 90° relative
to what the user sees. The surface lands in the wrong place, the perspective is
nonsense, and **nothing in the API response looks wrong.**

Fix it once, at the edge, in `prepareUpload` — `createImageBitmap(file, {
imageOrientation: "from-image" })` plus the canvas re-encode. Then hash, Gemini,
mask, renderer, and Cloudinary all share one coordinate space. Phase 2.

### Segmentation is coarse

Gemini's polygons are not SAM. They comfortably beat today's trapezoid, but they
will not be pixel-perfect on a curved path with planting spilling over the edge.

This is why the drag handles stay. **The AI proposes, the user adjusts.** That is
also better product design than a black box: a wrong result becomes recoverable in
two seconds instead of ending the session. Below a confidence threshold, open the
handles automatically with _"Drag the corners to match your driveway"_ — the user
fixes it and never learns the model was unsure.

---

## 7. Vocabulary

| Term                         | Means                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blend / SKU / product**    | One aggregate recipe in `lib/products.ts`. Arizona, Eden, …                                                                                                                             |
| **Quad**                     | Four normalised image points describing a rectangle lying on the ground plane. Corners often sit _outside_ the frame on purpose — it describes the whole plane, not the visible surface |
| **Homography**               | 3×3 projective matrix mapping the ground plane to the image, and back                                                                                                                   |
| **Mask**                     | Greyscale canvas: white = replaceable surface, black = leave alone. 3 px feather so the edge is not a decal                                                                             |
| **Occluder**                 | Something standing _on_ the surface that must be subtracted from the mask: car, planter, bin, step                                                                                      |
| **planeMetres**              | Real-world size of the quad, in metres. Sets grain scale                                                                                                                                |
| **Understanding**            | `gemini-3.7-flash`. Image in, JSON out                                                                                                                                                  |
| **Generation / Nano Banana** | `gemini-3.1-flash-image`. Image in, image out                                                                                                                                           |
| **Procedural render**        | The current WebGL path. Instant, free, colour-exact. Also the fallback for every failure in phases 5–6                                                                                  |
| **imageHash**                | `sha256` of the _normalised_ bytes, so the same photo hashes identically across devices. The cache key for everything                                                                   |
