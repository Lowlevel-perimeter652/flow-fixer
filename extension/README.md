# Flow Fixer — browser extension

Live reliability monitor + **AUTO-THROTTLE** for [Google Flow](https://labs.google/fx/tools/flow).

## Download (what most people want)

### Direct zip (latest release)

**[Download flow-fixer-extension.zip](https://github.com/coldbricks/flow-fixer/releases/latest/download/flow-fixer-extension.zip)**

That link always points at the newest packaged build. Your browser downloads it like any other file.

### Install from the zip (Chrome / Edge / Brave)

1. **Download** the zip (link above)
2. **Unzip** to a folder you won’t delete (example: `C:\Users\You\Apps\flow-fixer-extension`)
3. Open `chrome://extensions` or `edge://extensions`
4. Turn on **Developer mode**
5. Click **Load unpacked**
6. Select the unzipped folder — you should see `manifest.json` inside it
7. Open https://labs.google/fx/tools/flow and **hard refresh** (`Ctrl+Shift+R`)
8. Pin **Flow Fixer** on the toolbar

### Why not “Add to Chrome” one-click?

Google only allows silent install from the **Chrome Web Store** (or enterprise policy).  
GitHub zips are the standard open-source distribution path: download in browser → Load unpacked.

---

## AUTO-THROTTLE

Optional **pace control** on *your* generate calls. Does not forge captcha or strip tokens.
It **serializes / delays** requests so multi-output and Retry don’t redline the scorer.

### Speed ladder (slow → yeehaw)

| Gear | Vibe | Gap (approx) |
|------|------|--------------|
| 🧊 **Molasses** | in January — way under throttle | ~9s |
| 💧 **Water** | room temp | ~4.5s |
| 🚶 **Brisk Walk** | coffee in hand | ~2.5s |
| 💼 **The Job** | paid to ship (default) | ~1.2s |
| 🎸 **Highway Star** | Alright. Hold tight. (Deep Purple) | ~0.6s |
| 🐎 **Black Beauty** | horse + amphetamine | ~0.3s |
| 🚂 **Casey Jones** | danger at the wheel | parallel / full send |

**Auto shift (default ON):**
- soft throttle → downshift 2 gears  
- hard unusual → **Molasses** + ~12 min cool-down hold  
- clean OK streak → gradual upshift  

On-page toast when it downshifts. Toolbar badge: `⏱` armed, `~` soft, `!` / `❄` hard.

Turn **AUTO-THROTTLE** off anytime to go pure monitor mode.

## What you’ll see

| UI | Meaning |
|----|---------|
| **Speed ladder** | Pick a gear or let Auto shift drive |
| **ok / soft / hard** pill | Session health |
| **Fan position pass %** | First-in-burst vs tail |
| **Recent** | Status + model + pace delay |
| **Export** | Sanitized JSON (no tokens/prompts) |

## How it works

1. A **MAIN-world** script on `labs.google` wraps `fetch` / `XHR` (observe + optional pace).
2. Generate calls to `aisandbox-pa.googleapis.com` are classified (soft / hard / filter).
3. Service worker keeps the last 500 events in `chrome.storage.session`.
4. Popup renders stats; badge shows health.

## Privacy

- Tokens / projectId / sessionId redacted in the bridge  
- Export omits prompts  
- Nothing sent to a third-party server  

## Dev install (from repo clone)

```text
Load unpacked → path/to/flow-fixer/extension
```

Rebuild release zip:

```powershell
pwsh scripts/package_extension.ps1
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Always idle | Hard-refresh Flow after install/reload |
| “Manifest file is missing” | You selected the wrong folder — pick the one with `manifest.json` |
| Broke after update | Remove extension, re-download zip, Load unpacked again |

## Pair with the CLI

```bash
python -m flowfixer analyze capture.har
```
