# Implementation Plan — AI Surface Studio

**Owner:** Saad
**Architect review:** Claude (Opus 5)
**Created:** 3 September 2026
**Supersedes the day-by-day cut in:** `../product-prd/implementation-plan-dynamic-uploads.md`
**Rationale and diagnosis live in:** `../product-prd/remarks-dynamic-image-upload-architecture.md`

---

## Read this first

If you have lost the thread on *how the thing actually works* — what Gemini is
doing, what the WebGL renderer is doing, and why they are two different jobs —
read **[00-concepts.md](00-concepts.md)** before opening any phase file. It is the
mental model, not a task list. Fifteen minutes, and everything after it will make
sense.

---

## The one-paragraph summary

The visualizer already renders convincing surfaces. It does that with a WebGL
shader that takes the *lighting* out of your photograph and multiplies it over a
procedurally generated aggregate whose colours come straight out of
`lib/products.ts`. That works on the three demo scenes because each demo scene
ships three hand-authored numbers: a mask, a ground-plane quad, and a real-world
size. An uploaded photo has none of those, so uploads look wrong. **The job is to
get a machine to produce those three things for an arbitrary photo.** That is a
perception problem, and `gemini-3.7-flash` solves it directly, returning data the
existing renderer already knows how to eat. Image *generation* (Nano Banana) is a
separate, optional, later, paid-for polish step — not the main loop.

---

## Isolation rule — non-negotiable

You asked that the working demo not be disturbed. That is enforced structurally,
not by care:

| Path | Rule |
| --- | --- |
| `app/visualizer/**`, `components/visualizer/**`, `app/page.tsx`, `components/picker/**` | **Do not edit.** Ever. In any phase. |
| `lib/image.ts`, `lib/scenes.ts`, `lib/session.ts` | **Do not edit.** New behaviour goes in new files. |
| `lib/products.ts`, `lib/render/**`, `lib/texture/**` | **Read-only imports.** Shared, pure, stable. If a phase truly needs a change here it must be *purely additive* (a new export), never a changed signature. |
| `app/studio/**`, `components/studio/**`, `lib/vision/**`, `lib/upload/**`, `lib/stones/reference.ts`, `lib/cache/**`, `app/api/analyze/**`, `app/api/render/**` | **New. All work happens here.** |

The new experience lives at **`/studio`**. `/visualizer` keeps working exactly as
it does today, for the whole project, and stays the thing you can show someone at
five minutes' notice. When `/studio` is proven, retiring `/visualizer` is a
one-line routing change — a decision for later, and a cheap one.

**Verification that the rule held:** at the end of every phase,
`git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx`
must print nothing.

---

## Phase board

Each phase is one branch, one PR, and ends somewhere you can demo. Tick these off
as you go.

| # | Phase | Ships | Depends on | Est. |
| --- | --- | --- | --- | --- |
| 0 | [Isolation & scaffold](phase-0-scaffold.md) | `/studio` renders a photo with today's quality, forked cleanly | — | 0.5 day |
| 1 | [Stone reference assets](phase-1-stone-assets.md) | 1024² masters, manifest, swatch build script, parity test | 0 | 0.5 day |
| 2 | [Upload pipeline](phase-2-upload-pipeline.md) | Any consumer format decodes, upright, hashed | 0 | 1 day |
| 3 | **[Scene understanding](phase-3-scene-understanding.md)** | `/api/analyze` → real mask, quad, scale. **The phase that fixes the bug.** | 0, 2 | 1.5 days |
| 4 | [Cache & persistence](phase-4-cache.md) | Second upload of the same photo is free and instant | 3 | 1 day |
| 5 | [Generative finish](phase-5-generative-finish.md) | One-click photoreal render on the chosen blend | 1, 3, 4 | 1.5 days |
| 6 | [UX states](phase-6-ux-states.md) | Loaders, fallback ladder, no dead ends | 3 | 1 day |
| 7 | [Hardening & benchmarks](phase-7-hardening.md) | Cost guards, ΔE colour check, rate limits | 5, 6 | 1 day |

