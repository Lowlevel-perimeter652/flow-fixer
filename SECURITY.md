# Security policy

## This project will not help with

- Bypassing reCAPTCHA, abuse detection, or paygates  
- Automating generation against Google Flow  
- Credential stuffing, account farming, or shared-session abuse  
- Extracting other users’ data  

Issues and PRs requesting those will be closed.

## What we do support

- Safer **HAR sanitization** before sharing captures  
- **Forensic analysis** of your own traffic  
- Responsible, technical reports to Google about product defects  

## Reporting a vulnerability in Flow Fixer itself

Open a private security advisory on GitHub if the CLI mishandles local files or fails to redact secrets. Please do not file public issues that include raw HAR cookies or tokens.

## Sharing HARs

Always run:

```bash
python -m flowfixer sanitize raw.har -o sanitized.har
```

before upload, email, or Discord. Default mode redacts token strings.
