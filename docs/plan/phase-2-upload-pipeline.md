# Phase 2 — Upload pipeline

**Goal:** whatever a consumer uploads decodes, arrives upright, is normalised to
one canonical form, and carries a stable hash.

**Ships:** uploads stop being rejected for format reasons, and portrait phone
photos stop arriving sideways.

**Estimate:** 1 day. **Depends on:** phase 0. **Blocks:** phase 3 (the hash is the
cache key; the orientation fix is a correctness prerequisite, not a polish item).

---

## Why this phase comes before the AI

Two reasons, and the second one is the important one.

1. **Rejected uploads never reach the AI.** `lib/image.ts` currently gates on a
   four-format allowlist. Browsers report `.heic` as `""` or
   `application/octet-stream` often enough that the allowlist rejects files that
   would have decoded fine.

2. **EXIF orientation will silently corrupt every phase-3 result.** Gemini returns
   polygons in the coordinate space of *the bytes you send it*. If the browser
   displays a photo auto-rotated but you send the unrotated bytes, the mask comes
   back rotated 90° relative to what the user sees. The surface lands in the wrong
   place, the perspective is nonsense, and **nothing in the API response looks
   wrong.** You would spend a day blaming the prompt.

Fix orientation once, at the edge. Then hash, Gemini, mask, renderer, and
Cloudinary all share one coordinate space.

---

## The key insight about formats

Gemini accepts exactly five formats — PNG, JPEG, WEBP, HEIC, HEIF
(`../product-prd/google-gemini-image-understanding.md` §797). That looks
restrictive and it is irrelevant, because **Gemini never sees the user's original
file.** `prepareUpload()` already draws everything onto a canvas and re-encodes as
JPEG. The model only ever receives JPEG.

So the real question is not *"what does Gemini accept"* but **"what can we decode
into a canvas"** — and that boundary is entirely ours to widen.

---

## Steps

### 1. New file — do not edit `lib/image.ts`

Create `lib/upload/prepare.ts`. It will end up looking like `lib/image.ts` with
different guts; that is fine. `lib/image.ts` stays exactly as it is, serving
`/visualizer`.

Move `maskFromQuad` too? **No.** Import it from `lib/image.ts` — it is pure, it
works, and phase 3 adds `maskFromPolygons` beside it in a new file rather than
touching it.

### 2. Drop the MIME allowlist, keep a sanity check

```ts
// The <input> can still hint with accept="image/*", but nothing is rejected on
// MIME type alone — the decoder is the only honest test of whether a file is
// usable, and browsers lie about .heic.
```

Reject only two things up front, both deliberately:

- **SVG** — vector input is meaningless here and SVG upload is an XSS vector.
  Reject on `image/svg+xml` *and* on a `.svg` extension.
- **Camera RAW** (`.cr2 .nef .arw .dng .orf .raf`) — every RAW contains a
  full-size embedded JPEG that could be extracted, but nobody photographs their
  driveway in RAW. Reject with a message naming the format and suggesting a
  re-save, rather than building for it.

Everything else: try to decode it.

### 3. Switch to `createImageBitmap`

Three wins over `new Image()` + object URL — it decodes off the main thread, it
works on the `File` directly with no object-URL lifecycle to leak, and, the one
that actually matters:

```ts
const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
```

That flag plus the canvas re-encode is the EXIF fix. The JPEG that leaves the
browser is visually upright with the orientation flag stripped.

Keep a `new Image()` fallback path for any browser where `createImageBitmap`
throws on a given format — belt and braces, a few lines.

### 4. Raise the size ceiling

`MAX_UPLOAD_BYTES` 20 MB → **50 MB**. 20 MB rejects large HEIC bursts and most
TIFFs. The file is downscaled to 1600 px immediately, so the ceiling only bounds
peak decode memory, not anything downstream.

### 5. The decode ladder

```
File (any format)
  │
  ├─ 1. createImageBitmap → canvas → JPEG q0.9 @ 1600px
  │      covers JPEG, PNG, WebP, GIF, BMP, AVIF everywhere; HEIC on Safari/iOS
  │
  ├─ 2. [PHASE 5] direct client → Cloudinary, fetch back as f_jpg,w_1600
  │      covers HEIC on desktop, TIFF, PSD, and most of the long tail
  │
  └─ 3. clear error naming the format, suggesting a re-save as JPEG
```

**Build rungs 1 and 3 now. Stub rung 2 behind a flag and leave it unimplemented
until phase 5**, when Cloudinary credentials land for the generative path anyway.
Do not take a credential dependency in this phase for a long-tail format — a
desktop user with a HEIC gets a clear, actionable message in the meantime, which
is a perfectly respectable v1.

