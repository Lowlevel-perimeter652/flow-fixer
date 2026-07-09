# Limitations & confounds

Honest caveats. Flow Fixer measures outcomes; it does not own Google’s scorer.

## 1. reCAPTCHA may see the extension

The inject path monkey-patches `window.fetch` / `XHR` in the page.  
reCAPTCHA Enterprise can fingerprint the JS environment. **In principle** a patched `fetch` is detectable. Nobody outside Google can prove whether that raises risk scores.

**What to do:** If hard-gate rate seems *worse* with the extension installed, A/B:

1. Session with AUTO-THROTTLE **off** and Monitor **on**  
2. Session with extension **disabled** entirely  

Compare. The toggles exist for this.

Pacing still only **delays your own** generate calls — it never forges tokens or strips captcha fields.

## 2. VPN / IP reputation confounds

Hard gates behind commercial VPNs (shared ASNs, datacenter exits) can be **IP reputation**, not click pacing.

Before trusting a “bad” session’s velocity diagnosis:

- Check exit identity (e.g. `curl ipinfo.io/org` or equivalent)  
- Prefer a stable residential/home IP for production sessions  
- Don’t rotate exits mid-session  

Otherwise you may downshift to Molasses to “fix” an IP problem.

## 3. Empty-body 429 size fingerprints are a fallback

Primary classification uses Google’s reason enums in the JSON body:

- `PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC` → hard  
- `PUBLIC_ERROR_USER_REQUESTS_THROTTLED` → soft  

When DevTools/webRequest has **no body**, we use **size bands** (historically ~287 hard / ~297 soft). If Google edits the error payload, size matching can misclassify until the next update. Unknown empty 429s are labeled conservatively and, for auto-throttle severity, treated closer to **soft** than sticky hard.

## 4. Not a full substitute for a HAR

The extension keeps the last **500** events and redacts project IDs.  
For legal/support exhibits, still prefer a **sanitized HAR** + CLI report when you need full timing fidelity.

## 5. Not affiliated with Google

Independent tool. Not a captcha bypass, bot, or multi-account utility.