**Phase 3 is the one that matters.** Everything before it is setup; everything
after it is upgrade. When phase 3 lands, stop and honestly assess whether uploads
are now good enough. If they are, phases 5 and 7 become *optional revenue work*
rather than *required repair work*, and you should re-sequence with that knowledge
rather than marching on out of momentum.

---

## Decisions you must make (I have recommended, you decide)

These block specific phases. Do not let them be decided by whichever code ships
first.

| # | Decision | Blocks | My recommendation |
| --- | --- | --- | --- |
| D1 | **Retention.** Do we store users' photos, or only the derived analysis? | Phase 4 schema | **Derived only.** Polygons and six floats are not a photograph of someone's house. A re-upload re-hashes to the same key and still hits the cache, so you keep nearly all the saving with none of the UK-GDPR exposure. |
| D2 | **Cache store.** Postgres+Prisma, or key-value? | Phase 4 | **Key-value (Upstash Redis / Vercel KV).** Both caches are literally `hash → JSON`. Prisma + a migration pipeline + a connection pool for a single-key lookup is infrastructure you will maintain forever for no benefit. Move to Postgres the day you want *analytics* on renders, not before. |
| D3 | **How many SKUs get reference photography for v1?** | Phase 1 scope | All six. The catalogue is small; there is no tail to defer. |
| D4 | **Is the SynthID watermark acceptable** on a customer-facing quotation image? | Phase 5 launch | Ask the client explicitly. Every Nano Banana output carries one. This is a business answer, not a technical one. |
| D5 | **Does the generative finish cost the user anything** (tier/credit), or is it free? | Phase 5, pricing | Gate it. It is the only per-click cost in the design and it sits at the moment of highest intent — that is exactly where a gate belongs. |

---

## Environment

```
GEMINI_API_KEY=            # phases 3, 5
KV_REST_API_URL=           # phase 4
KV_REST_API_TOKEN=         # phase 4
CLOUDINARY_CLOUD_NAME=     # phase 5 only
CLOUDINARY_API_KEY=        # phase 5 only
CLOUDINARY_API_SECRET=     # phase 5 only
```

`.env*` is already gitignored. Nothing here is `NEXT_PUBLIC_` — every one of these
is server-side, and Cloudinary's secret in particular must never reach a browser
bundle.

## Dependencies, added per phase

```
phase 1:  sharp                       (build-time only, swatch script)
phase 3:  @google/genai  zod
phase 4:  @upstash/redis              (pending D2)
phase 5:  cloudinary
```

Nothing else. Note what is *absent* versus the original blueprint: no Python
service, no Kubernetes, no GPUs, no Prisma. See §8 of the architecture remarks for
why.

---

## Model IDs — get these right or you get 404s, not bad output

| Job | Model | Used in |
| --- | --- | --- |
| Understanding: segmentation, geometry, scale | `gemini-3.7-flash` | Phase 3 |
| Generation: versatile, multi-reference | `gemini-3.1-flash-image` (Nano Banana 2) | Phase 5 |
| Generation: cheap/fast, weak on references | `gemini-3.1-flash-lite-image` | Not used |
| Generation: premium | `gemini-3-pro-image` (Nano Banana Pro) | Not used |

`gemini-3.7-flash` is **not** a Nano Banana model and does not generate images.
`gemini-3-pro-image` is **not** `gemini-3-pro`. `MASK_MODE_SEMANTIC` and
`MaskReferenceImage` **do not exist** in this API — they are Vertex Imagen
parameters, and both PRDs are wrong about them. Nano Banana inpainting takes no
pixel mask at all.

---

## How we work together

1. You open the next phase file and work through the numbered steps.
2. Each phase has a **Done when** checklist with commands that produce output.
3. When you think a phase is done, tell me the phase number. I will review the
   diff against that checklist, against the isolation rule, and against the
   architecture — and tell you what is actually finished versus what looks
   finished.
4. If a phase's assumptions turn out to be wrong when you hit real code, say so.
   The plan is a hypothesis; the code is the evidence.

Do not run phases in parallel. Phase 3 changes what you believe about phases 5–7.
