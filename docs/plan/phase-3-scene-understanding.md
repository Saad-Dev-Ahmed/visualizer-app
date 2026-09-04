# Phase 3 — Scene understanding

**Goal:** `/api/analyze` returns a usable mask, quad and scale for an arbitrary
photograph, and the existing renderer consumes it unchanged.

**Ships:** **uploads start working.** This is the phase that fixes the reported
bug.

**Estimate:** 1.5 days. **Depends on:** phases 0 and 2. **Blocks:** 4, 5, 6.

> **Stop here when this lands and assess honestly.** If uploads are now good
> enough, phases 5 and 7 become optional revenue work rather than required repair
> work. Do not march on out of momentum — re-sequence with what you have learned.

---

## The shape of it in one sentence

One `gemini-3.7-flash` call per photograph returns polygons and numbers; you
rasterise the polygons into the same kind of canvas `maskFromQuad()` already
produces, and hand it to the renderer you already have.

**No generation. No image comes back. The renderer does not change.**

---

## Steps

### 1. Dependencies and key

```powershell
npm i @google/genai zod
```

`GEMINI_API_KEY` into `.env.local` (already gitignored). Read
`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` for how
this Next version wants server-only env vars — and confirm the key is **not**
`NEXT_PUBLIC_`, or it ships to every browser.

### 2. Confirm the API surface before writing against it

The saved docs use `client.interactions.create(...)`, **not** the older
`generateContent`. Check the installed SDK matches:

```powershell
node -e "const{GoogleGenAI}=require('@google/genai');console.log(Object.keys(new GoogleGenAI({apiKey:'x'})))"
```

If `interactions` is absent, the installed SDK is older than the docs. Resolve
that before writing 200 lines against the wrong surface — this is a ten-minute
check that saves half a day.

### 3. The schema — `lib/vision/schema.ts`

Zod, because you get runtime validation and the JSON schema for the request from
one definition. Request **all of it in one call** — you are paying for the image
tokens either way, and a second call costs the same again.

```ts
import * as z from "zod";

const Polygon = z.array(z.array(z.number()));   // [[x,y], ...] normalised 0–1000

const Region = z.object({
  label: z.string(),
  box_2d: z.array(z.number()).length(4),        // [ymin, xmin, ymax, xmax] 0–1000
  mask: Polygon,
});

export const SceneAnalysisSchema = z.object({
  sceneType: z.enum(["interior", "exterior", "unsupported"]),
  surface: Region,
  occluders: z.array(Region),
  quad: z.array(z.array(z.number())).length(4), // far-L, far-R, near-R, near-L
  planeMetres: z.array(z.number()).length(2),
  scaleAnchor: z.string(),
  lighting: z.object({
    direction: z.string(),
    hardness: z.number(),
    colourCast: z.string(),
  }),
  confidence: z.number(),
});

export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>;
export const PROMPT_VERSION = "v1";   // bump on EVERY prompt edit. Phase 4 keys on it.
export const MODEL_VERSION = "gemini-3.7-flash";
```

Note the three coordinate conventions in play — 0–1000 normalised from Gemini,
0–1 normalised in `lib/scenes.ts`, and pixels in the canvas. **Convert once, at
the boundary, in `lib/vision/normalise.ts`, and never again.** Mixing them is the
most likely bug in this phase and it produces plausible-looking-but-wrong output.

### 4. The prompt — `lib/vision/prompt.ts`

Four things the prompt must do, each earning its place:

```
You are analysing a photograph of a property for a resin-bound surfacing
visualiser.

1. Identify the single largest continuous ground surface that could be
   resurfaced — a driveway, patio, path, or interior floor. Give its
   segmentation mask as a polygon.

2. Identify every object standing ON that surface which must NOT be
   resurfaced: vehicles, planters, bins, furniture, steps, manhole covers,
   people, pets. Give each as a separate mask in "occluders". These will be
   subtracted from the surface. Be thorough — a missed object gets paved over.

3. Give "quad": four points describing a RECTANGLE LYING FLAT ON THE GROUND
   PLANE as this camera sees it, ordered far-left, far-right, near-right,
   near-left. The rectangle describes the ground plane itself, not the visible
   surface — its corners may fall outside the image, and that is correct and
   expected.

4. Give "planeMetres": the real-world size of that rectangle in metres. Anchor
   your estimate on a known object in the frame — a car is about 1.8m wide, a
   UK brick course 215mm, a standard door 2.0m, a paving slab 450mm — and state
   which anchor you used in "scaleAnchor".

If the photograph is not of a property with a resurfaceable ground surface,
return sceneType "unsupported" and empty geometry.

Set "confidence" honestly: 1.0 means an unambiguous surface with clean
boundaries, below 0.5 means the user will need to correct your mask by hand.
```

