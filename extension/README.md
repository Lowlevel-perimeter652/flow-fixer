# Flow Fixer — browser extension

Live reliability monitor + optional **AUTO-THROTTLE** for [Google Flow](https://labs.google/fx/tools/flow).

Local only. Does not forge captcha, automate generation, or upload your prompts.

## Download

**[flow-fixer-extension.zip](https://github.com/coldbricks/flow-fixer/releases/latest/download/flow-fixer-extension.zip)**

Always points at the latest release.

## Install (Chrome / Edge / Brave)

1. Download the zip  
2. Unzip to a permanent folder  
3. `chrome://extensions` or `edge://extensions` → **Developer mode**  
4. **Load unpacked** → folder containing `manifest.json`  
5. Open Flow → **hard refresh** (`Ctrl+Shift+R`)  
6. Pin **Flow Fixer**

Chrome cannot one-click install zips from GitHub (Web Store only).

## AUTO-THROTTLE

When **on** (default), the extension may **serialize and delay** *your* generate requests so multi-output / Retry don’t immediately redline the scorer.

When **off**, it only monitors (no pacing).

### Speed ladder

| Gear | Vibe | Approx gap |
|------|------|------------|
| 🧊 Molasses | Way under throttle | ~9s |
| 💧 Water | Calm | ~4.5s |
| 🚶 Brisk Walk | Human pace | ~2.5s |
| 💼 The Job | Default | ~1.2s |
| 🎸 Highway Star | Spicy, still serialized | ~0.6s |
| 🐎 Black Beauty | Fast | ~0.3s |
| 🚂 Casey Jones | Full parallel | none |

**Casey Jones** will trip soft/hard under load — intentional stress / max fan-out only.

**Auto shift:** soft → downshift; hard → Molasses + cool-down; clean OK streak → upshift.

## Export

Exports the last **500** classified generate events as JSON (outcomes, models, pace metadata). No prompts or captcha tokens.

## Diagnostics

Popup shows inject heartbeat and network hit counts. If you see `inject not seen`, hard-refresh Flow after reloading the extension.

## Privacy

See [PRIVACY.md](../PRIVACY.md). Nothing is sent to a Flow Fixer server.

## Dev

```text
Load unpacked → repo/extension
powershell -ExecutionPolicy Bypass -File scripts/package_extension.ps1
```
