# Phase 6 — UX states

**Goal:** every state has a visible, sensible screen, and no failure ever leaves
the canvas empty.

**Ships:** the flow the requirement actually describes — proper loader, proper
fallback, no dead ends.

**Estimate:** 1 day. **Depends on:** phase 3 (5 optional — build this against the
procedural path and generation slots in).

---

## The state machine

```
idle → uploading → analysing → ready ⇄ swatch click
          │            │                    ↓
          │            │      procedural render paints INSTANTLY (the fallback)
          │            │                    ↓
          │            │      [phase 5] generation runs; result cross-fades over it
          │            │                    ↓
          │            │            cached hit? → skip straight to result
          │            ↓
          │       low confidence → needs-adjustment (handles open, nudge shown)
          │            ↓
          │       unsupported → friendly rejection, retry
          ↓
      decode failed → clear error naming the format
```

Model this as an explicit discriminated union in `studio-shell.tsx`, not as five
booleans. Five booleans give you 32 states, of which about six are legal, and the
illegal ones are exactly the ones users find:

```ts
type StudioState =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string }
  | { phase: "analysing"; photo: HTMLImageElement; step: "surface" | "perspective" }
  | { phase: "ready"; scene: LoadedScene; analysis: SceneAnalysis; adjusting: boolean }
  | { phase: "unsupported"; photo: HTMLImageElement }
  | { phase: "failed"; reason: string; recoverable: boolean };
```

---

## The five rules

### 1. Analysing is the only unavoidable wait, and it happens once per photo

That is the whole UX argument for this architecture: you spend the user's patience
a single time, on upload, where a wait is *expected* — instead of taxing every
stone click, where it is not.

**Label the phases.** A 3-second spinner feels broken. The same 3 seconds labelled
*"Finding the surface…"* → *"Measuring perspective…"* → *"Preparing your blend…"*
reads as progress. Identical duration, completely different perception.

Drive the labels off elapsed time, not real progress — you have no progress signal
from a single API call, and faking granularity is fine here as long as the last
label does not complete before the response does. Hold the final label until the
response lands rather than looping back to the first.

### 2. Never blank the canvas

The photo is already on screen. Keep it there, put a subtle scrim over it, and
cross-fade the surface in when it is ready. The shell already does this for blend
changes (`visualizer-shell.tsx:186` in the original — the previous texture stays
up while the new one generates). Extend the same pattern to analysis.

There should be no moment in the entire app where the user is looking at a spinner
over emptiness.

### 3. The procedural render is the fallback image

This is the direct answer to the *"proper loader with fallback image"* requirement.
On swatch click the WebGL render appears in ~0 ms, already correct in colour. If
phase 5's generation fails or times out, **the procedural render is still there,
already correct**. Failure degrades the polish, never the function.

Cross-fade, do not cut. ~250 ms.

### 4. The confidence-driven fallback ladder

In order — every rung usable, none a dead end:

1. AI mask from `/api/analyze`
2. Last good mask for this photo (from `sessionStorage`)
3. `DEFAULT_UPLOAD_QUAD` with handles **pre-opened** — today's behaviour, which is
   a perfectly respectable floor
4. Demo scene, with an explanation of why

Below the confidence threshold you calibrated in phase 3, auto-activate the drag
handles with *"Drag the corners to match your driveway."* The user fixes it in two
seconds and never learns the model was unsure. **Surface low confidence as an
invitation, not an error** — never show a percentage, never say "the AI was not
sure".

> If phase 3's benchmark showed that reported confidence does not correlate with
> actual mask quality, key this ladder on your substitute signal instead (surface
> area as a fraction of frame is a decent one). Use the data you gathered; do not
> use the field because it has the right name.

### 5. Reject non-property photos kindly

`sceneType: "unsupported"` → *"That doesn't look like a driveway or patio. Try a
photo taken from standing height, showing the ground you want to resurface."*
Offer the demo scenes as an immediate alternative rather than leaving them stuck.

Users will upload selfies and screenshots. This is not an edge case, it is
Tuesday. Rendering gravel onto someone's face is a memorable way to lose a client.

---

## Two things that cost real money if you skip them

### Debounce swatch clicks — ~400 ms

Only matters once phase 5 exists, but build it now while you are in the state
machine. A user clicking through ten stones must not fire ten generations for nine
surfaces they never looked at. **This is a cost line, not a nicety.**

The procedural render should still repaint instantly on every click — debounce
only the generation trigger. Those two must not share a timer.

### Cache hits skip the loader entirely

Most clicks after launch will be cache hits and they should *feel* like it. If
`X-Cache: HIT` comes back in 80 ms, showing a 600 ms loader animation over it is
actively making a fast product feel slow. Only show the loader after a delay
threshold — ~200 ms — so fast paths never flash one.

---

## Also in this phase: the entry point

Phase 0 deliberately left `/studio` unlinked. It is now worth showing, so give it
a way in — **without editing `app/page.tsx` or `components/picker/**`**.

Options, in order of preference:

1. A dedicated `/studio` landing section inside `app/studio/`, with its own room
   picker forked from `components/picker/` — full isolation, no shared edits.
2. Deep links only (`/studio?blend=arizona`) shared with the client for review,
   with the public entry point deferred to the cutover decision.

Option 2 is genuinely fine for a while. The cutover — replacing `/visualizer` with
`/studio` — is a routing decision to make deliberately once the client has seen
both, and it should not be smuggled in as a side effect of a UX phase.

---

## Done when

```powershell
npx tsc --noEmit
npm run lint
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

Walk every path by hand and screenshot each one:

- [ ] Upload a good photo → labelled phases → surface appears, handles closed
- [ ] Upload a hard photo (below threshold) → handles open, nudge copy shown, no
      error language anywhere
- [ ] Upload a selfie → friendly rejection with a route out
- [ ] Upload a TIFF on desktop → clear format message (or it works, post-phase-5)
- [ ] Kill the network mid-analysis → falls to `DEFAULT_UPLOAD_QUAD`, handles open,
      app still usable
- [ ] Click ten swatches fast → ten instant procedural repaints, **at most one
      generation fires**
- [ ] Re-upload a cached photo → no loader flash at all
- [ ] At no point in any of the above is the canvas empty
- [ ] The state is one discriminated union, not scattered booleans

## What I will check

1. The union type exists and illegal states are unrepresentable.
2. The loader has a delay threshold so cache hits do not flash it.
3. Debounce is on generation only, never on the procedural repaint.
4. Low-confidence copy is an invitation. I will read the actual strings.
5. `app/page.tsx` and `components/picker/**` are untouched.
6. Screenshots for every path. This phase is a UX phase; "it works" is not the
   deliverable, "here is what each state looks like" is.

## Do NOT do in this phase

- Do not add a progress bar with fake percentages. Labelled phases, yes;
  a number that is invented, no — users notice, and it costs you trust on the
  one screen where you are asking them to wait.
- Do not surface confidence numbers to the user.
- Do not delete `/visualizer` as part of "cleanup".
