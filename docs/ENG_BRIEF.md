# Flow client fan-out × reCAPTCHA velocity

**Production failure analysis & fix proposals**  
Independent reliability research · Google Flow (`labs.google`) · 2026

| | |
|--|--|
| **Audience** | Flow / Labs client eng, abuse / trust, SRE-adjacent |
| **This is not** | A refund ticket · a quota beg · a bypass write-up |
| **This is** | Your first-party client is the dominant source of the traffic shape your scorer calls “unusual” |

---

## TL;DR (the “ahh shit” paragraph)

You evaluate **reCAPTCHA risk per generate HTTP call**.  
The Flow UI implements multi-output and Retry as **N parallel generate HTTP calls** (often 4; Retry-All 12–20), each with a **fresh token**, often with captcha context nested **twice** on the image path.  

Measured result: **pass rate collapses by fire-order inside a single human click** (~90% at position 0 → ~0% at position 6+). Identical creative payload, unique seeds, unique tokens — outcome is *when in the burst*, not *what the user asked for*.  

Sustained use flips soft throttle (`USER_REQUESTS_THROTTLED`) into hard unusual-activity (`TOO_MUCH_TRAFFIC`). Hard becomes **sticky** past multi-minute quiet gaps, so Help Center “retry after a couple of minutes” is **false under measurement**.  

Your own **Retry** control is intermittent reinforcement: some siblings pass, users hammer, score worsens. You are training paying humans to emit the abuse pattern.

**One sentence:** the product manufactures the botnet signature, then blames the customer.

Tooling (CLI + browser extension, read-only): this repo — **Flow Fixer**.

---

## Two 429s, two machines (please stop treating them as one)

### Hard — abuse / reCAPTCHA velocity

```text
HTTP 429  RESOURCE_EXHAUSTED
message:  "reCAPTCHA evaluation failed"
reason:   PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC
```

UI copy: *“We noticed some unusual activity…”*  
Empty-body fingerprint observed when DevTools drops text: **~287 B**.

### Soft — ordinary throttle

```text
HTTP 429  RESOURCE_EXHAUSTED
message:  "Resource has been exhausted (e.g. check quota)."
reason:   PUBLIC_ERROR_USER_REQUESTS_THROTTLED
```

Empty-body fingerprint: **~297 B**.

If oncall only greps `429`, you will never see the soft→hard escalation story. These are different products.

---

## Method

- Interactive sessions; Chrome HAR (sanitized) + live extension observer  
- Generate isolation: `aisandbox-pa.googleapis.com` + Generate; exclude status polls / frontend logs  
- Classification: body reason enums + size fingerprints when body missing  
- Burst clusters: gap ≤ 2s  
- Fan-position pass rates within cluster  
- Token presence + uniqueness  
- Sticky probes: single generates after multi-minute quiet  

Open-source classifiers: `flowfixer` CLI + `extension/`.

---

## Findings (ordered by how hard they should hit)

### 1. It is not broken captcha tokens

| Session shape | Generate calls | Tokens present | Unique |
|---------------|---------------:|---------------:|-------:|
| Video hard-gate | 240 | 240 | 240 |
| Image mixed | 630 | ~629 | ~629 |
| Retry storm | 142–143 | 142 | 142 |

Hard path says evaluation **failed** with **TOO_MUCH_TRAFFIC**. That is velocity/risk scoring. “User has a bad token” is a closed hypothesis.

### 2. Wire shape multiplies scorer events by design

Image generate bodies are effectively:

```json
{
  "clientContext": {
    "recaptchaContext": { "token": "…", "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB" },
    "tool": "PINHOLE",
    "sessionId": ";<client_epoch_ms>"
  },
  "mediaGenerationContext": { "batchId": "<uuid>" },
  "useNewMedia": true,
  "requests": [ { /* exactly one */ } ]
}
```

- `requests.length === 1` **per HTTP call**  
- Multi-output = **N HTTP calls**, same `batchId`  
- Image path often duplicates `recaptchaContext` on outer + per-request  

You are not scoring “one user action.” You are scoring **N independently minted evaluations of one user action.**

### 3. Fan-position bias (the chart that ends the argument)

Gap ≤ 2s clusters (one click / one retry batch):

| Fire order | Retry-storm pass % | Video lockout pass % |
|-----------:|-------------------:|---------------------:|
| pos 0 | ~90% | ~93% |
| pos 1 | ~50% | ~12% |
| pos 6+ | ~0% | ~0% |

