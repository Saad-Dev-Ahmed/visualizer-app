# Phase 0 — Isolation & scaffold

**Goal:** `/studio` exists, renders a scene at exactly today's quality, and is
structurally incapable of breaking `/visualizer`.

**Ships:** nothing user-visible yet. This is the phase that makes every later
phase safe.

**Estimate:** half a day. **Depends on:** nothing.

---

## Why this phase exists

You asked that the working demo not be disturbed. Discipline is not a mechanism —
a fork is. After this phase, every subsequent change lands in files that
`/visualizer` does not import, so the demo cannot regress no matter what happens
in phases 1–7.

The cost is roughly 900 duplicated lines across three files. That is the correct
price. Pay it once, deliberately, here.

---

## What gets forked, and what does not

Fork **only** the components that later phases must edit:

| Component | Action | Why |
| --- | --- | --- |
| `components/visualizer/visualizer-shell.tsx` | **Fork** → `components/studio/studio-shell.tsx` | Phase 3 replaces the scene-loading path; phase 6 rewrites its state machine |
| `components/visualizer/surface-stage.tsx` | **Fork** → `components/studio/studio-stage.tsx` | Phase 3 adds a mask-preview overlay; phase 6 auto-opens handles on low confidence |
| `components/visualizer/toolbar.tsx` | **Fork** → `components/studio/studio-toolbar.tsx` | Phase 5 adds the "Photorealistic finish" action |

Import **unchanged** — they are prop-driven and need no edits:

```
components/visualizer/product-sidebar.tsx      components/visualizer/bottom-bar.tsx
components/visualizer/product-details-sheet.tsx components/visualizer/product-swatch.tsx
components/visualizer/calculator-dialog.tsx     components/visualizer/enquiry-dialog.tsx
components/visualizer/share-dialog.tsx          components/visualizer/filters-popover.tsx
components/ui/**
```

If you later find yourself wanting to edit one of those, stop and fork it instead.
That is the rule, and the rule has no exceptions.

Import **unchanged** from `lib/`, as read-only shared code:

```
lib/products.ts   lib/render/**   lib/texture/**   lib/favourites.ts   lib/utils.ts
```

Do **not** import `lib/image.ts`, `lib/scenes.ts`, or `lib/session.ts` from studio
code. Studio gets its own equivalents (phase 2 for upload, and `lib/studio/session.ts`
here) because all three will need to change. `lib/scenes.ts` is the exception you
*may* import — but only for `DEMO_SCENES` and `DEFAULT_UPLOAD_QUAD`, which are
constants and will not move.

---

## Steps

### 1. Branch

```powershell
git switch -c phase-0-studio-scaffold
```

Commit the pending `components/picker/room-picker.tsx` change or stash it first —
start from a clean tree so the isolation check in step 8 means something.

### 2. Read the Next.js docs for what you are about to write

`AGENTS.md` is not decoration; this Next version differs from training data. Before
writing route or page code, read:

```
node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
node_modules/next/dist/docs/01-app/01-getting-started/07-layouts-and-pages.md
```

In particular confirm the `PageProps<"/studio">` typed-route convention — the
existing `app/visualizer/page.tsx` uses `PageProps<"/visualizer">` with awaited
`searchParams`, so mirror that exactly.

### 3. Create the directories

```
app/studio/
components/studio/
lib/studio/
```

### 4. `lib/studio/session.ts`

Copy `lib/session.ts` verbatim, then change **one line**:

```ts
const KEY = "studio:scene";
```

A separate storage key means the two apps cannot hand each other a scene shaped
for the other's assumptions. Phase 3 will add fields to `SceneSource` here that
`/visualizer` would not understand.

### 5. Fork the three components

Straight copies at first — no behaviour change in this phase. Rename the exported
symbols so a mis-import is a compile error rather than a silent duplicate:

```
VisualizerShell  → StudioShell
SurfaceStage     → StudioStage       (StageHandle → StudioStageHandle)
Toolbar          → StudioToolbar
```

Update the internal imports in `studio-shell.tsx`:

- `@/components/visualizer/surface-stage` → `@/components/studio/studio-stage`
- `@/components/visualizer/toolbar` → `@/components/studio/studio-toolbar`
- `@/lib/session` → `@/lib/studio/session`
- everything else stays pointing at the shared originals

Add a header comment to each fork so the next person knows what they are looking
at:

```ts
/**
 * Forked from components/visualizer/<file> at phase 0.
 *
 * The two diverge from phase 3 onward: this one is driven by /api/analyze,
 * the original stays on the hand-authored demo scenes. Do not "de-duplicate"
 * them back together — the fork is the isolation guarantee, not an accident.
 */
```

### 6. `app/studio/page.tsx`

Mirror `app/visualizer/page.tsx` exactly:

```tsx
import { StudioShell } from "@/components/studio/studio-shell";

export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  const { blend } = await searchParams;
  return <StudioShell initialProductId={typeof blend === "string" ? blend : undefined} />;
}
```

### 7. Fix the two links that would send the user back into the old app

Inside `studio-shell.tsx` only:

- `shareUrl` currently builds `/visualizer?blend=...` → change to `/studio?blend=...`
- `onExit` routes to `/` — leave it; the landing page is shared and fine

### 8. Prove the isolation held

```powershell
npx tsc --noEmit
npm run lint
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx
```

The third command **must print nothing.** If it prints anything at all, you have
edited a protected file — revert that hunk and solve it inside `components/studio/`
instead.

### 9. Route-flag the entry point (optional but recommended)

Add a small dev-only link into `/studio` from the landing page — *without editing
`app/page.tsx`*. Easiest honest option: just navigate to `localhost:3000/studio`
manually during development, and wire a real entry point in phase 6 when the
studio is worth showing. Do not add a link to the demo path for the sake of it.

---

## Done when

Run these and paste me the output:

```powershell
npx tsc --noEmit                       # clean
npm run lint                           # clean
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

Then, by hand, in `npm run dev`:

- [ ] `/visualizer` still loads, all three demo scenes render, swatch clicks work,
      compare wipe works, download works — **unchanged in every respect**
- [ ] `/studio` loads and renders the driveway demo scene identically
- [ ] Uploading a photo in `/studio` behaves exactly as badly as it does in
      `/visualizer` today (fixed trapezoid, wrong perspective). **This is
      expected and correct** — phase 3 is what fixes it. Take a screenshot of it
      now; it is your before-picture.
- [ ] Changing a blend in `/studio` still repaints instantly
- [ ] `sessionStorage` shows two independent keys, `visualizer:scene` and
      `studio:scene`

## What I will check when you say phase 0 is done

1. The isolation diff is genuinely empty — I will run it myself, not take your word.
2. No studio file imports `lib/session.ts` or `lib/image.ts`.
3. The fork header comments are present, so this is legible in six months.
4. No `components/visualizer/*` file gained a new prop "just to make the fork
   easier" — that is the failure mode this phase exists to prevent.

## Do NOT do in this phase

- Do not add Gemini, env vars, or any dependency. Nothing here needs a network.
- Do not "improve" anything while forking. A pure copy makes the phase-3 diff
  readable; a copy-with-improvements makes it noise.
- Do not delete `/visualizer`. Not now, possibly not ever this quarter.
