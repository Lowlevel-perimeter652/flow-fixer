# Flow client fan-out × reCAPTCHA velocity

**Production failure analysis & fix proposals**  
Independent reliability research on Google Flow (labs.google) · 2026

> Audience: Flow / Labs / abuse / client eng  
> Not a consumer complaint. Not a request for special quota.  
> Goal: align the product UI with the traffic-scoring system that already exists.

---

## Summary

Paying Flow traffic is evaluated **per HTTP generate call** by reCAPTCHA Enterprise. Failures surface as:

```text
HTTP 429 RESOURCE_EXHAUSTED
message: "reCAPTCHA evaluation failed"
reason:  PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC
```

Separately, ordinary throttling appears as:

```text
HTTP 429 RESOURCE_EXHAUSTED
message: "Resource has been exhausted (e.g. check quota)."
reason:  PUBLIC_ERROR_USER_REQUESTS_THROTTLED
```

The Flow **frontend multiplies a single user action into many generate calls** (commonly 4 for multi-output; 12–20 for Retry / Retry-All). Each call carries a fresh reCAPTCHA token and is scored independently. Pass rate collapses by fire-order within a burst. After sustained load, the hard gate becomes **sticky** — sparse probes minutes later still fail — so the published guidance “retry after a couple of minutes” is incomplete.

This is a **client architecture ↔ abuse-scoring mismatch**, not evidence that Ultra subscribers are botnets.

---

## Method

- Chrome HAR captures during real interactive sessions (sanitized before share)
- Generate-call isolation (`aisandbox-pa.googleapis.com` + Generate, excluding status polls)
- Outcome classification (soft / hard / filter / OK) including body-size fingerprints when DevTools drops response text
- Burst clustering (gap ≤ 2s)
- Fan-position pass rates within clusters
- reCAPTCHA token presence + uniqueness audits
- Sticky probes: single requests after multi-minute quiet gaps

Tooling for this analysis is open-sourced as **Flow Fixer** in this repository.

---

## Findings

### 1. Failures are not “missing / reused tokens”

Across multiple sessions:

| Session type | Generate calls | Tokens present | Unique |
|--------------|---------------:|---------------:|-------:|
| Video lockout (hard gate) | 240 | 240 | 240 |
| Image session (mixed) | 630 | ~629 | ~629 |
| Retry storm | 142–143 | 142 | 142 |

Tokens are long-lived-format, unique per call. The hard error explicitly says **reCAPTCHA evaluation failed** with reason **TOO_MUCH_TRAFFIC** — velocity / risk scoring, not an absent token.

### 2. Wire shape: one item per HTTP body, N HTTP calls per click

Image generate bodies look like:

```json
{
  "clientContext": { "recaptchaContext": { "token": "…" }, "tool": "PINHOLE", "sessionId": ";<epoch_ms>" },
  "mediaGenerationContext": { "batchId": "<uuid>" },
  "useNewMedia": true,
  "requests": [ { /* single generate */ } ]
}
```

`requests` is length **1** per HTTP call. Multi-output UI is implemented as **parallel HTTP fan-out** sharing a `batchId`, not one multi-request RPC. That multiplies scorer events per human click.

Image path often nests `recaptchaContext` **twice** (outer + per-request).

### 3. Fan-position bias (the smoking chart)

Within gap≤2s clusters (one human action / retry batch):

| Fire order | Approx pass rate (retry storm) | Approx (video lockout) |
|-----------:|-------------------------------:|-----------------------:|
| pos 0 | ~90% | ~93% |
| pos 1 | ~50% | ~12% |
| pos 6+ | ~0% | ~0% |

Identical creative payload + unique seeds + unique tokens → outcome depends on **when** the call lands in the burst.

### 4. Soft vs hard are different machines

| | Soft | Hard |
|--|------|------|
| Reason | `USER_REQUESTS_THROTTLED` | `UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC` |
| Message | Resource exhausted / quota-ish | reCAPTCHA evaluation failed |
| Empty-body size fingerprint (observed) | ~297 B | ~287 B |
| Recovery | wait / pace | can become sticky for many minutes |

### 5. Sticky hard gate falsifies short cooldowns

In a long image session, after the hard gate engaged, single generate attempts after quiet gaps of **~6–11 minutes** still returned hard unusual-activity. “Wait a couple of minutes” is not a reliable recovery procedure once sticky.

### 6. Retry is an intermittent-reinforcement trap

A 4-minute Retry storm on one payload family delivered ~43 images and ~98 hard blocks. Partial success trains users to hammer Retry; hammering feeds the score; sticky lockout follows. **The product’s own Retry control manufactures the traffic shape the scorer punishes.**

### 7. Config vs client contradiction (video audio)

App config (`videoFx.getFlowAppConfig`) includes:

- `isReturnSilentVideosEnabled: true`

Observed video generate bodies send:

- `mediaGenerationContext.audioFailurePreference: "BLOCK_SILENCED_VIDEOS"`

That fail-closed preference forces retries on audio failure even when silent return is feature-flagged on — another avoidable burst source.

### 8. Method note on mixed sessions

Sessions with large volumes of content-policy `400`s are **not** ideal primary exhibits for a pure traffic claim. Use them for sticky-gate / escalation timelines; use cleaner video or same-payload retry captures for content-neutral traffic scoring.

---

## Fix proposals (small, testable)

### F1 — Client: stop turning one click into N scored events

**Options (any one helps):**

1. Serialize multi-output generate (small stagger, e.g. 250–500ms)  
2. One reCAPTCHA evaluation per `batchId`, reused for sibling outputs  
3. Default Ultra power users to output=1 when soft throttle is near  

**Acceptance:** 20 consecutive output=4 human clicks at human pace do not enter hard unusual within a fixed window on a healthy account.

### F2 — Scorer: de-weight product-induced retries

Blocked calls and identical-payload retry families should not escalate sticky score the same as novel cross-session automation.

**Acceptance:** Retry-All on 4 already-failed cards creates no more sticky risk than 4 spaced single clicks.

### F3 — Product copy + published limits

- Distinct UI strings for soft vs hard  
- When sticky, show an honest cooldown (or “session cooling”) instead of “try again in a couple of minutes”  
- Publish numeric tier limits for Ultra so users can plan production  

### F4 — Align silent-video flag with client preference

If `isReturnSilentVideosEnabled`, default preference should not be `BLOCK_SILENCED_VIDEOS` without a user-facing control.

**Acceptance:** audio-quality failure can complete as silent when flag is on, without requiring a retry storm.

### F5 — Instrumentation

Log `batchId`, fan index, and soft→hard transitions server-side so eng can see UI fan-out in abuse dashboards (not just raw QPS).

---

## What good looks like

A paying human using multi-output and occasional Retry should not be indistinguishable from distributed abuse **because the first-party client emits abuse-shaped traffic.**

---

## Offer

- Sanitized HARs and analysis scripts available to Google eng  
- Happy to join a short repro / walkthrough call  
- This repo (`flow-fixer`) is intentionally **read-only forensics** — no generation automation  

---

## Non-goals

- Evading abuse detection  
- Special capacity for one account  
- Public shaming  

The desired end state is simple: **Flow’s UI and Flow’s scorer agree on what a human click is.**