Points 3 and 4 are the ones that will need iteration. **Bump `PROMPT_VERSION`
every single time you edit this string.** Phase 4 keys the cache on it, and
without the bump a prompt fix serves pre-fix results forever with no way to
identify the poisoned rows.

Set `thinking_level: "minimal"` — the segmentation docs explicitly recommend
disabling thinking for better mask results, which is counterintuitive enough to
be worth writing down.

### 5. `app/api/analyze/route.ts`

```ts
// POST { dataUrl, hash } → SceneAnalysis
//
// One gemini-3.7-flash call. Inline base64, not the File API: prepareUpload()
// already downscales to 1600px / ~400KB, the File API is for payloads over 20MB
// or for reusing one image across many calls, and inline is one round trip
// shorter. Revisit only if multi-step refinement arrives.
```

Structure it as: validate body → [phase 4 slots the cache lookup in here] → call
Gemini → `SceneAnalysisSchema.parse` → return.

Leave an explicit, commented gap where the cache goes. Phase 4 should be an
insertion, not a refactor.

Runtime: **Node, not Edge.** Phase 5 reads stone masters from disk in a sibling
route; keep both on the same runtime so you are not reasoning about two.

**Error taxonomy — distinct paths, distinct messages.** Do not collapse these into
one catch:

| Failure | Response | UI does |
| --- | --- | --- |
| Timeout (>20 s) | 504 | Falls back to `DEFAULT_UPLOAD_QUAD`, handles open |
| Safety refusal | 422 `refused` | "We couldn't process that photo" + retry |
| `sceneType: "unsupported"` | 200, with the flag | Friendly "that doesn't look like a property" (phase 6) |
| Zod parse failure | 502 | Log the raw output — this is a prompt bug, and the raw text is the only evidence |
| Missing/invalid key | 500 | Loud in dev, generic in prod |

The Zod failure case is the one that will actually happen. **Log the raw
`output_text` on every parse failure.** Without it you cannot tell a malformed
response from a schema that is subtly wrong.

### 6. `lib/vision/mask.ts` — `maskFromPolygons()`

The whole integration hinges on this being *shape-compatible* with
`maskFromQuad()`: same signature style, same 3 px feather, same
`HTMLCanvasElement` out. Then the renderer needs no changes at all.

```ts
/**
 * Rasterises the analysis into the mask the shader expects.
 *
 * Surface polygon filled white, then each occluder punched out with
 * globalCompositeOperation = "destination-out" — this is what makes the
 * aggregate run AROUND the parked car instead of OVER it.
 *
 * Same 3px feather as maskFromQuad: real ground meets a kerb over a pixel or
 * two, not on a hard vector edge. Without it the result reads as a decal.
 */
export function maskFromPolygons(
  analysis: SceneAnalysis,
  width: number,
  height: number,
  featherPx = 3
): HTMLCanvasElement
```

