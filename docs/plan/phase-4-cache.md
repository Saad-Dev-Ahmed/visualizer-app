# Phase 4 — Cache & persistence

**Goal:** the same photograph is never analysed twice.

**Ships:** repeat uploads return instantly and cost nothing.

**Estimate:** 1 day. **Depends on:** phase 3. **Blocked by decisions D1 and D2 —
settle those first.**

---

## Settle the two decisions before writing a line

### D1 — Retention

The blueprint promises *"all user-uploaded images and temporary data are purged
within 24 hours."* Caching results indefinitely contradicts that directly. These
are photographs of people's homes, frequently including number plates, house
numbers, and sometimes people — squarely personal data under UK GDPR. You cannot
quietly keep them because caching is cheaper.

Three coherent resolutions. Pick one deliberately:

1. **Cache only the derived analysis** — polygons and ~eight floats, no pixels.
   Purge the photo at 24 h. **Recommended.** A polygon is not a photograph of
   someone's house, and a re-upload of the same photo re-hashes to the same key
   and still hits the cache, so you keep nearly all the saving.
2. Ask for consent to retain, with a clear opt-in at upload and a delete control.
3. Match the cache TTL to the 24 h retention policy and accept the lower hit rate.

Option 1 is unusually clean here: the analysis is *all the renderer needs*, and it
is not personal data in any meaningful sense.

**Write the decision at the top of `lib/cache/store.ts` as a comment.** Six months
from now someone will want to add `originalDataUrl` to the cached record "for
debugging", and that comment is what stops them.

### D2 — Store

**Recommendation: key-value (Upstash Redis or Vercel KV), not Postgres+Prisma.**

Both caches are literally `hash → JSON`. There are no joins, no queries, no
reporting. Prisma brings a schema, a migration pipeline, a generated client, a
connection pool, and a cold-start cost — permanently — to serve a single-key
lookup. Redis *is* that lookup, with TTL as a first-class feature, which option 1
above needs anyway.

Move to Postgres the day you want analytics on renders (which SKUs convert, which
photos fail). Design for that day with the interface in step 1; do not pay for it
today.

If you prefer Postgres for reasons outside this file — an existing instance, a
client requirement — that is a legitimate call. Everything below still applies;
only the implementation behind the interface changes.

---

## Steps

### 1. `lib/cache/store.ts` — an interface first

```ts
/**
 * RETENTION DECISION (D1, <date>): <what you chose, and why>.
 * Do not add original image bytes to any cached record without revisiting it.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
}
```

Two implementations:

- `lib/cache/memory.ts` — a `Map`, for local dev and tests. Works today, no
  credentials, no account. **Write this one first** and get the whole flow
  working against it.
- `lib/cache/kv.ts` — Upstash/Vercel KV.

Select by env at module load. If `KV_REST_API_URL` is absent, use memory and log
once at startup that the cache is in-memory. That means a teammate can clone the
repo and run the app with only `GEMINI_API_KEY`, which is worth a lot.

### 2. Key construction — `lib/cache/keys.ts`

```ts
export const analysisKey = (imageHash: string) =>
  `analysis:${MODEL_VERSION}:${PROMPT_VERSION}:${imageHash}`;

export const renderKey = (imageHash: string, productId: string) =>   // phase 5
  `render:${RENDER_MODEL_VERSION}:${RENDER_PROMPT_VERSION}:${imageHash}:${productId}`;
```

**The version segments are mandatory, not tidiness.** Omit them and every prompt
tweak you ever ship serves stale pre-fix results permanently, with no way to
identify which rows are poisoned. Putting them in the key rather than in the value
means a bump invalidates by construction — no migration, no sweep, old keys just
age out on TTL.

The original plan proposed hashing the version fields together into one opaque
key. Do not. **Keep them as readable prefixes** so you can eyeball the keyspace in
a Redis console and see immediately which prompt version a row came from. The key
length is irrelevant; the debuggability is not.

### 3. Slot the lookup into `/api/analyze`

Into the gap phase 3 left:

```
hash → cache.get(analysisKey) → hit?  return cached, header X-Cache: HIT
                              → miss: call Gemini → validate → cache.set → return, X-Cache: MISS
```

TTL: 30 days for the analysis. Long enough that a customer coming back next week
hits it; short enough that a stale row from a since-fixed prompt version cannot
outlive its usefulness.

**Never cache a failure.** A timeout or a safety refusal must not be written — the
retry a second later would return the cached failure and the user could never
recover. Only cache a successfully validated analysis. `sceneType: "unsupported"`
*is* a valid successful result and should be cached; a 502 is not.

### 4. Instrument the hit rate from day one

The `X-Cache` header above, plus one log line per uncached call:

```ts
console.info("[analyze] MISS", { hash: hash.slice(0, 12), ms, confidence });
```

Truncate the hash in logs — a full content hash of someone's house photo is a
correlatable identifier, and half of it is plenty for debugging.

You cannot argue about cost with the client without this number, and "we'll add
metrics later" means never.

### 5. Purge job (only if D1 chose option 2 or 3)

If you chose option 1, there is nothing to purge — you never stored a photo.
That is the point of it, and it is worth stating in the client-facing privacy
copy in exactly those terms.

---

## Done when

```powershell
npx tsc --noEmit
npm run lint
git diff --stat main -- app/visualizer components/visualizer components/picker lib/image.ts lib/scenes.ts lib/session.ts app/page.tsx   # EMPTY
```

- [ ] Second upload of the same photo returns `X-Cache: HIT` with **zero Gemini
      calls, proved from the API console**, not inferred from speed
- [ ] The same photo re-saved through a different app also hits (this proves phase
      2's normalisation, and it is the test people skip)
- [ ] Bumping `PROMPT_VERSION` produces a miss on a photo that previously hit
- [ ] The app runs correctly with **no** KV credentials, on the memory store
- [ ] A forced Gemini failure is not cached — the immediate retry re-calls
- [ ] The retention decision is written in `lib/cache/store.ts`, dated
- [ ] Cache hit latency is under ~100 ms

## What I will check

1. Version segments are in the key, not the value.
2. Failures are not cached. I will look for the early-return placement.
3. The memory fallback works with zero credentials.
4. No image bytes in any cached record, if D1 chose option 1.
5. Hashes are truncated in logs.
6. The `/api/analyze` diff is an insertion, not a rewrite. If phase 3's route was
   restructured to fit the cache in, phase 3's shape was wrong and I would rather
   know.

## Do NOT do in this phase

- Do not add Prisma unless D2 explicitly went that way.
- Do not cache in the browser beyond the `sessionStorage` copy phase 3 added.
  `localStorage` for other people's house photos is a privacy decision nobody
  made.
- Do not add Cloudinary. Nothing here stores an image. Phase 5.
