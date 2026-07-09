# Privacy

Flow Fixer is designed for **local** use.

## Browser extension

- Runs in your browser on `labs.google` and related generate API traffic  
- Does **not** upload session data to Flow Fixer servers (there are none)  
- Keeps a rolling buffer of the last **500** generate classifications in `chrome.storage.session`  
- Redacts reCAPTCHA tokens, project IDs, and session IDs in the page bridge  
- **Export JSON** includes outcomes, timestamps, model names, and pace metadata — **not** prompts, cookies, or captcha tokens  

## Python CLI

- Reads HAR files you provide on disk  
- `sanitize` removes cookies, auth headers, API keys, large media blobs, tokens, project/session IDs, and credit numbers  
- Never commit or email **raw** HARs  

## What we ask of you when sharing

- Prefer **sanitized** HARs or extension exports  
- Do not publish personal prompts, likeness media, or account identifiers  
- This repository’s fixtures are **synthetic** only  

## Independent project

Not affiliated with Google. See [SECURITY.md](SECURITY.md) for abuse-related boundaries.