The reason rung 2 is Cloudinary rather than your own `/api/decode`: the client
uploads *directly*, which sidesteps the serverless request body limit entirely.
Routing a 20 MB HEIC through your own function would 413 on Vercel's default cap.

### 6. Hashing — `lib/upload/hash.ts`

```ts
/**
 * sha256 of the *normalised* bytes — after downscale, re-encode, and orientation
 * strip. The same photo from an iPhone and from a desktop re-save then hashes
 * identically, which is what makes the phase-4 cache actually hit.
 *
 * Hash the bytes, not the data URL string: the base64 prefix would work but
 * wastes 33% of the hashing.
 */
export async function hashImage(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
```

`crypto.subtle` requires a secure context — fine on `localhost` and on HTTPS, but
it is `undefined` on a plain-HTTP LAN address. If you test on a phone over
`http://192.168.x.x`, this throws. Either use a tunnel with HTTPS, or guard it and
fall back to skipping the cache. Note it now; you *will* hit it when you test the
mobile capture flow.

### 7. Extend the studio's `SceneSource`

In `lib/studio/session.ts` (yours since phase 0), add to the `upload` variant:

```ts
{
  kind: "upload";
  dataUrl: string;
  width: number;
  height: number;
  name: string;
  hash: string;          // NEW — phase 4's cache key
  // analysis?: SceneAnalysis   ← phase 3 adds this
}
```

Beware `sessionStorage`'s ~5 MB quota: a 1600 px JPEG data URL is ~400 KB, which
is fine, but do not later stash the generated 2K render in here too. `saveScene`
already swallows quota errors silently — good, keep that.

### 8. Wire it into `studio-shell.tsx`

Replace the `prepareUpload` import with the new one and thread `hash` through.
Nothing else changes yet — the render still uses `DEFAULT_UPLOAD_QUAD` and still
looks wrong. **That is expected.** Phase 3 is what fixes it.

### 9. Build the benchmark set — do this now, not later

This is the most valuable hour in the whole plan, and it is genuinely tempting to
skip. **Collect 20–30 real photographs** into `docs/benchmark/` (gitignored if
they contain anyone's real property):

- interior and exterior
- straight-on and oblique
- a curved path
- a driveway **with a car parked on it** (this is the occluder test)
- steps, planters, a bin
- overcast and hard-sun
- one deliberately terrible phone snap
- **a portrait photo straight off an iPhone, HEIC, with a non-trivial EXIF
  orientation flag** ← this one exercises the whole of this phase
- one TIFF or PSD ← the rung-2 test
- one deliberate non-property photo (a selfie, a screenshot) for phase 6's
  `sceneType: "unsupported"` path

Every phase from here is evaluated against this set. Skipping it means tuning
prompts against three photos and discovering the failure modes in production, in
front of the client.

Record it as a simple table in `docs/benchmark/README.md`: filename, what it
tests, what you expect to be hard about it.

---

## Done when

```powershell
npx tsc --noEmit
npm run lint
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

- [ ] Every photo in the benchmark set reaches the canvas in `/studio` — HEIC
      included on Safari, TIFF failing with a *clear* message rather than a
      generic one
- [ ] **The portrait iPhone photo renders upright.** Verify properly: save the
      normalised data URL to a file and open it, do not just look at the
      `<canvas>` — the browser may be auto-rotating the display and hiding the
      bug you are trying to catch
- [ ] The same photo uploaded twice produces the identical hash
- [ ] The same photo, re-saved through a different app, produces the identical
      hash (this is the one that proves normalisation works)
- [ ] SVG and `.dng` are rejected with specific, useful messages
- [ ] A 45 MB file is accepted; a 55 MB file is rejected clearly
- [ ] `/visualizer` upload behaviour is completely unchanged

## What I will check

1. `lib/image.ts` is byte-identical to `main`.
2. `imageOrientation: "from-image"` is present, and the fallback path handles
   orientation too (or explicitly documents that it does not).
3. The hash is over the normalised bytes, not the original file and not the
   data-URL string.
4. The benchmark set exists and has the HEIC-portrait and the car-on-driveway
   photos specifically. Those two are the ones people skip.
5. Rejections name the format and say what to do. "That image could not be read"
   is not good enough for a paying client's customer.

## Do NOT do in this phase

- Do not add `heic2any` or any client-side HEIC decoder. It is ~1.5 MB of wasm
  shipped to every visitor for a format Safari handles natively and Cloudinary
  handles in phase 5.
- Do not implement rung 2 yet.
- Do not add server-side `sharp` decoding. It cannot run in an edge runtime, it
  puts a 20 MB body through your function, and Cloudinary does it better.
