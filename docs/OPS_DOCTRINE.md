# Flow Fixer — ops doctrine

How to keep shipping while Flow’s traffic scorer is blunt.

This is **not** a bypass guide. It is how you avoid volunteering for a sticky lockout.

---

## Yellow light — soft throttle

**Signals:** “too quickly”, `USER_REQUESTS_THROTTLED`, ~297-byte 429 bodies.

**Do:**
- Stop multi-output (set **output = 1**)
- Wait; then single paced gens
- Switch model path if one lane is hot (e.g. image model A → B)

**Don’t:**
- Retry-All
- Hammer failed cards

---

## Red light — hard unusual activity

**Signals:** “unusual activity”, `PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC`, “reCAPTCHA evaluation failed”, ~287-byte 429 bodies.

**Do:**
- **Stop the session** (not “one more try”)
- Long quiet (think 30–90+ minutes) **or** new browser profile / browser
- One probe gen only after reset

**Don’t:**
- Poll every 30 seconds (you keep yourself sticky)
- Open three profiles and generate in parallel (looks like shared-account abuse)

---

## Production habits that match the wire format

1. **Output count is a multiplier.** N outputs ≈ N scored HTTP calls.  
2. **Never Retry-All** under pressure.  
3. **Filter 400 → change the payload**, don’t retry-storm the same reject.  
4. **Heavy ref stacks cost more.** Prototype with 0–1 refs; add later.  
5. **Video:** watch credits; check library before re-paying a “failed” card. Prefer silent-return if the UI ever exposes it (`BLOCK_SILENCED_VIDEOS` is fail-closed).  
6. **Stable IP** for heavy days; don’t rotate VPN exits mid-session.  
7. **Clean profile** for production (minimal extensions) when things get weird.  
8. **A/B the extension** if hard gates feel worse with it on — patched `fetch` is theoretically visible to reCAPTCHA (see [LIMITATIONS.md](LIMITATIONS.md)).  
9. **VPN first:** confirm exit ASN before blaming velocity alone.

---

## Capture ritual (when filing feedback)

1. DevTools → Network → Preserve log  
2. Reproduce once  
3. Export HAR  
4. `python -m flowfixer sanitize raw.har -o safe.har`  
5. `python -m flowfixer report safe.har -o report.md`  
6. In-app feedback tag if staff requested one (historically `[Generating Too Quickly]`)  
7. Never send raw HARs (cookies / auth)

---

## Mental model

```text
human click
   → UI fans out N generate HTTP calls (same batchId)
   → each call scored by reCAPTCHA
   → soft throttle  →  hard unusual  →  sticky
```

You win by **not lighting the fuse**, not by cutting the wire.