Order matters and is easy to get wrong: fill black background → **blur filter
on** → fill surface white → occluders `destination-out` → filter off. Applying
the blur after the punch-outs feathers the occluder edges too, which is what you
want (a car's shadow does not have a hard edge either).

Watch the coordinate conversion: Gemini gives `[x, y]` in 0–1000 **but `box_2d`
is `[ymin, xmin, ymax, xmax]`** — the axis order flips between the two fields.
Read that sentence twice. It is a deliberate trap in the API and it will cost you
an hour.

Also: the mask polygon is expressed **inside the bounding box**, not in full-image
coordinates. Check this against a real response on day one — if true, you must map
polygon points through `box_2d` before scaling to pixels. Verify empirically, do
not trust my reading of the docs.

### 7. Wire into `studio-shell.tsx`

The current `loadSource()` for an upload returns `DEFAULT_UPLOAD_QUAD` +
`DEFAULT_UPLOAD_METRES` + `editing: true`. Replace that branch:

```
upload → prepareUpload (phase 2) → POST /api/analyze
  ok, confidence >= threshold  → maskFromPolygons + analysis.quad + analysis.planeMetres, editing: false
  ok, confidence <  threshold  → same, but editing: true  ("Drag the corners…")
  unsupported                  → phase 6's friendly rejection
  failed                       → DEFAULT_UPLOAD_QUAD, editing: true  (today's behaviour)
```

**Keep the drag handles live in every branch.** The AI proposes, the user adjusts.
When the user drags, fall back to `maskFromQuad` for the corrected quad — the
manual override must beat the AI mask, always. That is your recovery path and the
reason this architecture beats a black box.

Store the analysis in `sessionStorage` alongside the scene so a refresh does not
re-analyse. That is a free cache layer before phase 4 exists.

Feed `analysis.lighting` into the shader params — `hardness` → `u_shading`,
`colourCast` → `u_colorCast`. Those are hand-tuned constants today
(`DEFAULT_PARAMS`, `surface-renderer.ts:127`). Do this *last*, after masks are
working, and behind a toggle so you can A/B it. It might make things worse; find
out deliberately rather than tangled up with the mask work.

### 8. Run the whole benchmark set and write down the numbers

Not optional, and not "have a look through". Build a table — this is what
calibrates your confidence threshold, and **guessing that threshold is the single
most likely way to get phase 6 wrong**:

| photo | mask 1–5 | occluders caught? | grain plausible? | scaleAnchor said | latency | reported confidence |
| --- | --- | --- | --- | --- | --- | --- |

Then plot reported confidence against your by-eye score. If they do not correlate,
the confidence field is worthless and phase 6's ladder must key on something else
(surface area as a fraction of frame is a decent substitute). **Find that out
here**, cheaply, not in phase 6 when it is load-bearing.

While you are at it, run one `countTokens` call against a 1024² stone reference
and confirm phase 1's ~1032 figure.

---

## Done when

```powershell
npx tsc --noEmit
npm run lint
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

- [ ] **Uploads in `/studio` render as well as demo scenes on a clear majority of
      the benchmark set** — this is the phase's actual success criterion, compared
      against the before-screenshot from phase 0
- [ ] The car-on-driveway photo paves *around* the car
- [ ] Grain size on a 1–3 mm blend is plausible on a photo where you know the real
      dimensions
- [ ] **Zero image-generation calls made.** Check the API console
- [ ] Dragging a corner still overrides the AI mask instantly
- [ ] Each of the five failure modes in step 5 produces its own message — force
      them: bad key, 1-byte body, a selfie, an unreachable network
- [ ] The benchmark table exists, filled in, all 20–30 rows
- [ ] Latency recorded. Expect 2–4 s; if it is 10 s, say so now, because that
      changes phase 6

## What I will check

1. The renderer and shader are untouched. If you changed `surface-renderer.ts`,
   the integration is wrong somewhere upstream.
2. Coordinate conversion happens in exactly one place.
3. `PROMPT_VERSION` exists and you actually bumped it while iterating. Check your
   git log — if the prompt changed five times and the version never moved, phase
   4's cache is already broken before it is written.
4. Occluder subtraction uses `destination-out`, not a second white fill.
5. The manual quad override wins over the AI mask.
6. The benchmark table is real data, not "worked on the ones I tried".
7. Failure paths are distinct. A single `catch { return 500 }` fails this phase.

## Do NOT do in this phase

- Do not call any `*-image` model. Not "just to see". That is phase 5, and mixing
  them makes the benchmark meaningless.
- Do not use the File API. Inline base64 — see the comment in step 5.
- Do not add the database. Phase 4.
- Do not start tuning the prompt against three photos before the benchmark set is
  assembled. That is how you optimise for the wrong failure mode.
