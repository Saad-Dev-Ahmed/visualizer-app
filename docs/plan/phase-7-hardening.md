# Phase 7 — Hardening & benchmarks

**Goal:** the system cannot run away with the client's money, and colour drift is
caught by a machine rather than by a customer.

**Ships:** the difference between a demo and something you can leave running.

**Estimate:** 1 day. **Depends on:** 5 and 6.

---

## The guardrail table

| Risk | Guard | Where |
| --- | --- | --- |
| Cost runaway | Debounce (phase 6) + rate limit `/api/render` per session + log every uncached generation with its key | Step 1 |
| Prompt drift | `PROMPT_VERSION` / `RENDER_PROMPT_VERSION` in the cache key, bumped on every edit | Done in 3/4/5 — audit it here |
| Colour drift | ΔE check over the benchmark set, run in CI | Step 3 |
| Deploy break | `outputFileTracingIncludes` verified on a real deployment | Done in 1/5 — re-verify |
| Privacy | Retention decision implemented, not just written down | Step 4 |
| Watermark | SynthID acceptability confirmed with the client (D4) | Step 5 |
| Abuse | `sceneType: "unsupported"` + Google's safety filtering + upload rate limit | Step 1 |

---

## Steps

### 1. Rate limits

Two different limits for two different risks:

- **`/api/analyze`** — abuse and accidental loops. Generous: ~20 per session per
  hour. Analysis is cheap; the limit is a backstop, not a business rule.
- **`/api/render`** — real money. Tight: ~5–10 per session per hour, and consider
  a global daily ceiling with an alert. **A bug that fires generation in a
  `useEffect` loop can spend hundreds of pounds overnight**, and you will find out
  from the invoice.

Key on the session id (`lib/session.ts` pattern) plus IP. Neither is
authentication and both are trivially bypassed by a determined attacker — that is
fine. These guard against bugs and casual abuse, which is what actually happens.

If phase 4 chose Redis, the limiter is a counter with a TTL in the store you
already have. No new infrastructure.

**Alert on the global ceiling.** A limit that silently caps is a limit you find
out about from a confused client.

### 2. Cost telemetry

One structured log line per uncached AI call:

```ts
console.info("[cost]", {
  route: "render",
  model: RENDER_MODEL_VERSION,
  key: cacheKey,
  hash: hash.slice(0, 12),
  productId,
  ms,
});
```

Then you can answer, from logs alone: how many generations yesterday, for which
SKUs, at what hit rate. Without it the first cost conversation with the client is
a guess, and guesses lose those conversations.

### 3. The ΔE regression check

Phase 5 produced a per-SKU ΔE table. Turn it into something that runs:

```
scripts/check-colour-fidelity.mjs
  for each SKU:
    render the procedural surface for a fixed benchmark photo
    sample mean Lab of the masked region
    compare against the weighted mean of products.ts stones[]
    fail if ΔE > tolerance
```

Run it on the **procedural** path in CI — it is free, deterministic, and it is the
path that carries your fidelity guarantee. Run the generative comparison manually
per release; it costs money and is non-deterministic, so it does not belong on
every push.

**This is the check that protects the commercial claim.** If someone later
"improves" the shader's colour handling and shifts every blend two ΔE toward
yellow, this catches it. Nothing else will until a customer takes delivery.

Now is also the right moment to add a test runner (Vitest, or Node's built-in
runner) and fold in phase 1's `check:stones`.

### 4. Implement the retention decision

Whatever D1 said, make it true in code and verify it:

- If **derived-only**: prove no image bytes exist in any store. Inspect the actual
  cache values, do not read the code and conclude it is fine.
- If **retain with consent**: the opt-in and the delete control both exist and
  work, end to end.
- If **24 h TTL**: TTLs are set on every record. Verify one actually expires.

Then write the privacy copy to match. If you never store the photo, say so in
those words — it is a genuine selling point for a product whose input is
photographs of people's homes.

### 5. Launch checklist

- [ ] D4 answered: SynthID watermark acceptable on a customer-facing quotation
      image, confirmed by the client in writing
- [ ] D5 answered: is the generative finish gated by tier or credit
- [ ] Pricing revisited. **This is an opportunity, not a chore** — the tiers were
      priced per *generation* on the assumption of one per swatch click. Under this
      architecture generations ≈ photos uploaded, not stones clicked. Marginal cost
      per session drops sharply, so you can widen the tiers or improve the margin.
      Decide which, on purpose
- [ ] The `<3s` NFR re-baselined as **"time to first render after upload"** —
      achievable, and honest. The old per-click framing was never achievable on a
      generative path
- [ ] Error monitoring on both routes, with the Zod-parse-failure raw output
      captured. That is the one that tells you a model update changed the response
      shape
- [ ] A preview deploy passes the entire benchmark set

### 6. The cutover decision

`/visualizer` and `/studio` have both been alive since phase 0. Now decide, with
the client, deliberately:

- **Keep both** — `/visualizer` as a fast demo with curated scenes, `/studio` for
  real photos. Defensible.
- **Cut over** — `/studio` becomes `/visualizer`. One routing change, then delete
  the old components in a *separate* commit so it is revertible in one move.
- **Not yet** — keep the fork until the benchmark numbers are unambiguous.

There is no rush, and the fork costs nothing to keep. The wrong version of this
decision is the one that happens by accident during a cleanup.

---

## Done when

- [ ] A deliberate loop against `/api/render` is stopped by the limiter
- [ ] `npm run check:colour` passes and **fails when you deliberately corrupt a
      hex value in `products.ts`** — test the test
- [ ] Cost logs answer "how many generations yesterday, for which SKUs"
- [ ] The retention decision is verifiably implemented, by inspection of stored
      values
- [ ] The full benchmark set passes on a preview deploy
- [ ] Every item in step 5 is ticked or explicitly deferred with a reason

## What I will check

1. The rate limiter is on `/api/render` specifically, and it is tight.
2. `check:colour` genuinely fails on a corrupted value.
3. The retention claim matches what is actually in the store.
4. Prompt versions were bumped throughout the project's history, not
   retrospectively in one commit.
5. The `<3s` NFR is re-baselined in writing, not quietly abandoned.

---

## Closing note

Phase 3 is the phase that fixes what was reported broken. Phases 5 and 7 add a
photorealistic layer on top of a system that already works without it.

If phase 3 alone made uploads good enough, that is a real result and worth saying
out loud to the client — treat 5 and 7 as an upgrade you *chose*, rather than a
commitment you had already made.
