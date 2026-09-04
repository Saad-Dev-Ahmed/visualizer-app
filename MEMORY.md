# MEMORY — project state

**Purpose:** the cold-start document. If you (or an AI assistant) come back to
this repo after a month away, read this file first and you will know where things
stand, what was decided, and what happens next.

**Not** a duplicate of [README.md](README.md) (what the app is and how the renderer
works) or [docs/plan/](docs/plan/) (how the AI work gets built). This file is
*state*: decisions, status, open questions, session log.

**Keep it current.** Update the Status board and append to the Session log at the
end of every working session. A stale MEMORY.md is worse than none, because it is
trusted.

---

## 1. What this is, in four lines

A resin-bound aggregate visualiser for a UK surfacing client. A customer
photographs their driveway, taps a blend, and sees that blend laid on their own
driveway in the right perspective, stone size, and light. They then order several
tonnes of the real material against that picture.

**The commercial constraint that drives the whole architecture:** the render has
to be a faithful picture of the SKU they will actually receive. Not "a golden
gravel" — *Arizona*, five named stone colours at five specific weights.

---

## 2. Stack

| | |
| --- | --- |
| Framework | Next.js **16.3.4**, App Router, React 19.2.8, TypeScript 5 |
| UI | Tailwind v4, shadcn (Base UI variant — `@base-ui/react`, not Radix) |
| Rendering | Hand-written WebGL2 shader, no engine, no three.js |
| Host | Vercel (assumed) |
| AI | Gemini — `gemini-3.7-flash` for understanding, `gemini-3.1-flash-image` for generation |
| Cache | TBD, see D2 |

> **⚠ This is not the Next.js in your training data.** `AGENTS.md` (loaded via
> `CLAUDE.md`) says it plainly: read the relevant guide in
> `node_modules/next/dist/docs/` before writing route or config code. APIs,
> conventions, and config keys differ. That block is written by `next dev` —
> deleting it from a diff just re-creates the uncommitted change.

---

## 3. Repo map

```
app/
  page.tsx              landing / room picker            ← PROTECTED
  visualizer/           the working demo                 ← PROTECTED
  studio/               the AI experience                ← all new work (phase 0+)
  api/enquiries/        contact form
  api/handoff/[id]/     phone → desktop scene hand-off
  api/analyze/          scene understanding              ← phase 3
  api/render/           generative finish                ← phase 5
components/
  picker/               landing-page pickers             ← PROTECTED
  visualizer/           demo UI                          ← PROTECTED
  studio/               forked studio UI                 ← new
  ui/                   shadcn primitives (shared)
lib/
  products.ts           the catalogue — SIX blends, the source of colour truth
  scenes.ts             three hand-authored demo scenes  ← PROTECTED
  image.ts              upload prep + maskFromQuad       ← PROTECTED
  session.ts            sessionStorage scene handoff     ← PROTECTED
  render/               homography + the WebGL compositor (shared, read-only)
  texture/aggregate.ts  procedural stone generator (shared, read-only)
  stones/manifest.ts    STONE_PHOTOS — browser chips
  stones/assets.ts      STONE_ASSETS — server masters    ← phase 1
  vision/ upload/ cache/ studio/                          ← all new
assets/stones/          1024² server-only masters        ← phase 1 moves them here
public/stones/          256² browser chips (generated)
public/demo/            demo photos + hand-painted masks
docs/plan/              THE IMPLEMENTATION PLAN — start at README.md
docs/product-prd/       PRDs, architecture review, saved Gemini docs
docs/benchmark/         20–30 real test photos            ← phase 2 creates
scripts/                build-time only (masks, swatches, checks)
```

---

## 4. The isolation rule — the single most important convention

All AI work goes into **`/studio`**. The demo at `/visualizer` must keep working,
untouched, so it can be shown to the client at no notice.

**Never edit:**

```
app/visualizer/**   components/visualizer/**   app/page.tsx   components/picker/**
lib/image.ts        lib/scenes.ts              lib/session.ts
```

