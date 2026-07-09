# Flow Fixer

**Reliability toolkit for [Google Flow](https://labs.google/fx/tools/flow) power users — and a production incident write-up for the engineers who ship it.**

Flow Fixer does **not** bypass rate limits, forge reCAPTCHA, or automate generation.  
It does something more useful: it turns a Chrome HAR into a clear diagnosis of why Flow said *“unusual activity”* when a human was just clicking Retry.

```text
python -m flowfixer analyze path/to/capture.har
```

```text
GENERATE CALLS: 143
  200 OK .............. 44
  HARD unusual ........ 98   reCAPTCHA / TOO_MUCH_TRAFFIC
  SOFT throttle .......  0
  FILTER / policy .....  1

FAN POSITION PASS RATE (gap ≤ 2s clusters)
  pos  0:  90.5%
  pos  1:  52.9%
  pos  6+:  0.0%   ← UI fan-out meeting a per-call scorer
```

If you work on Flow / Labs / abuse systems: the [engineering brief](docs/ENG_BRIEF.md) is the thing to read.  
If you pay for Ultra and keep getting locked out: start with [ops doctrine](docs/OPS_DOCTRINE.md).

---

## What this is

| Tool | Purpose |
|------|---------|
| `flowfixer sanitize` | Strip cookies, auth, API keys; truncate huge base64 media — safe to share |
| `flowfixer analyze` | Classify soft throttle vs hard unusual vs content filter; burst / fan-out report |
| `flowfixer report` | Markdown summary you can paste into feedback or a bug |

Measured on real production HARs (sanitized, not published here):

- Generate calls carry **fresh unique reCAPTCHA tokens** — failures are not “stale captcha.”
- UI **output count N** becomes **N parallel HTTP generate calls** (each scored).
- **Retry / Retry-All** produces 12–20 calls in seconds — then the hard gate sticks.
- Official “wait a couple of minutes” is **insufficient** once `PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC` is sticky (probes still failed after multi-minute quiet gaps).

---

## What this is not

- Not a bot, undress, or “unlimited Veo” tool  
- Not a reCAPTCHA solver or score spoofer  
- Not multi-account farming  
- Not legal advice  

If you want those, you’re in the wrong repo. This project exists so paying users and Google eng can **see the same physics**.

---

## Install

```bash
git clone https://github.com/coldbricks/flow-fixer.git
cd flow-fixer
python -m pip install -e .
```

Python 3.10+.

---

## Quick start

### 1. Capture a HAR while Flow misbehaves

Chrome → DevTools → Network → ☑ Preserve log → reproduce → Export HAR.

### 2. Sanitize before you share anything

```bash
python -m flowfixer sanitize ./raw.har -o ./sanitized.har
```

Raw HARs often contain live cookies. **Never commit raw HARs. Never email raw HARs.**

### 3. Analyze

```bash
python -m flowfixer analyze ./sanitized.har
python -m flowfixer report  ./sanitized.har -o ./report.md
```

### 4. Operate like the scorer is real

See [docs/OPS_DOCTRINE.md](docs/OPS_DOCTRINE.md): output=1 under pressure, no Retry-All, hard-gate → new session, model lane hop, etc.

---

## The core bug (one paragraph)

Flow’s generate API scores **traffic per HTTP call** via reCAPTCHA Enterprise (`RESOURCE_EXHAUSTED` / `PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC`).  
The Flow **frontend multiplies one user action into many calls** (typically 4 for multi-output; 12–20 for Retry-All), each with its own token.  
Pass rate collapses by fire-order inside a burst. After sustained load the hard gate becomes **sticky**.  
That is a product ↔ abuse-system mismatch — not “the user is a botnet.”

Full write-up + fix proposals: **[docs/ENG_BRIEF.md](docs/ENG_BRIEF.md)**.

---

## Repo layout

```text
flowfixer/          CLI + library
docs/
  ENG_BRIEF.md      Staff-eng style incident + fixes
  OPS_DOCTRINE.md   How to work while the product is like this
  INTERNAL_MAP.md   Wire names, flags, model keys (from public HAR inspection)
fixtures/           Tiny synthetic HAR for tests (no real accounts)
```

---

## For Google folks

If this landed on your desk: thank you for reading.

- Sanitized HARs and repro notes available on request  
- Happy to walk through fan-position charts and sticky-gate probes on a short call  
- Fix proposals in the brief are intentionally small and testable  

Contact via GitHub issues on this repo, or the channel where the original analysis was discussed.

---

## Ethics / security

See [SECURITY.md](SECURITY.md).  
Please do not open issues asking how to evade abuse detection. Those will be closed.

---

## License

MIT — see [LICENSE](LICENSE).

Google Flow, Veo, Gemini, and related marks are Google’s. This is an independent project.
