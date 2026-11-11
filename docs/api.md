# API reference

This document covers every API the playground **creates** and every external API it **uses**. For each one it gives the endpoints, the request and response formats, how callers authenticate, and examples.

The zod schemas in [`packages/shared/src`](../packages/shared/src) are the source of truth for every body that crosses a process boundary. The BFF, the mock wallet, the mock verifier and `interop-cli` all validate against them. When this document and a schema disagree, the schema is correct.

## Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Conventions](#3-conventions)
4. [Playground BFF REST API](#4-playground-bff-rest-api)
5. [Playground BFF realtime events (socket.io)](#5-playground-bff-realtime-events-socketio)
6. [Protocol Tap](#6-protocol-tap)
7. [Mock wallet API](#7-mock-wallet-api)
8. [Mock verifier API](#8-mock-verifier-api)
9. [External APIs the playground uses](#9-external-apis-the-playground-uses)
10. [Example use cases](#10-example-use-cases)

## 1. Overview

### APIs created by this project

| API | Code | Address (Docker Compose stack) | Called by |
| --- | --- | --- | --- |
| Playground BFF REST API | [`apps/playground-bff/src/main.ts`](../apps/playground-bff/src/main.ts) | `http://localhost:8101/api/…`, also through the UI at `http://localhost:8100/api/…` | Playground UI, `interop-cli`, scripts |
| BFF realtime events | [`apps/playground-bff/src/realtime/gateway.ts`](../apps/playground-bff/src/realtime/gateway.ts) | socket.io at `http://localhost:8101/socket.io` (or `:8100/socket.io`) | Playground UI |
| Prometheus metrics | [`apps/playground-bff/src/telemetry/metrics.ts`](../apps/playground-bff/src/telemetry/metrics.ts) | `http://localhost:8101/metrics` | Prometheus (`telemetry` profile) |
| Protocol Tap | [`apps/playground-bff/src/tap/proxy.ts`](../apps/playground-bff/src/tap/proxy.ts) | `https://certify.localhost:8443`, `https://verify.localhost:8443` (through the gateway) | Wallets, Mimoto, the BFF's adapters |
| Mock wallet API | [`apps/mock-wallet/src/main.ts`](../apps/mock-wallet/src/main.ts) | `http://localhost:8104` | BFF `MockWalletAdapter`, scripts |
| Mock verifier API | [`apps/mock-verifier/src/server.ts`](../apps/mock-verifier/src/server.ts) | `http://localhost:8105/mock-verifier`, public as `https://verify.localhost:8443/mock-verifier` | BFF `MockVerifierAdapter` (management), wallets (OpenID4VP) |

### External APIs used

| API | Used for | Adapter |
| --- | --- | --- |
| Inji Certify 0.14.0: OpenID4VCI draft 13 and the pre-authorized data API | Creating credential offers, issuing credentials | [`inji-certify.ts`](../apps/playground-bff/src/adapters/inji-certify.ts), [`mock-wallet/src/oid4vci.ts`](../apps/mock-wallet/src/oid4vci.ts) |
| Inji Verify 0.18.2: OpenID4VP draft 23 with Presentation Exchange | Presentation requests, results, credential-only checks | [`inji-verify.ts`](../apps/playground-bff/src/adapters/inji-verify.ts) |
| Inji Verify 1.0 (MOSIP Collab): OpenID4VP 1.0 with DCQL | The same, against the hosted sandbox | [`inji-verify-dcql.ts`](../apps/playground-bff/src/adapters/inji-verify-dcql.ts) |
| Mimoto and eSignet (Inji Web) | Wallet backend and login, driven by a person in Inji Web | [`wallets.ts`](../apps/playground-bff/src/adapters/wallets.ts) (`InjiWebWalletAdapter`) |
| Hovi Playground, Animo Playground | Third-party issuers of EUDI PID offers (issue-only tests) | [`external-playgrounds.ts`](../apps/playground-bff/src/adapters/external-playgrounds.ts) |
| Obsrv ingest | Sending one telemetry event per finished run (optional) | [`telemetry/obsrv.ts`](../apps/playground-bff/src/telemetry/obsrv.ts) |

## 2. Authentication

| API | Authentication | Notes |
| --- | --- | --- |
| BFF REST, socket.io, `/metrics` | **None** | A local test tool. Browser access is limited by CORS: `CORS_ORIGINS` (comma-separated) sets the allowed origins; unset allows any origin. Do not expose port 8101 to the internet. |
| Mock wallet | **None** | Reachable only on the Compose network and `localhost:8104`. |
| Mock verifier, management (`api/…`) | **None** | Called by the BFF. |
| Mock verifier, wallet-facing (`oid4vp/…`) | **Signed request object.** The verifier signs the request object (`application/oauth-authz-req+jwt`) with the key in its `did:web` document (`GET did.json`). The wallet checks the signature against the `client_id`. | The response is bound to the request by `nonce` and `state`. |
| Protocol Tap | **Pass-through.** The tap forwards the caller's credentials unchanged. It masks them in the stored copy (see [Masking](#masking)). | The BFF adds `x-playground-run-id` and `x-playground-caller` to its own calls. The tap strips both headers before it forwards the request. |
| Inji Certify, `pre-authorized-data` | **None** in this deployment. The path is in `mosip.certify.security.ignore-auth-urls` ([`certify-default.properties`](../injistack/config/certify-default.properties)). | In production, restrict this endpoint to the issuing back office. |
| Inji Certify, token endpoint | **Pre-authorized code** (`grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code`), and a `tx_code` when the offer asks for one. | |
| Inji Certify, credential endpoint | **Bearer access token** from the token endpoint, and a **proof of possession**: a JWT with `typ: openid4vci-proof+jwt`, signed ES256 by the holder key (`kid` = the holder's `did:jwk`), with `aud` = the issuer and `nonce` = `c_nonce`. | Certify validates the token against its own JWKS. |
| Inji Verify (local and Collab), management API | **None.** `vp-request`, `status` and `vp-result` are open. | Collab is a public sandbox. |
| Inji Verify, wallet-facing | **Client identification.** Local: `client_id` `did:web:verify.localhost%3A8443:v1:verify` (`VERIFY_CLIENT_ID`). Collab: `decentralized_identifier:did:web:injiverify.collab.mosip.net:v1:verify`, with a request object signed by the key in that DID. | The wallet's key-binding `aud` (SD-JWT) or proof `domain` (`ldp_vp`) must equal the `client_id`. |
| Mimoto and eSignet | **OAuth 2.0 authorization code**, with a `private_key_jwt` client assertion from Mimoto (client `wallet-demo`). | See [`injistack/README.md`](../injistack/README.md#esignet-and-the-wallet-profile). |
| Hovi Playground | **Supabase anon key**, sent as `apikey` and as `Authorization: Bearer`. | A public browser key. The adapter reads it from `playground.hovi.id`, or from `HOVI_SUPABASE_URL` and `HOVI_SUPABASE_ANON_KEY`. |
| Animo Playground | **None** | |
| Obsrv ingest | The value of `OBSRV_AUTHORIZATION`, sent as the `Authorization` header. | Only used when `OBSRV_INGEST_URL` is set. |

Captured traffic contains masked secrets by default. Use mock identity data only.

## 3. Conventions

- **Format.** JSON in both directions (`content-type: application/json`) unless the endpoint says otherwise. Responses carry `cache-control: no-store`.
- **Validation.** The BFF, the mock wallet and the mock verifier validate request bodies with zod. An invalid body returns `400`, and the message names the first field that failed, for example `Invalid run config: format: Invalid option`.
- **Errors.** Every BFF error has this body (`ApiErrorSchema`):

  ```json
  { "message": "Run not found", "statusCode": 404 }
  ```

  | Status | Meaning |
  | --- | --- |
  | `400` | Body is not JSON, or it fails its schema, or the run config is rejected (unknown implementation, unsupported mode, tamper not possible) |
  | `404` | Unknown run, exchange, implementation or route |
  | `409` | The run is not waiting for that input |
  | `502` | An upstream (Certify, Verify, a wallet) failed or could not be reached |
  | `500` | Unexpected error |

- **Times** are ISO 8601 strings in UTC. **IDs** of runs are UUIDs.
- **Enumerations** used in many bodies:

  | Name | Values |
  | --- | --- |
  | `CredentialFormat` | `ldp_vc`, `vc+sd-jwt`, `dc+sd-jwt`, `mso_mdoc`, `jwt_vc_json` |
  | `RunMode` | `full`, `issue-only`, `present-only` (`direct-verify` is defined but not built) |
  | `VerificationOutcome` | `VALID`, `INVALID`, `EXPIRED`, `REVOKED`, `REJECTED`, `ERROR` |
  | `InteropVerdict` | `PASS`, `PASS_WITH_WARNINGS`, `FAIL`, `INCONCLUSIVE`, `NOT_APPLICABLE` |
  | `RunState` | `Configured`, `Preflight`, `Issuing`, `Holding`, `Presenting`, `Verifying`, `Evaluating`, `Reported` (terminal), `Aborted` (terminal), `Cancelled` (terminal) |
  | `GrantType` | `pre-authorized_code`, `authorization_code` |
  | `PresentationFlow` | `cross-device-qr`, `same-device-deeplink`, `dc-api` |
  | Tamper IDs | `T-SIG-FLIP`, `T-CLAIM-EDIT`, `T-WRONG-TYPE`, `T-NONCE-REPLAY`, `T-EXPIRED` |

## 4. Playground BFF REST API

Base URL: `http://localhost:8101` (or `http://localhost:8100`, where the UI's nginx proxies `/api/` and `/socket.io/` to the BFF). For a typed client, see [`packages/interop-cli/src/client.ts`](../packages/interop-cli/src/client.ts).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | [`/api/health`](#get-apihealth) | Health of every service in the stack |
| `GET` | [`/api/catalog`](#get-apicatalog) | Issuers, wallets and verifiers, with health and version |
| `GET` | [`/api/catalog/:id/credential-configurations`](#get-apicatalogidcredential-configurations) | What an issuer can issue |
| `GET` | [`/api/catalog/:id/credentials`](#get-apicatalogidcredentials) | What a wallet already holds |
| `POST` | [`/api/compatibility/predict`](#post-apicompatibilitypredict) | Will this combination work, before running it |
| `POST` | [`/api/runs`](#post-apiruns) | Start a run |
| `GET` | [`/api/runs`](#get-apiruns) | Run history, filtered |
| `GET` | [`/api/runs/:id`](#get-apirunsid) | One run in full |
| `GET` | [`/api/runs/:id/exchanges`](#get-apirunsidexchanges) | Every protocol message of a run |
| `GET` | [`/api/runs/:id/sequence`](#get-apirunsidsequence) | Mermaid sequence diagram of a run |
| `GET` | [`/api/runs/:id/report`](#get-apirunsidreport) | Pass/fail report (JSON or Markdown) |
| `POST` | [`/api/runs/:id/manual-evidence`](#post-apirunsidmanual-evidence) | Confirm a step a person did on a phone |
| `POST` | [`/api/runs/:id/dc-api-response`](#post-apirunsiddc-api-response) | Hand over a Digital Credentials API response |
| `POST` | [`/api/runs/:id/cancel`](#post-apirunsidcancel) | Cancel a run |
| `GET` | [`/api/matrix`](#get-apimatrix-and-apimatrixmd) | Interoperability matrix (JSON) |
| `GET` | [`/api/matrix.md`](#get-apimatrix-and-apimatrixmd) | Interoperability matrix (Markdown file) |
| `GET` | [`/api/exchanges/:id`](#get-apiexchangesid) | One protocol message |
| `POST` | [`/api/tap/correlate`](#post-apitapcorrelate) | Link correlation keys to a run |
| `GET` | [`/metrics`](#get-metrics) | Prometheus metrics |

### `GET /api/health`

Probes every service in `INJI_HEALTH_TARGETS` (timeout `HEALTH_TIMEOUT_MS`, default 3 s). Always answers `200`. `status` is `up` when every required service is up, `degraded` when only some are, and `down` when none are. A service's `status` is `up`, `down`, or `not-running` (its hostname does not resolve, for example when a Compose profile is not started).

```json
{
  "status": "up",
  "checkedAt": "2026-11-02T09:14:03.120Z",
  "services": [
    { "name": "certify", "url": "http://certify:8090/v1/certify/actuator/health", "optional": false, "status": "up", "httpStatus": 200, "latencyMs": 41 },
    { "name": "certify-mdoc", "url": "http://certify-mdoc:8090/v1/certify/actuator/health", "optional": true, "status": "not-running", "latencyMs": 3, "error": "ENOTFOUND" }
  ]
}
```

### `GET /api/catalog`

Returns every implementation in [`catalog/*.yaml`](../catalog), with the health and version the BFF last probed (every 15 s). Response: `CatalogEntry[]` (`CatalogEntrySchema`, [`catalog.ts`](../packages/shared/src/catalog.ts)).

```json
[
  {
    "id": "inji-verify",
    "role": "verifier",
    "displayName": "Inji Verify",
    "vendor": "inji",
    "adapter": "InjiVerifyServiceAdapter",
    "publicUrl": "https://verify.localhost:8443",
    "capabilities": {
      "formats": ["ldp_vc", "vc+sd-jwt"],
      "proofSuites": ["Ed25519Signature2020", "ES256", "RsaSignature2018"],
      "vpProfiles": ["oid4vp-draft23"],
      "queryLanguages": ["presentation_exchange"],
      "responseModes": ["direct_post"],
      "presentationFlows": ["cross-device-qr", "same-device-deeplink"],
      "deliveryChannels": ["qr", "deeplink"],
      "automation": "headless",
      "supportsTamper": false
    },
    "health": "up",
    "version": "0.18.2"
  }
]
```

To add an implementation, see [adding-an-implementation.md](adding-an-implementation.md).

### `GET /api/catalog/:id/credential-configurations`

Reads the issuer's metadata (for Certify: `/.well-known/openid-credential-issuer`) and summarizes each credential configuration. `404` if `:id` is not an issuer. `502` if the metadata cannot be read.

```json
[
  { "id": "FarmerCredentialSdJwt", "format": "vc+sd-jwt", "displayName": "Farmer Credential (SD-JWT)", "credentialType": "FarmerCredential", "proofSuites": ["ES256"] },
  { "id": "FarmerCredential", "format": "ldp_vc", "displayName": "Farmer Credential", "credentialType": "FarmerCredential", "proofSuites": ["Ed25519Signature2020"] }
]
```

### `GET /api/catalog/:id/credentials`

Returns the credentials a wallet already holds, newest first. A present-only run uses one of them (`heldCredentialId`). `listable` is `false` for wallets the playground cannot look into (Inji Wallet on a phone, Inji Web). `404` if `:id` is not a wallet.

```json
{
  "listable": true,
  "credentials": [
    {
      "id": "cred_3f1c…",
      "format": "vc+sd-jwt",
      "credentialConfigurationId": "FarmerCredentialSdJwt",
      "issuer": "https://certify.localhost:8443",
      "raw": "eyJhbGciOiJFUzI1NiIs…~WyJ…~",
      "receivedAt": "2026-11-02T09:20:11.004Z",
      "holderDid": "did:jwk:eyJrdHkiOiJFQyIs…"
    }
  ]
}
```

### `POST /api/compatibility/predict`

Takes the same body as `POST /api/runs` (a [`RunConfig`](#the-runconfig-body)) and predicts from the catalog capabilities whether the combination can work. Nothing is run.

```json
{
  "status": "unsupported",
  "reasons": [
    { "role": "verifier", "severity": "error", "message": "Inji Verify does not accept mso_mdoc presentations" }
  ]
}
```

`status` is `supported`, `unsupported` or `unknown`. `severity` is `info`, `warn` or `error`.

### `POST /api/runs`

Starts a run and returns at once. Follow the run with `GET /api/runs/:id` or the [realtime events](#5-playground-bff-realtime-events-socketio).

**Query.** `trigger=ui|cli|nightly` (default `ui`). History uses it to tell suite runs from runs started in the UI.

**Response.** `201 {"id": "<run id>"}`. `400` for an unknown implementation, an unsupported mode, or a tamper that cannot be applied (for example `T-NONCE-REPLAY` with no earlier run to replay).

#### The `RunConfig` body

`RunConfigSchema` in [`domain.ts`](../packages/shared/src/domain.ts).

| Field | Required | Description |
| --- | --- | --- |
| `mode` | yes | `full`, `issue-only` or `present-only` |
| `issuerId`, `walletId`, `verifierId` | yes | Catalog IDs, for example `inji-certify`, `mock-wallet`, `inji-verify`. All three are required in every mode; a role the mode does not use is ignored. |
| `format` | yes | A `CredentialFormat` |
| `credentialConfigurationId` | yes | From `GET /api/catalog/:id/credential-configurations` |
| `grantType` | yes | `pre-authorized_code` (headless) or `authorization_code` (Inji Web) |
| `presentationFlow` | yes | `cross-device-qr`, `same-device-deeplink` or `dc-api` |
| `expectedOutcome` | yes | What the verifier should answer. The verdict compares it with the observed outcome. Issue-only runs ignore it. |
| `tamper` | no | `{ "id": "T-SIG-FLIP" }` and so on. Mock wallet only, except `T-EXPIRED`, which the issuer applies. |
| `heldCredentialId` | no | Present-only: the credential to present, from `GET /api/catalog/:id/credentials` |
| `proofSuite`, `vpProfile`, `queryLanguage`, `responseMode`, `holderDidMethod`, `issuerProfile` | no | Override what the adapters choose by default |
| `labels` | no | Free key/value pairs, kept on the run and shown in history |

```json
{
  "mode": "full",
  "issuerId": "inji-certify",
  "walletId": "mock-wallet",
  "verifierId": "inji-verify",
  "format": "vc+sd-jwt",
  "credentialConfigurationId": "FarmerCredentialSdJwt",
  "grantType": "pre-authorized_code",
  "presentationFlow": "cross-device-qr",
  "expectedOutcome": "VALID"
}
```

### `GET /api/runs`

Run history, newest first, as `RunSummary[]` (`RunSummarySchema`, [`history.ts`](../packages/shared/src/history.ts)). Every query parameter is optional, and the filters combine with AND.

| Parameter | Matches |
| --- | --- |
| `issuer`, `wallet`, `verifier` | Catalog ID |
| `issuerVersion`, `walletVersion`, `verifierVersion` | Version recorded when the run was created |
| `format`, `mode`, `outcome`, `verdict`, `tamper` | Exact value |
| `from`, `to` | Creation time; a plain date (`2026-10-26`) covers the whole day |
| `limit` | 1–1000 |

```json
[
  {
    "id": "2e946c94-5b0e-4a51-9d0a-0f4a6f1c2b7e",
    "createdAt": "2026-11-02T09:20:05.311Z",
    "finishedAt": "2026-11-02T09:20:14.902Z",
    "state": "Reported",
    "mode": "full",
    "issuer": { "id": "inji-certify", "name": "Inji Certify", "version": "0.14.0" },
    "wallet": { "id": "mock-wallet", "name": "Mock wallet", "version": "0.1.0" },
    "verifier": { "id": "inji-verify", "name": "Inji Verify", "version": "0.18.2" },
    "format": "vc+sd-jwt",
    "credentialConfigurationId": "FarmerCredentialSdJwt",
    "expectedOutcome": "VALID",
    "observedOutcome": "VALID",
    "verdict": "PASS",
    "replayable": true
  }
]
```

### `GET /api/runs/:id`

The full run (`RunDetailSchema`, [`run.ts`](../packages/shared/src/run.ts)): config, state, each step with its status and evidence, module versions, the delivery instruction (QR code payload or deep link) while the run waits for a wallet, the verification result with every check the verifier reported, the tamper applied, and the extracted artifacts (offer, credential, `vp_token`, …).

```json
{
  "id": "2e946c94-…",
  "createdAt": "2026-11-02T09:20:05.311Z",
  "trigger": "ui",
  "config": { "mode": "full", "issuerId": "inji-certify", "…": "…" },
  "state": "Presenting",
  "correlation": "exact",
  "steps": [
    { "phase": "issuing", "step": "offer_prepared", "status": "done", "evidenceKind": "adapter", "durationMs": 212 },
    { "phase": "issuing", "step": "oid4vci.token", "status": "done", "evidenceKind": "tap", "exchangeId": "ex_…" },
    { "phase": "presenting", "step": "oid4vp.response", "status": "active" }
  ],
  "versions": [{ "implementationId": "inji-certify", "role": "issuer", "version": "0.14.0" }],
  "delivery": { "purpose": "presentation", "instruction": { "kind": "automated" } },
  "artifacts": [{ "id": "…", "kind": "credential", "format": "vc+sd-jwt", "raw": "eyJ…~" }]
}
```

`delivery.instruction.kind` is one of:

| `kind` | Fields | When |
| --- | --- | --- |
| `automated` | — | The mock wallet does the step itself |
| `qr` | `payload`, `bytes`, `qrVersion`, `hint`, `expiresAt?` | Inji Wallet on a phone scans `payload` |
| `deeplink` | `url`, `hint` | Same-device flow |
| `open-url` | `url`, `hint` | Inji Web: a person starts the download there |
| `dc-api` | `protocol: "openid4vp-v1-unsigned"`, `request`, `hint` | The page calls `navigator.credentials.get` and posts the result to [`/dc-api-response`](#post-apirunsiddc-api-response) |

### `GET /api/runs/:id/exchanges`

Every HTTP message the Protocol Tap recorded for the run, in `seq` order (`ExchangeSchema`, [`domain.ts`](../packages/shared/src/domain.ts)). With `?decode=true`, each exchange also has `decoded.request` and `decoded.response`: JWTs, SD-JWTs with their disclosures, JSON-LD credentials and form bodies, decoded.

```json
[
  {
    "id": "ex_7b2…",
    "runId": "2e946c94-…",
    "seq": 4,
    "ts": "2026-11-02T09:20:07.880Z",
    "component": "certify",
    "from": "mock-wallet",
    "method": "POST",
    "url": "https://certify.localhost:8443/v1/certify/oauth/token",
    "status": 200,
    "latencyMs": 38,
    "step": "oid4vci.token",
    "request": {
      "headers": { "content-type": "application/x-www-form-urlencoded" },
      "contentType": "application/x-www-form-urlencoded",
      "body": "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=Hk2p…9QxA"
    },
    "response": {
      "headers": { "content-type": "application/json" },
      "contentType": "application/json",
      "body": "{\"access_token\":\"eyJh…cwXQ\",\"token_type\":\"Bearer\",\"c_nonce\":\"…\"}"
    },
    "correlationKeys": ["sha256:9f3a…"],
    "outOfBand": false
  }
]
```

`step` is a protocol step such as `oid4vci.credential_offer`, `oid4vci.token`, `oid4vci.credential`, `oid4vp.request_object`, `oid4vp.response`, `verify.create_request`, `verify.status_poll`, `verify.result`, `did.resolution` or `unknown`. The full list is `ProtocolStep` in `domain.ts`. A tampered exchange has `tampered: { ruleId, diff, target, before, after }`.

### `GET /api/runs/:id/sequence`

A Mermaid sequence diagram of the run, built from its exchanges and steps. `?view=full` (default) shows everything; `?view=openid4vp` shows only the OpenID4VP messages.

```json
{ "view": "full", "source": "sequenceDiagram\n  participant I as Inji Certify\n  …", "model": { "…": "…" } }
```

### `GET /api/runs/:id/report`

The per-run pass/fail report (`RunReportSchema`, [`report.ts`](../packages/shared/src/report.ts)). `?format=json` (default) or `?format=md`. Both are sent as downloads (`content-disposition: attachment; filename="run-<id>.json|md"`).

```json
{
  "runId": "2e946c94-…",
  "mode": "full",
  "issuer": { "role": "issuer", "id": "inji-certify", "displayName": "Inji Certify", "version": "0.14.0" },
  "wallet": { "role": "wallet", "id": "mock-wallet", "displayName": "Mock wallet" },
  "verifier": { "role": "verifier", "id": "inji-verify", "displayName": "Inji Verify", "version": "0.18.2" },
  "format": "vc+sd-jwt",
  "credentialConfigurationId": "FarmerCredentialSdJwt",
  "proofType": "ES256",
  "grantType": "pre-authorized_code",
  "presentationFlow": "cross-device-qr",
  "expectedOutcome": "INVALID",
  "observedOutcome": "INVALID",
  "verdict": "PASS",
  "passed": true,
  "durationMs": 9591,
  "steps": [{ "phase": "issuing", "step": "offer_prepared", "status": "done", "evidenceKind": "adapter", "durationMs": 212 }],
  "correlation": "exact",
  "findings": [
    { "id": "…", "checkId": "VER-002", "stage": "verification", "severity": "PASS", "message": "…", "specRef": "…" }
  ],
  "tamper": { "id": "T-SIG-FLIP", "label": "Broken signature", "mechanism": "wallet-hook", "expectedOutcome": "INVALID", "observedOutcome": "INVALID", "detected": true },
  "inspectorUrl": "http://localhost:8100/runs/2e946c94-…"
}
```

`error` (`{ step, message, status?, body? }`) is present when a step failed.

### `POST /api/runs/:id/manual-evidence`

Confirms a step that only a person can see, for example "the credential is in Inji Wallet on the phone". Body: `{ "step": "credential_held", "note": "optional" }`. `204` on success, `409` if that step is not waiting for confirmation.

### `POST /api/runs/:id/dc-api-response`

Hands the result of `navigator.credentials.get` to a run that uses the Digital Credentials API. `202` on success, `409` if the run is not waiting for one.

```json
{
  "origin": "http://localhost:8100",
  "userAgent": "Mozilla/5.0 …",
  "protocol": "openid4vp-v1-unsigned",
  "data": { "vp_token": { "cred1": ["eyJ…~…"] } }
}
```

If the browser threw an error, send `error: { "name": "NotAllowedError", "message": "…" }` instead of `data`.

### `POST /api/runs/:id/cancel`

Stops the run. The run ends in `Cancelled`. `202`.

### `GET /api/matrix` and `/api/matrix.md`

The interoperability matrix: the latest verdict for each issuer × wallet × verifier × format, versions included. Negative tests (tampers and runs that expect Invalid or Expired) are left out unless `?includeNegative=true`. `/api/matrix.md` returns the same data as a Markdown file (`interop-matrix.md`) with a link to each run.

```json
{ "generatedAt": "2026-11-02T09:30:00.000Z", "includeNegative": false, "formats": ["ldp_vc", "vc+sd-jwt"], "runCount": 27, "rows": [ "…" ] }
```

### `GET /api/exchanges/:id`

One exchange, as in [`/api/runs/:id/exchanges`](#get-apirunsidexchanges). `404` if unknown.

### `POST /api/tap/correlate`

Links correlation keys to a run, so the tap assigns traffic from a flow the orchestrator did not start (for example a script) to that run. Body: `{ "runId": "…", "keys": ["<offer id>", "<transaction id>"] }`. Response: `{ "registered": 2 }`.

### `GET /metrics`

Prometheus text format (`text/plain; version=0.0.4`), computed over every saved run that has finished:

| Metric | Type | Labels |
| --- | --- | --- |
| `interop_runs` | gauge | `issuer`, `issuer_version`, `wallet`, `wallet_version`, `verifier`, `verifier_version`, `format`, `mode`, `verdict`, `negative` |
| `interop_runs_passed` | gauge | The combination labels and `negative` |
| `interop_run_duration_seconds_sum` / `_count` | gauge | The combination labels and `negative` |
| `interop_step_duration_seconds_sum` / `_count` | gauge | `phase`, `step`, `status`, `format` |
| `interop_exchange_latency_seconds_sum` / `_count` | gauge | `component`, `step` |
| `interop_exchange_errors` | gauge | `component`, `step`, `status` |
| `interop_last_run_timestamp_seconds` | gauge | — |

## 5. Playground BFF realtime events (socket.io)

Connect with socket.io to the BFF (path `/socket.io`), then join a run's room:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:8101');
socket.emit('run.subscribe', { runId });
socket.on('run.step', (e) => console.log(e.step.step, e.step.status));
socket.on('run.completed', (e) => console.log(e.verdict));
// later: socket.emit('run.unsubscribe', { runId });
```

Each event is emitted under its `type`, and the payload contains `type` and `runId`. Schemas: `RunEventSchema` in [`events.ts`](../packages/shared/src/events.ts).

| Event | Payload | Sent when |
| --- | --- | --- |
| `run.status` | `state`, `at` | The run machine changes state |
| `run.step` | `step` (a `RunStep`) | A step starts, finishes or fails |
| `run.delivery` | `purpose` (`issuance`/`presentation`), `instruction` | A QR code, link or DC API request is ready for the wallet |
| `run.exchange` | `exchange`: an exchange without bodies, plus `requestBytes`, `responseBytes` | The tap records a message for the run. Fetch the bodies with `GET /api/exchanges/:id`. |
| `run.artifact` | `artifact` (`kind`, `format`, `raw`, `decoded`) | An offer, credential, `vp_token` or other artifact is extracted |
| `run.check` | `finding` (`checkId`, `stage`, `severity`, `message`, `specRef`) | A compliance check produces a finding |
| `run.result` | `outcome`, `verifierRaw`, `stages`, `secondOpinion` | The verifier's answer is in |
| `run.completed` | `verdict`, `reportUrl` | The report is ready |
| `catalog.health` | `implementationId`, `status`, `version` | Sent to every client when a module's health changes |

## 6. Protocol Tap

The tap is not an API with endpoints of its own. It is a recording reverse proxy in front of each upstream. It forwards each request unchanged and records the exchange for the inspector. Details: [`apps/playground-bff/PROTOCOL_TAP.md`](../apps/playground-bff/PROTOCOL_TAP.md).

| Listener | Upstream (env var) | Public address |
| --- | --- | --- |
| `:3002` certify | `TAP_UPSTREAM_CERTIFY` → `http://certify:8090` | `https://certify.localhost:8443` |
| `:3003` verify | `TAP_UPSTREAM_VERIFY` → `http://verify-service:8080` | `https://verify.localhost:8443` |
| `:3004` mock-verifier | `TAP_UPSTREAM_MOCK_VERIFIER` | `https://verify.localhost:8443/mock-verifier` |
| `:3005` certify-mdoc | `TAP_UPSTREAM_CERTIFY_MDOC` | `https://certify.localhost:8443/mdoc` |
| `:3006` inji-verify-collab | `TAP_UPSTREAM_VERIFY_COLLAB` | `https://injiverify.collab.mosip.net` |

A listener whose upstream is unset is off.

**Request headers the tap reads:**

| Header | Set by | Purpose |
| --- | --- | --- |
| `x-playground-run-id` | BFF adapters | Assigns the exchange to that run exactly. Stripped before forwarding. |
| `x-playground-caller` | BFF adapters | Names the caller in the inspector. Stripped before forwarding. |
| `Host`, `X-Forwarded-Proto`, `X-Original-URI` | Gateway (nginx) | Records the public URL the wallet used, not the internal one |

Traffic without a run header is assigned to a run by correlation keys (offer ID, pre-authorized code, access token, `c_nonce`, Verify `requestId`/`transactionId`, `state`, `nonce`), then by adjacency, then by an armed time window. The window is used for Inji Web, and a run assigned that way has `correlation: "heuristic"`.

### Masking

Stored and served copies mask the `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and `dpop` headers, and the `access_token`, `refresh_token`, `pre-authorized_code`, `tx_code`, `code`, `client_secret` and `id_token` fields. Each masked value keeps its first and last four characters (`eyJh…cwXQ`). `TAP_REVEAL_SECRETS=true` turns masking off, for local debugging only.

## 7. Mock wallet API

A headless holder ([`apps/mock-wallet`](../apps/mock-wallet)) for CI, tamper runs and repeatable demos. Base URL: `http://localhost:8104` (`http://mock-wallet:7003` on the Compose network). Schemas: [`mockWallet.ts`](../packages/shared/src/mockWallet.ts). Credentials are kept in memory and are lost when the container restarts.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "up", "holderDid": "did:jwk:…", "credentials": 3 }` |
| `GET` | `/credentials` | Every held credential (`HeldCredential[]`) |
| `DELETE` | `/credentials/:id` | Forget one. `204`, or `404` |
| `POST` | `/offers/accept` | Run OpenID4VCI on a credential offer and store the result |
| `POST` | `/presentations/respond` | Run OpenID4VP on an authorization request, with an optional tamper |

### `POST /offers/accept`

The wallet resolves the offer, reads the issuer and authorization server metadata, exchanges the pre-authorized code for a token, signs a proof JWT with its holder key, and requests the credential. Every call goes to the issuer's public URL, so it passes through the tap.

```json
// request
{ "offerUri": "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fcertify.localhost%3A8443%2Fv1%2Fcertify%2Fcredential-offer-data%2F4c1e…", "txCode": "optional" }

// 201 response (HeldCredential)
{
  "id": "cred_3f1c…",
  "format": "vc+sd-jwt",
  "credentialConfigurationId": "FarmerCredentialSdJwt",
  "issuer": "https://certify.localhost:8443",
  "raw": "eyJhbGciOiJFUzI1NiIs…~WyJ…~",
  "receivedAt": "2026-11-02T09:20:08.415Z",
  "holderDid": "did:jwk:eyJrdHkiOiJFQyIs…"
}
```

### `POST /presentations/respond`

The wallet parses the `openid4vp://` request (by reference or by value) and fetches the request object. It then checks the request object's signature against the verifier's `did:web`; if the check fails, it adds a warning and continues. It picks a matching credential, builds the `vp_token` (Presentation Exchange with `presentation_submission`, or DCQL), and posts it to `response_uri`.

| Field | Description |
| --- | --- |
| `authorizationRequestUri` | Required. `openid4vp://authorize?client_id=…&request_uri=…` |
| `credentialId` | Present this credential. Default: the newest one matching the request. |
| `tamper` | `T-SIG-FLIP`, `T-CLAIM-EDIT`, `T-WRONG-TYPE` or `T-NONCE-REPLAY` |
| `replay` | For `T-NONCE-REPLAY`: `{ "variant": "resubmit-vp", "vpToken": "…", "presentationSubmission": "…" }` or `{ "variant": "stale-nonce", "nonce": "…" }` |

```json
// 200 response
{
  "credentialId": "cred_3f1c…",
  "responseUri": "https://verify.localhost:8443/v1/verify/vp-submission/direct-post",
  "status": 200,
  "body": "{}",
  "tamper": "T-SIG-FLIP",
  "tamperEvidence": { "target": "credential", "summary": "Flipped one character of the issuer signature", "…": "…" },
  "warnings": []
}
```

`status` is the HTTP status the verifier answered the `direct_post` with. A `4xx` there is a verifier refusal, not a wallet error.

**Errors** (`MockWalletErrorSchema`): `{ "message", "statusCode", "step", "upstreamStatus?", "upstreamBody?" }`. `step` names the protocol step that failed, for example `oid4vci.token`.

**Configuration.** `PORT` (default 7003). `WALLET_ROUTES="https://public.origin=http://tap:3006,…"` sends requests for a public origin to another origin with the same path. The Collab lanes use it so that the wallet's traffic goes through the tap.

## 8. Mock verifier API

A non-Inji OpenID4VP verifier ([`apps/mock-verifier`](../apps/mock-verifier)) that reports every check it makes. It supports draft 23 with Presentation Exchange and `direct_post`, and DCQL over the Digital Credentials API. It checks `vc+sd-jwt`, `dc+sd-jwt` and `mso_mdoc`, not `ldp_vc`. All paths are under `BASE_PATH` (default `/mock-verifier`). Base URL: `http://localhost:8105/mock-verifier`. Schemas: [`mockVerifier.ts`](../packages/shared/src/mockVerifier.ts).

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | BFF | `{ "status": "up", "clientId": "did:web:…" }` |
| `GET` | `/did.json` | Wallet | The verifier's `did:web` document |
| `POST` | `/api/requests` | BFF | Create a presentation request |
| `GET` | `/api/requests/:requestId/status?wait=<ms>` | BFF | Long poll (at most 55 s): `{ "status": "ACTIVE" \| "VP_SUBMITTED" \| "EXPIRED" }` |
| `GET` | `/api/results/:transactionId` | BFF | Outcome and every check. `404` until a presentation is submitted |
| `POST` | `/api/verify-credential` | BFF | Check a credential on its own (second opinion) |
| `POST` | `/api/dc-api/:requestId` | BFF | Verify a Digital Credentials API response |
| `GET`/`POST` | `/oid4vp/request/:requestId` | Wallet | Signed request object (`application/oauth-authz-req+jwt`) |
| `POST` | `/oid4vp/response/:requestId` | Wallet | `direct_post` (form: `vp_token`, `presentation_submission`, `state`) |

### `POST /api/requests`

```json
// request: direct_post with Presentation Exchange
{
  "transactionId": "txn_2e946c94…",
  "responseMode": "direct_post",
  "presentationDefinition": {
    "id": "pd-farmer",
    "input_descriptors": [{ "id": "farmer", "format": { "vc+sd-jwt": {} }, "constraints": { "fields": [{ "path": ["$.vct"], "filter": { "const": "FarmerCredential" } }] } }]
  }
}

// 201 response
{
  "requestId": "req_5d0e…",
  "transactionId": "txn_2e946c94…",
  "authorizationRequestUri": "openid4vp://authorize?client_id=did%3Aweb%3Averify.localhost%253A8443%3Amock-verifier&request_uri=https%3A%2F%2Fverify.localhost%3A8443%2Fmock-verifier%2Foid4vp%2Frequest%2Freq_5d0e…",
  "requestUri": "https://verify.localhost:8443/mock-verifier/oid4vp/request/req_5d0e…",
  "clientId": "did:web:verify.localhost%3A8443:mock-verifier",
  "expiresAt": "2026-11-02T09:25:05.000Z"
}
```

With `"responseMode": "dc_api"`, send a `dcqlQuery` instead of a `presentationDefinition`. The response then has `dcApiRequest: { "protocol": "openid4vp-v1-unsigned", "data": { … } }` in place of the URIs.

### Result (`GET /api/results/:transactionId`, `POST /api/verify-credential`)

```json
{
  "transactionId": "txn_2e946c94…",
  "outcome": "INVALID",
  "format": "vc+sd-jwt",
  "credentialType": "FarmerCredential",
  "issuer": "https://certify.localhost:8443",
  "verifiedAt": "2026-11-02T09:20:12.100Z",
  "stages": [
    { "id": "response-shape", "label": "Response shape", "status": "pass", "message": "vp_token and presentation_submission present" },
    { "id": "state", "label": "State", "status": "pass", "message": "state matches the request" },
    { "id": "issuer-signature", "label": "Issuer signature", "status": "fail", "message": "signature verification failed" },
    { "id": "holder-binding", "label": "Holder binding", "status": "pass", "message": "Key-binding JWT signed by the holder key (cnf.jwk), bound to this request's nonce and client_id" }
  ]
}
```

`POST /api/verify-credential` takes `{ "credential": "<raw>", "format": "vc+sd-jwt" }` and checks the credential alone, with no presentation and no holder binding.

**Errors.** Management endpoints return `{ "message", "statusCode" }`. Wallet-facing endpoints return OAuth errors: `{ "error": "invalid_request" | "invalid_request_uri", "error_description": "…" }`. A presentation that cannot be used at all, for example a second submission or an expired request, is refused at `direct_post` with `400`.

**Configuration.** `PORT` (7004), `BASE_PATH`, `PUBLIC_URL`, `CLIENT_ID` (defaults to the `did:web` of `PUBLIC_URL`), `TRUSTED_ISSUERS` (comma-separated), `TRUSTED_MDOC_CERTS` (PEM files), `REQUEST_TTL_MS` (300 000).

## 9. External APIs the playground uses

These calls are made by the BFF's adapters and the mock wallet. They are listed here so that what the playground relies on is in one place. The BFF's own calls go through the Protocol Tap, so they appear in the inspector.

### Inji Certify 0.14.0 (issuer)

Base: `https://certify.localhost:8443` (public, through the tap) or `http://certify:8090` (internal).

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/certify/.well-known/openid-credential-issuer` | BFF, wallets | Issuer metadata: credential configurations, endpoints |
| `GET` | `/v1/certify/.well-known/oauth-authorization-server`, `/v1/certify/.well-known/jwks.json` | Wallets | Authorization server metadata and keys |
| `POST` | `/v1/certify/pre-authorized-data` | BFF | Create a pre-authorized offer for mock claims |
| `GET` | `/v1/certify/credential-offer-data/{id}` | Wallets | The offer, by reference |
| `POST` | `/v1/certify/oauth/token` | Wallets | Pre-authorized code → access token and `c_nonce` |
| `POST` | `/v1/certify/issuance/credential` | Wallets | Bearer token + proof JWT → credential |
| `GET` | `/v1/certify/actuator/health` | BFF | Health |

```http
POST /v1/certify/pre-authorized-data
Content-Type: application/json

{ "credential_configuration_id": "FarmerCredentialSdJwt", "claims": { "fullName": "Ramesh Kumar", "mobileNumber": "+91 90000 00042", "farmerID": "FRM-2026-004217", "…": "…" } }

→ 200 { "credential_offer_uri": "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fcertify.localhost%3A8443%2Fv1%2Fcertify%2Fcredential-offer-data%2F4c1e…" }
```

```http
POST /v1/certify/issuance/credential
Authorization: Bearer <access_token>
Content-Type: application/json

{ "format": "vc+sd-jwt", "vct": "FarmerCredential", "proof": { "proof_type": "jwt", "jwt": "<openid4vci-proof+jwt>" } }
```

For `ldp_vc`, the body has `credential_definition` (`@context`, `type`) instead of `vct`. For `mso_mdoc`, it has `doctype`, and the proof header carries the holder `jwk` instead of a `kid`.

The mDoc issuer is a second Certify in mock mDoc mode, at `https://certify.localhost:8443/mdoc/…` (`make up-mdoc`).

### Inji Verify 0.18.2 (verifier, Presentation Exchange)

Base: `https://verify.localhost:8443` or `http://verify-service:8080`.

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/verify/vp-request` | BFF | `{ clientId, transactionId, presentationDefinition }` → `{ requestId, transactionId, requestUri, … }` |
| `GET` | `/v1/verify/vp-request/{requestId}/status` | BFF | Long poll (up to 55 s): `ACTIVE`, `VP_SUBMITTED`, `EXPIRED` |
| `GET` | `/v1/verify/vp-request/{requestId}` | Wallet | Request object |
| `POST` | `/v1/verify/vp-submission/direct-post` | Wallet | `vp_token`, `presentation_submission`, `state` |
| `GET` | `/v1/verify/vp-result/{transactionId}` | BFF | `SUCCESS` → `VALID`, `INVALID` → `INVALID`, `EXPIRED` → `EXPIRED` |
| `POST` | `/v1/verify/vc-verification` | BFF | A credential alone (second opinion). `content-type`: `application/vc+ld+json` or `application/vc+sd-jwt` |
| `GET` | `/v1/verify/actuator/health` | BFF | Health |

The BFF sets `transactionId` to `txn_<run id without dashes>`, so the tap can correlate the verifier's traffic with the run.

### Inji Verify 1.0 on MOSIP Collab (verifier, DCQL)

Base: `https://injiverify.collab.mosip.net`, reached through tap listener `:3006`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/verify/v2/vp-request` | `{ clientId, transactionId, dcqlQuery }` → `{ requestId, transactionId, requestUri \| authorizationDetails }` |
| `GET` | `/v1/verify/vp-request/{requestId}/status` | Long poll, as in 0.18 |
| `POST` | `/v1/verify/v2/vp-results/{transactionId}` | `{ "skipStatusChecks": false, "includeClaims": false }` → a result for each credential, with every check |
| `POST` | `/v1/verify/vc-verification` | Credential alone |
| `GET` | `/v1/verify/did.json` | Verifier DID document (used as the health check) |

Differences from 0.18 that callers must handle: the `client_id` has the `decentralized_identifier:` prefix, the request object is signed, the `vp_token` is keyed by the DCQL credential query ID, and there is no `presentation_submission`. See [the README](../README.md#mosip-collab-sandbox).

### Mimoto, eSignet and Inji Web (wallet)

The playground does not call these APIs itself. A person starts the download in Inji Web (`<INJI_WEB_URL>/issuers`), Mimoto runs the authorization-code flow with eSignet, and Certify's traffic passes through the tap. The run is assigned to that traffic with the armed window. Setup and the open `invalid_client` issue: [`injistack/README.md`](../injistack/README.md#current-local-web-wallet-limitation). The eSignet Postman collection is in [`injistack/postman`](../injistack/postman).

### Hovi and Animo playgrounds (third-party issuers)

| Service | Call | Body |
| --- | --- | --- |
| Hovi | `POST <supabase>/functions/v1/issue-credential` with `apikey` and `Authorization: Bearer <anon key>` | `{ "credentialType": "<config id>", "sessionId": "<uuid>", "ecosystem": "eudiw" }` → `{ "request_uri": "openid-credential-offer://…" }` |
| Animo | `GET <publicUrl>/api/issuers` | Lists issuers. The adapter offers every credential in `dc+sd-jwt` or `mso_mdoc`, PIDs first. The list has no `vct` or doctype, so types come from the adapter's `ANIMO_KNOWN_TYPES` (read from each issuer's `/.well-known/openid-credential-issuer`). The Bundesdruckerei issuer was removed by November 2026; the EUDI PID is now under Utopia Government. |
| Animo | `POST <publicUrl>/api/offers/create` | `{ "credentialSupportedIds": ["…"], "authorization": "none", "deferBy": "none", "requireDpop": false, "requireWalletAttestation": false, "requireKeyAttestation": false }` → `{ "credentialOffer": "openid-credential-offer://…", "issuanceSession": { … } }` |

Both are used for issue-only runs to a phone wallet; the run's issuing steps end once a person confirms the credential arrived. Animo credentials with a known type can also be presented: with Paradym as wallet and Collab's Inji Verify as verifier the run continues to a verdict.

### Obsrv (telemetry)

When `OBSRV_INGEST_URL` is set, each finished run is posted there as one event in the Sunbird telemetry envelope, with `OBSRV_AUTHORIZATION` as the `Authorization` header. Events are also written as JSONL files to `TELEMETRY_DIR` (default `$DATA_DIR/telemetry`).

## 10. Example use cases

The examples need the running stack (`make up`), `curl` and `jq`.

### A. Run a full SD-JWT cycle and get the report

```sh
BFF=http://localhost:8101

# 1. Is everything up?
curl -s $BFF/api/health | jq '.status, [.services[] | {name, status}]'

# 2. What can Certify issue?
curl -s $BFF/api/catalog/inji-certify/credential-configurations | jq '.[] | {id, format}'

# 3. Start the run
RUN=$(curl -s -X POST $BFF/api/runs -H 'content-type: application/json' -d '{
  "mode": "full",
  "issuerId": "inji-certify", "walletId": "mock-wallet", "verifierId": "inji-verify",
  "format": "vc+sd-jwt", "credentialConfigurationId": "FarmerCredentialSdJwt",
  "grantType": "pre-authorized_code", "presentationFlow": "cross-device-qr",
  "expectedOutcome": "VALID"
}' | jq -r .id)

# 4. Wait for a terminal state
until curl -s $BFF/api/runs/$RUN | jq -e '.state | IN("Reported","Aborted","Cancelled")' >/dev/null; do sleep 2; done

# 5. Verdict, and the report as Markdown
curl -s $BFF/api/runs/$RUN | jq '{state, observedOutcome, verdict}'
curl -s "$BFF/api/runs/$RUN/report?format=md" -o run-$RUN.md
```

### B. Check that a verifier rejects a tampered presentation

Use the same body with a tamper and the outcome it should cause:

```sh
curl -s -X POST $BFF/api/runs -H 'content-type: application/json' -d '{
  "mode": "full",
  "issuerId": "inji-certify", "walletId": "mock-wallet", "verifierId": "mock-verifier",
  "format": "vc+sd-jwt", "credentialConfigurationId": "FarmerCredentialSdJwt",
  "grantType": "pre-authorized_code", "presentationFlow": "cross-device-qr",
  "tamper": { "id": "T-SIG-FLIP" }, "expectedOutcome": "INVALID"
}'
```

The report's `tamper.detected` is `true` when the verifier did not accept it. For a Valid-but-expired run, use `"tamper": { "id": "T-EXPIRED" }` with `"expectedOutcome": "EXPIRED"`.

### C. Test only the verifier, with a credential the wallet already holds

```sh
# Pick a credential from an earlier run
CRED=$(curl -s $BFF/api/catalog/mock-wallet/credentials | jq -r '.credentials[0].id')

curl -s -X POST $BFF/api/runs -H 'content-type: application/json' -d "{
  \"mode\": \"present-only\", \"heldCredentialId\": \"$CRED\",
  \"issuerId\": \"inji-certify\", \"walletId\": \"mock-wallet\", \"verifierId\": \"inji-verify\",
  \"format\": \"vc+sd-jwt\", \"credentialConfigurationId\": \"FarmerCredentialSdJwt\",
  \"grantType\": \"pre-authorized_code\", \"presentationFlow\": \"cross-device-qr\",
  \"expectedOutcome\": \"VALID\"
}"
```

### D. Look at every protocol message of a run

```sh
curl -s "$BFF/api/runs/$RUN/exchanges?decode=true" \
  | jq '.[] | {seq, step, method, url, status, decoded: .decoded.response}'

# The sequence diagram, ready to paste into a Markdown file
curl -s "$BFF/api/runs/$RUN/sequence?view=openid4vp" | jq -r .source
```

### E. Export history and the interoperability matrix

```sh
# Failed SD-JWT runs against Inji Verify 0.18.2 since 26 October
curl -s "$BFF/api/runs?verifier=inji-verify&verifierVersion=0.18.2&format=vc%2Bsd-jwt&verdict=FAIL&from=2026-10-26" | jq length

# Matrix as a Markdown file, negative tests included
curl -s "$BFF/api/matrix.md?includeNegative=true" -o interop-matrix.md
```

### F. Run the whole suite from CI

`interop-cli` uses the API above: it posts a run for each lane in a matrix file, waits for each one, and writes the results.

```sh
pnpm install
make interop                                   # matrices/nightly.yaml, results in out/interop/
make interop MATRIX=matrices/collab.yaml       # only the MOSIP Collab lanes
```

See [`packages/interop-cli/README.md`](../packages/interop-cli/README.md).

### G. Drive the mock wallet directly

Without the orchestrator, for example to debug an issuer. The claims are the mock Farmer claims the BFF sends (`MOCK_FARMER_CLAIMS` in [`inji-certify.ts`](../apps/playground-bff/src/adapters/inji-certify.ts)):

```sh
CLAIMS='{"fullName":"Ramesh Kumar","mobileNumber":"+91 90000 00042","dateOfBirth":"1984-03-12","gender":"Male","state":"Karnataka","district":"Bengaluru Rural","villageOrTown":"Hoskote","postalCode":"562114","landArea":"2.5 acres","landOwnershipType":"Owner","primaryCropType":"Ragi","secondaryCropType":"Tomato","farmerID":"FRM-2026-004217"}'

OFFER=$(curl -s -X POST http://localhost:8090/v1/certify/pre-authorized-data -H 'content-type: application/json' \
  -d "{\"credential_configuration_id\":\"FarmerCredentialSdJwt\",\"claims\":$CLAIMS}" | jq -r .credential_offer_uri)

curl -s -X POST http://localhost:8104/offers/accept -H 'content-type: application/json' \
  -d "{\"offerUri\": \"$OFFER\"}" | jq '{id, format, issuer}'
```

The wallet's calls to Certify still go through the tap. To show them under a run in the inspector, link the offer ID to that run with [`POST /api/tap/correlate`](#post-apitapcorrelate).

### H. Follow a run live from a script

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:8101');
socket.emit('run.subscribe', { runId: process.argv[2] });
socket.on('run.exchange', ({ exchange }) => console.log(exchange.seq, exchange.step, exchange.status));
socket.on('run.completed', ({ verdict, reportUrl }) => { console.log(verdict, reportUrl); socket.close(); });
```