**Read-only shared imports** (additive changes only, never a changed signature):

```
lib/products.ts   lib/render/**   lib/texture/**   lib/favourites.ts   lib/utils.ts
```

**Verify after every phase — this must print nothing:**

```powershell
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx
```

Three components are forked rather than shared, because later phases must edit
them: `visualizer-shell` → `studio-shell`, `surface-stage` → `studio-stage`,
`toolbar` → `studio-toolbar`. **Do not "de-duplicate" them back together** — the
fork is the isolation guarantee, not an accident.

---

## 5. How it works, in one screen

Full version: [docs/plan/00-concepts.md](docs/plan/00-concepts.md). The compressed
form:

The shader needs three things per scene that a photograph does not carry — a
**mask** (which pixels may be replaced), a **quad** (four points describing a
rectangle lying on the ground plane, giving perspective via a homography), and
**planeMetres** (how big that rectangle is in real life, which sets grain scale).

Demo scenes ship all three, hand-authored. **Uploads have none of them** — that is
the entire bug. `maskFromQuad()` gives a blurred trapezoid, `DEFAULT_UPLOAD_QUAD`
a fixed guess, `planeMetres` a constant.

The fix is a perception problem, not a generation problem:

```
photo → normalise (upright, 1600px, JPEG) → sha256
      → /api/analyze → gemini-3.7-flash, ONE call, structured JSON out
        { surface polygon, occluders[], quad, planeMetres, lighting, confidence }
      → rasterise polygons to a canvas → EXISTING renderer, UNCHANGED
      → every swatch click after this is ~0ms and free
      → [optional] one Nano Banana call for a photoreal finish on the chosen blend
```

**The mnemonic: generate the understanding, not the surface.**

Why generation is not the main loop: ~30× the cost on a 30-swatch browse, 2–5 s
per click instead of ~0 ms, and — the part that matters — the model invents *a*
golden gravel rather than sampling your five hex values at your five weights. The
procedural renderer is **more accurate than the AI** for this job because its
colours come out of `products.ts`.

---

## 6. Status board

Update the Status column as you go.

| # | Phase | Status | Notes |
| --- | --- | --- | --- |
| — | Demo app (`/visualizer`) | ✅ Working | Three demo scenes, six blends, share/download/enquiry |
| 0 | [Isolation & scaffold](docs/plan/phase-0-scaffold.md) | ⬜ Not started | |
| 1 | [Stone reference assets](docs/plan/phase-1-stone-assets.md) | ⬜ Not started | Masters exist but are **unaudited** |
| 2 | [Upload pipeline](docs/plan/phase-2-upload-pipeline.md) | ⬜ Not started | |
| 3 | **[Scene understanding](docs/plan/phase-3-scene-understanding.md)** | ⬜ Not started | **The phase that fixes the bug** |
| 4 | [Cache & persistence](docs/plan/phase-4-cache.md) | ⬜ Not started | Blocked on D1, D2 |
| 5 | [Generative finish](docs/plan/phase-5-generative-finish.md) | ⬜ Not started | Blocked on D4, D5 |
| 6 | [UX states](docs/plan/phase-6-ux-states.md) | ⬜ Not started | |
| 7 | [Hardening & benchmarks](docs/plan/phase-7-hardening.md) | ⬜ Not started | |

> **Re-assess after phase 3.** If uploads are good enough then, phases 5 and 7 are
> optional revenue work, not required repair work. Say so out loud and re-sequence
> rather than marching on out of momentum.

---

## 7. Decisions

### Settled