Same payload family. Unique seeds. Unique tokens.  
**Position in the parallel fan predicts survival.** That is the signature of a per-call limiter meeting a client that fans out.

If this chart is wrong, it is wrong in a lab you can reproduce in an afternoon. If it is right, the “unusual activity” label on multi-output humans is a product bug.

### 4. Sticky hard gate falsifies published recovery copy

After hard gate engagement, **single** probes after quiet gaps of **~6–11 minutes** still returned hard unusual-activity.

Help / staff guidance that reduces to “wait a couple of minutes” is incomplete. Sticky TTL is either longer, session-scoped, or both — and users are not told which.

### 5. Retry is an intermittent-reinforcement trap you shipped

~4 minutes of Retry on one creative family (measured):

- ~43 × 200  
- ~98 × hard unusual  

Partial success teaches hammering. Hammering feeds the score. Sticky lockout follows.  
**The Retry button is a first-party load generator aimed at your own abuse detector.**

### 6. Config ↔ client contradiction (free own-goal)

`videoFx.getFlowAppConfig` (observed):

- `isReturnSilentVideosEnabled: true`

Video generate bodies (observed):

- `audioFailurePreference: "BLOCK_SILENCED_VIDEOS"`

Server can return silent; client defaults fail-closed → more retries → more scored traffic. That is not abuse. That is a flag/default mismatch.

### 7. Method honesty (so you don’t waste cycles)

Sessions dominated by content-policy `400`s are poor **primary** exhibits for a pure traffic claim. Use them for escalation timelines. Lead with:

- same-payload retry storms  
- video hard-gate sessions with clean token audits  
- fan-position charts  

Flow Fixer will literally note when filters dominate a capture. We are not smuggling a filter debate into a traffic bug.

---

## Root cause (working model)

```text
human click
  → PINHOLE UI fans out N generate RPCs (shared batchId)
  → N reCAPTCHA evaluations (sometimes 2× embedded per RPC)
  → soft throttle (USER_REQUESTS_THROTTLED)
  → hard unusual (TOO_MUCH_TRAFFIC)
  → sticky session score
  → UI still shows Retry
  → user becomes the DDoS
```

Capacity constraints are real. **Mislabeling first-party fan-out as “unusual activity” is optional, and you opted in.**

---

## Fix proposals (small, testable, no heroics)

### F1 — Client: one human action ≠ N scored events

Any of:

1. Stagger multi-output (250–500ms)  
2. One reCAPTCHA evaluation per `batchId` for sibling outputs  
3. Serialize outputs when soft throttle is near  

**Acceptance:** 20× output=4 at human pace on a healthy Ultra account does not enter hard unusual in a fixed window.

### F2 — Scorer: stop training on your own Retry

Blocked calls and identical-payload retry families should not escalate sticky score like novel cross-session automation.

**Acceptance:** Retry-All on 4 already-failed cards ≤ sticky risk of 4 spaced single clicks.

### F3 — Honest product copy

- Different strings for soft vs hard  
- When sticky: real cooldown / “session cooling,” not “a couple of minutes”  
- Publish numeric tier limits so production users can plan  

### F4 — Align silent-video flag and default

If `isReturnSilentVideosEnabled`, do not default `BLOCK_SILENCED_VIDEOS` with no control.

**Acceptance:** audio fail can complete silent when flag is on — no forced retry storm.

### F5 — Instrument what you actually emit

Log `batchId`, fan index (0..N-1), and soft→hard transitions in abuse dashboards.  
If dashboards only show raw QPS, you will keep paging yourselves for your own UI.

---

## What “fixed” means

A paying human using multi-output and occasional Retry should not be **statistically indistinguishable from distributed abuse** solely because **the first-party client emits abuse-shaped traffic**.

You can keep capacity limits. You cannot keep calling the customer’s browser a botnet for obeying your buttons.

---

## Artifacts

| Artifact | Role |
|----------|------|
| This brief | Argument + acceptance tests |
| `flowfixer` CLI | Offline HAR sanitize / classify / fan report |
| Browser extension | Live soft/hard/fan monitor (no HAR) |
| `docs/assets/*` | Architecture + fan-position charts |

Sanitized HARs available to Google eng on request. Walkthrough call welcome.  
Repo scope is **read-only forensics** — deliberately no generation automation.

---

## Non-goals

- Evading detection  
- Special capacity for one account  
- Public pile-on  

---

## Closing line

**Make Flow’s UI and Flow’s scorer agree on what a human click is.**

Until then, every multi-output Ultra session is a live repro — and every Retry is a gift to your false-positive rate.
