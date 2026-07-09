# Flow client fan-out × reCAPTCHA velocity

**Technical analysis and fix proposals**  
Independent reliability research · Google Flow (`labs.google`) · 2026

| | |
|--|--|
| **Audience** | Product / client / abuse engineers, and technical users reproducing the issue |
| **Scope** | Network-level measurement of generate traffic and UI request shape |
| **Out of scope** | Billing disputes, account escalation, automation, or abuse bypass |

---

## Summary

Flow evaluates **reCAPTCHA risk per generate HTTP call**.  
The Flow UI implements multi-output and Retry as **N parallel generate HTTP calls** (commonly 4; Retry-All often 12–20), each with a **fresh token**. On the image path, captcha context is often nested **twice** (outer + per-request).

**Measured result:** pass rate **collapses by fire-order inside a single user action** (about 90% at position 0 → about 0% at position 6+ in heavy bursts). Identical creative input with unique seeds and unique tokens can pass or fail depending on *when* the call lands in the burst.

Sustained load can move from soft throttle (`USER_REQUESTS_THROTTLED`) to hard unusual-activity (`TOO_MUCH_TRAFFIC`). Once hard, **sparse retries after multi-minute quiet gaps** may still fail, so “wait a couple of minutes” is incomplete as recovery guidance.

Retry that partially succeeds creates intermittent reinforcement: users retry more, which increases scored traffic.

**One sentence:** first-party UI fan-out multiplies scorer events per human action; the scorer then treats that volume as unusual traffic.

Tooling in this repository (**Flow Fixer**): HAR CLI + browser extension (observe; optional self-pacing of the user’s own requests).

---

## Two different 429s

### Hard — reCAPTCHA / unusual activity

```text
HTTP 429  RESOURCE_EXHAUSTED
message:  "reCAPTCHA evaluation failed"
reason:   PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC
```

UI copy often: *“We noticed some unusual activity…”*  
Empty-body size fingerprint observed when DevTools drops text: **~287 B**.

### Soft — ordinary throttle

```text
HTTP 429  RESOURCE_EXHAUSTED
message:  "Resource has been exhausted (e.g. check quota)."
reason:   PUBLIC_ERROR_USER_REQUESTS_THROTTLED
```

Empty-body fingerprint: **~297 B**.

Treating all 429s as one class hides the soft → hard escalation path.

---

## Method

- Interactive sessions; sanitized Chrome HARs and/or the live extension  
- Generate isolation on `aisandbox-pa.googleapis.com` (exclude status polls / frontend logs)  
- Classification via reason enums + size fingerprints when bodies are missing  
- Burst clusters: gap ≤ 2s  
- Fan-position pass rates within a cluster  
- Token presence + uniqueness audits  
- Sticky probes: single generates after multi-minute quiet  

Open-source classifiers: `flowfixer` CLI and `extension/`.

---

## Findings

### 1. Failures are not explained by missing or reused tokens

| Session shape | Generate calls | Tokens present | Unique |
|---------------|---------------:|---------------:|-------:|
| Video hard-gate | 240 | 240 | 240 |
| Image mixed | 630 | ~629 | ~629 |
| Retry storm | 142–143 | 142 | 142 |

Hard responses cite evaluation failure with **TOO_MUCH_TRAFFIC** — velocity/risk scoring, not absent tokens.

### 2. Wire shape multiplies scorer events

Image generate bodies are effectively one item per HTTP call:

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

Multi-output is **N HTTP calls** sharing a `batchId`, not one multi-request RPC.

### 3. Fan-position bias

Within gap ≤ 2s clusters (one click / retry batch), pass rate falls by fire order (illustrative heavy sessions):

| Fire order | Retry-storm pass % | Video lockout pass % |
|-----------:|-------------------:|---------------------:|
| pos 0 | ~90% | ~93% |
| pos 1 | ~50% | ~12% |
| pos 6+ | ~0% | ~0% |

### 4. Sticky hard gate

After hard gate engagement, single probes after quiet gaps of **~6–11 minutes** still returned hard unusual-activity in measured sessions.

### 5. Retry amplifies scored traffic

In a ~4 minute Retry-heavy capture on one creative family: roughly **43** successes and **98** hard unusual blocks. Partial success encourages more retries.

### 6. Config vs client default (video audio)

App config observed: `isReturnSilentVideosEnabled: true`  
Video generate bodies observed: `audioFailurePreference: "BLOCK_SILENCED_VIDEOS"`  

Fail-closed audio handling can force retries even when silent return is feature-flagged.

### 7. Method note

Sessions dominated by content-policy `400`s are poor *primary* exhibits for a pure traffic claim. Prefer same-payload retry storms and video hard-gate sessions with clean token audits for traffic scoring analysis.

---

## Working model

```text
human click
  → UI fans out N generate RPCs (shared batchId)
  → N reCAPTCHA evaluations
  → soft throttle and/or hard unusual-activity
  → hard may become sticky
  → Retry multiplies further scored calls
```

Capacity limits may be necessary. Misalignment between **UI request shape** and **per-call scoring** is a separable product issue.

---

## Fix proposals (testable)

### F1 — Client: one user action should not imply N independent scores

Options: stagger multi-output; one evaluation per `batchId`; serialize when near throttle.

**Acceptance:** 20× output=4 at human pace on a healthy high-tier account does not enter hard unusual within a fixed window.

### F2 — Scorer: de-weight first-party retry patterns

Blocked calls and identical-payload retry families should not escalate sticky score like novel cross-session automation.

**Acceptance:** Retry-All on failed cards does not create more sticky risk than an equal number of spaced single clicks.

### F3 — Clearer product copy

Distinct strings for soft vs hard; honest sticky/cooldown messaging; published numeric limits where possible.

### F4 — Align silent-video flag and defaults

If silent return is enabled, default preference should not force block-and-retry without a control.

### F5 — Instrumentation

Log `batchId`, fan index, and soft→hard transitions in abuse dashboards (not raw QPS alone).

---

## Desired end state

A person using multi-output and occasional Retry should not be scored as if they were a distributed client **solely because the first-party UI emits multi-call bursts per action**.

Limits can remain. Labeling and client architecture should agree on what a human click is.

---

## Artifacts in this repo

| Artifact | Role |
|----------|------|
| This document | Argument + acceptance tests |
| `flowfixer` CLI | Offline HAR sanitize / classify / report |
| Browser extension | Live monitor + optional self-pacing |
| `docs/assets/*` | Architecture and fan-position charts |

Exports and HARs should be sanitized before sharing. The project is **local / read-only forensics** by design (optional delay of the user’s own generate calls only).

---

## Non-goals

- Evading detection  
- Automating generation  
- Special capacity for one account  

Independent project; not affiliated with Google.