| | Decision | Why |
| --- | --- | --- |
| **A1** | **Understanding, not generation, in the main loop.** Gemini returns data; the existing WebGL renderer paints. | Cost, latency, and SKU colour fidelity. See `docs/product-prd/remarks-dynamic-image-upload-architecture.md` §3–4 |
| **A2** | **Generation is an opt-in finishing touch** on the chosen blend, one call per session, with the real stone photo as a reference input. | Highest-intent moment; reference image constrains colour drift |
| **A3** | **New route `/studio`, forked from `/visualizer`.** | The demo must stay showable; structure beats discipline |
| **A4** | **No Python/FastAPI service.** Route Handlers + Zod. | The orchestration is one HTTPS call plus a cache write. A second service in a second language buys nothing |
| **A5** | **No Kubernetes, no GPUs.** | There is no GPU in this design. Gemini is hosted. That section of the blueprint was inherited from a self-hosted-diffusion architecture |
| **A6** | **No Prisma/Postgres for now** — a `CacheStore` interface with a memory impl and a KV impl. | Both caches are `hash → JSON`. Revisit when you want analytics on renders |

### Open — these block work

| | Decision | Blocks | Recommendation |
| --- | --- | --- | --- |
| **D1** | **Retention.** Store users' photos, or only the derived analysis? | Phase 4 | **Derived only.** Polygons and ~8 floats are not a photograph of someone's house. A re-upload re-hashes to the same key and still hits the cache |
| **D2** | **Cache store.** KV or Postgres? | Phase 4 | **KV (Upstash / Vercel KV).** See A6 |
| **D3** | **How many SKUs get reference photography for v1?** | Phase 1 | All six. The catalogue is small; there is no tail to defer |
| **D4** | **Is the SynthID watermark acceptable** on a customer-facing quotation image? | Phase 5 launch | Ask the client explicitly, get it in writing. Every Nano Banana output carries one |
| **D5** | **Is the generative finish gated** by tier/credit, or free? | Phase 5, pricing | Gate it. It is the only per-click cost in the design |

**Also revisit:** the pricing tiers were built assuming one generation *per swatch
click*. Under this architecture generations ≈ photos uploaded. Marginal cost per
session drops sharply — that is an opportunity (wider tiers, or better margin),
not an oversight. And the `<3s` NFR needs re-baselining as **"time to first render
after upload"**; it was never achievable per-click on a generative path.

---

## 8. Corrections to the PRDs — do not build what they say

The two documents in `docs/product-prd/` predate the architecture review and
contain three errors that would stop code compiling. The review file is correct;
the PRDs have not been rewritten.

1. **`MASK_MODE_SEMANTIC` and `MaskReferenceImage` do not exist in the Gemini
   API.** They are Vertex Imagen editing parameters. Nano Banana inpainting takes
   **no pixel mask at all** — you describe the region in prose and the model
   decides the boundary internally. You cannot supply a mask and cannot get its
   mask back out. This is why generation cannot be the masking strategy: there is
   nothing to cache, nothing to render into, and nothing for the user to drag and
   correct.
2. **Imagen 3 is a deprecated path.** The saved docs open with *Migration to Nano
   Banana* and mark Imagen 4 deprecated.
3. **The model families are conflated.** `gemini-3.7-flash` is *not* a Nano Banana
   model and does not generate images. `gemini-3-pro-image` is *not*
   `gemini-3-pro`. Wrong IDs give 404s, not degraded output.

| Job | Model |
| --- | --- |
| Understanding: segmentation, geometry, scale | `gemini-3.7-flash` |
| Generation: versatile, multi-reference | `gemini-3.1-flash-image` (Nano Banana 2) |
| Generation: cheap, weak on references | `gemini-3.1-flash-lite-image` — not used |
| Generation: premium | `gemini-3-pro-image` (Nano Banana Pro) — not used |

The SDK surface in the saved docs is `client.interactions.create(...)`, **not**
`generateContent`. Verify the installed `@google/genai` matches before writing
against it.

---

## 9. Gotchas — the ones that cost a day each

