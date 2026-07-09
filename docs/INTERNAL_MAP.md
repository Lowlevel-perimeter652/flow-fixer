# Flow internal map (from client traffic inspection)

Independent notes from sanitized HAR inspection of the public Flow web app.  
Names and flags change; treat as a field guide, not an API contract.

---

## Hosts

| Host | Role |
|------|------|
| `labs.google` | UI / tRPC / static |
| `aisandbox-pa.googleapis.com` | Generate, credits, workflows, agents |
| `flow-content.google` | Media CDN-ish |

---

## Useful endpoints

| Path | Notes |
|------|--------|
| `POST .../flowMedia:batchGenerateImages` | Image gen (NARWHAL / GEM_PIX_*) |
| `POST .../video:batchAsyncGenerateVideoEditVideo` | Video edit (e.g. `abra_edit`) |
| `POST .../video:batchAsyncGenerateVideoReferenceImages` | Ref→video |
| `POST .../video:batchCheckAsyncVideoGenerationStatus` | Poll |
| `GET/POST .../v1/credits` | Balance + tier fields |
| `.../flow/models/statuses` | Model health |
| `tRPC videoFx.getFlowAppConfig` | Feature flags + experiments |
| `.../flow:batchLogFrontendEvents` | Client telemetry (includes error enums) |
| `.../flowCreationAgent/*` | Agent sessions |
| `.../flowAppletAgent/*` | Tools / applets |
| `.../flow/likeness:*` | Avatar / likeness |

---

## Identity / tier fields (`/v1/credits`)

Observed shape:

```json
{
  "credits": 12345,
  "userPaygateTier": "PAYGATE_TIER_TWO",
  "sku": "G1_TIER2",
  "serviceTier": "SERVICE_TIER_ADVANCED",
  "topUpCredits": 1000,
  "subscriptionCredits": 11345
}
```

SKU ladder seen in app content: `G1_TIER0`, `G1_TIER1`, `G1_TIER1P5`, `G1_TIER2`, plus Workspace SKUs (`WS_ULTRA`, …).

---

## Model keys (wire)

**Video health list (examples):** `abra`, `veo_3_1_fast`, `veo_3_1_quality`, `veo_3_1_lite`, `veo_3_1_lite_low_priority`

**Video generate keys observed:** `abra_edit`, `abra_r2v_10s`, `abra_r2v_8s`

**Image:** `NARWHAL`, `GEM_PIX_2`

Health enum includes `MODEL_HEALTH_STATUS_HEALTHY` and (in client) `MODEL_HEALTH_STATUS_HIGH_DEMAND`.

---

## Generate request knobs (observed)

| Field | Meaning |
|-------|---------|
| `clientContext.tool` | Always `PINHOLE` on Flow web |
| `clientContext.sessionId` | `;` + epoch ms (client-minted) |
| `clientContext.recaptchaContext` | token + `RECAPTCHA_APPLICATION_TYPE_WEB` |
| `mediaGenerationContext.batchId` | Groups a UI multi-output click |
| `mediaGenerationContext.audioFailurePreference` | e.g. `BLOCK_SILENCED_VIDEOS` |
| `useNewMedia` | Image pipeline flag |
| `useV2ModelConfig` | Seen on some video ref paths |
| `imageModelName` / `videoModelKey` | Model lane |
| `imageAspectRatio` / `aspectRatio` | Aspect enums |
| `seed` | Per-call variance |
| `imageInputs[]` / `referenceImages[]` | References |
| `referenceLikenesses[]` | Likeness / @handle path |

---

## App config flags (`getFlowAppConfig` examples)

- `isAbraEnabled`
- `isReturnSilentVideosEnabled`
- `isFlowUpsamplingEnabled`
- `isGemPixProEnabled`
- `isObjectRemovalEnabled`
- `isAudioPresetsEnabled`
- `agentModeDefaultState` (e.g. `agent_on_chat_on`)
- `activeExperimentIds` (large list — you are in many experiments)
- `changeLogId` (shipping train id)
- `imageUpsamplerMinTimeSeconds` (unix gate)

---

## Error enums worth filtering in DevTools

- `PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC`
- `PUBLIC_ERROR_USER_REQUESTS_THROTTLED`
- `PUBLIC_ERROR_SEXUAL`
- `PUBLIC_ERROR_PROMINENT_PEOPLE_FILTER_FAILED`
- `PUBLIC_ERROR_UNSAFE_GENERATION`
- Frontend mirrors: `pinhole_unusual_activity_too_much_traffic_error`, etc.

---

## Architecture one-liner

**One human click → N HTTP generate calls (often 4) → N reCAPTCHA evaluations → optional sticky hard gate.**