| | |
| --- | --- |
| **EXIF orientation** | Gemini returns polygons in the coordinate space of *the bytes you sent*. Send unrotated bytes while the browser auto-rotates the display and the mask arrives 90° off — **and nothing in the API response looks wrong.** Fix once at the edge with `createImageBitmap(file, { imageOrientation: "from-image" })` + canvas re-encode |
| **`box_2d` axis order** | Gemini gives `mask` points as `[x, y]` but `box_2d` as `[ymin, xmin, ymax, xmax]`. The order flips between the two fields. Read that twice |
| **Mask polygons are box-relative** | The polygon is expressed inside the bounding box, not in full-image coordinates. Verify empirically on a real response before trusting either reading |
| **Three coordinate systems** | Gemini 0–1000, `lib/scenes.ts` 0–1, canvas pixels. Convert once, at the boundary, never again |
| **`outputFileTracingIncludes`** | Files outside `public/` are not traced into a serverless bundle. Works on `next dev`, `ENOENT` in production. Verify on a preview deploy early |
| **`crypto.subtle` needs a secure context** | `undefined` on plain-HTTP LAN addresses. Testing the phone flow over `http://192.168.x.x` will throw |
| **`sessionStorage` ~5MB** | A 1600px JPEG data URL is ~400KB, fine. Do not also stash a 2K generated render there |
| **Cache the failure, break the retry** | Never write a timeout or safety refusal to the cache — the retry would return it forever |
| **Version segments in cache keys** | `PROMPT_VERSION` / `MODEL_VERSION` go in the key, as readable prefixes. Omit them and a prompt fix serves pre-fix results permanently with no way to find the poisoned rows |
| **Segmentation is coarse** | Gemini polygons are not SAM. Keep the drag handles: the AI proposes, the user adjusts. Manual override must always beat the AI mask |
| **`sharp` is build-time only** | `devDependencies`. It must never appear on the request path |
| **Secrets** | No `NEXT_PUBLIC_` on `GEMINI_API_KEY` or any Cloudinary value |

---

## 10. Commands

```powershell
npm run dev              # next dev
npm run build
npm run lint
npx tsc --noEmit
npm run masks            # regenerate demo scene masks
npm run stones           # masters → browser chips           (phase 1)
npm run check:stones     # product ↔ asset parity            (phase 1)
npm run check:colour     # ΔE regression on the procedural path (phase 7)

# the isolation check — must print NOTHING
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx
```

Env (`.env.local`, gitignored — none are `NEXT_PUBLIC_`):

```
GEMINI_API_KEY            phases 3, 5
KV_REST_API_URL           phase 4
KV_REST_API_TOKEN         phase 4
CLOUDINARY_CLOUD_NAME     phase 5
CLOUDINARY_API_KEY        phase 5
CLOUDINARY_API_SECRET     phase 5
```

---

## 11. Working agreement

Saad implements each phase. Claude plans it up front and reviews it afterwards —
the point is that Saad relearns the architecture, so Claude writing the code
defeats the exercise. Each phase file therefore carries a **Done when** checklist
of commands that produce output, a **What I will check** list, and a **Do NOT do
in this phase** list.

**Ask Claude to review by phase number.** One phase at a time, no parallel work —
phase 3 changes what you believe about phases 5–7.

---

## 12. Session log

Append one entry per working session. Newest at the top. Keep entries to what a
future reader needs: what changed, what was decided, what surprised you.

### 2026-09-03 — Plan created

- Read the architecture review, the day-plan, and the codebase; re-cut the day-by-day
  plan into 8 phases in [docs/plan/](docs/plan/), organised around the isolation rule.
- Wrote [docs/plan/00-concepts.md](docs/plan/00-concepts.md) as the mental-model
  refresher (renderer vs. AI, the three missing numbers, the two model families).
- Two departures from the original day-plan: new `lib/upload/prepare.ts` instead of
  editing `lib/image.ts` in place (isolation), and a `CacheStore` interface over KV
  instead of Prisma + Postgres (A6/D2).
- Findings worth carrying: the stone masters in `app/assets/stones/` are **unaudited**
  and nothing imports them — they are the phase-5 colour-fidelity control, so a
  re-shoot may be a client conversation. `next.config.ts` is still empty, so
  `outputFileTracingIncludes` is not set.
- Created this file.
- **Next:** phase 0. Half a day, no API key needed.
