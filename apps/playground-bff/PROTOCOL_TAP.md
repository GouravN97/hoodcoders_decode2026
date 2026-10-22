# Protocol Tap — Implementation Notes (Shive)

> **Branch:** `feature/shive-protocol-tap`  
> **Role:** Person D — Protocols & Message Capture

---

## What was implemented

### Overview

The Protocol Tap is the recording layer that makes the **Protocol Inspector** panel work. Without it, the wallet talks directly to Certify and Verify — the playground never sees those messages. The tap sits transparently in between, forwards every request unchanged, and saves the full exchange (request + response headers, bodies, latency) to an in-memory store.

```
Wallet / Browser
      │
      ▼
 Protocol Tap  ──── captures Exchange ────▶ ExchangeStore
      │                                          │
      ▼                                          ▼
 Real Certify / Verify             GET /api/runs/:id/exchanges
                                          │
                                          ▼
                                  Protocol Inspector UI
```

---

## Files added / modified

### `apps/playground-bff/src/tap/classifier.ts` *(new)*

Maps HTTP method + URL path to a `ProtocolStep` label so every captured exchange is tagged with what protocol step it represents.

| URL pattern | ProtocolStep |
|---|---|
| `GET /.well-known/openid-credential-issuer` | `oid4vci.issuer_metadata` |
| `POST /token` | `oid4vci.token` |
| `POST /credential` | `oid4vci.credential` |
| `POST /vp-request` | `verify.create_request` |
| `POST /response` | `oid4vp.response` |
| `GET /did.json` | `did.resolution` |
| *(everything else)* | `unknown` |

---

### `apps/playground-bff/src/store/exchange-store.ts` *(new)*

In-memory store for `Exchange` records (matching the schema in `packages/shared/src/domain.ts`).

- Keyed two ways: `exchangeId → Exchange` and `runId → Exchange[]`
- Global monotonic `seq` counter so exchanges are always in capture order
- `backfillRunId()` — when a `runId` is registered after an exchange is already captured, it retroactively assigns the run to those exchanges

---

### `apps/playground-bff/src/tap/correlator.ts` *(new)*

Links captured exchanges to the run that produced them by following the **one-time code → access token** chain.

**How correlation works:**
1. BFF creates a credential offer → registers `pre_authorized_code → runId`
2. Proxy captures the wallet's token request → extracts `pre_authorized_code` → finds `runId`
3. Token response contains `access_token` → registered → future credential requests also linked
4. VP side: `nonce` / `state` in the presentation request → linked to the same run

Keys are extracted from URL query params, `application/x-www-form-urlencoded` bodies, JSON bodies, and token response bodies.

---

### `apps/playground-bff/src/tap/proxy.ts` *(new)*

The core of the tap — a transparent HTTP reverse proxy using Node's built-in `node:http`.

For every incoming request:
1. Reads the full request body
2. Forwards to the real upstream (Certify or Verify) via `fetch()`
3. Reads the full response body
4. Builds an `Exchange` record, runs the classifier and correlator
5. Saves to `ExchangeStore`
6. Returns the upstream response to the original caller **byte-for-byte unchanged**

Configured via env vars:
| Env var | Default | Purpose |
|---|---|---|
| `TAP_UPSTREAM_CERTIFY` | *(unset — tap disabled)* | Full URL of the real Certify service |
| `TAP_UPSTREAM_VERIFY` | *(unset — tap disabled)* | Full URL of the real Inji Verify service |
| `TAP_CERTIFY_PORT` | `3002` | Port the Certify tap listens on |
| `TAP_VERIFY_PORT` | `3003` | Port the Verify tap listens on |

---

### `apps/playground-bff/src/decoder/payload-decoder.ts` *(new)*

BFF-side payload decoders — ported from `apps/playground-ui/src/lib/decode/index.ts` to run in Node.js (uses `Buffer` instead of `TextDecoder`/`atob`). No external npm dependencies.

Handles:
- **JWT** — base64url-decodes header + payload, returns `{ header, payload, signature }`
- **SD-JWT** — splits on `~`, decodes issuer JWT, unpacks each disclosure (`[salt, name, value]`), optionally decodes KB-JWT
- **JSON-LD VC** — detects `@context` + `proof` + `VerifiableCredential` type → flags `isLdpVc: true`
- **Form-encoded** — `URLSearchParams` parse (token endpoint bodies)
- **Plain text / empty** — fallback

---

### `apps/playground-bff/src/main.ts` *(modified)*

Rewrote the placeholder BFF to wire up the new pieces and add three new routes:

| Route | Description |
|---|---|
| `GET /api/health` | *(unchanged)* — health check for all Inji services |
| `GET /api/runs/:id/exchanges` | Returns all captured `Exchange[]` for a run in `seq` order |
| `GET /api/runs/:id/exchanges?decode=true` | Same, with decoded JWT/SD-JWT/JSON-LD payloads attached |
| `GET /api/exchanges/:id` | Single exchange by ID |
| `POST /api/tap/correlate` | Register a `{ runId, keys[] }` mapping (called when BFF creates an offer) |
| `POST /api/runs` | Stub — creates a run ID for local testing |

On startup, the BFF now also starts the Certify and Verify tap proxies (if their upstream env vars are set).

---

## How to run locally (standalone, no Docker needed)

```sh
# From repo root
pnpm install

# Start the BFF with tap pointed at a real or test upstream
cd apps/playground-bff
TAP_UPSTREAM_CERTIFY=http://localhost:8090 node --disable-warning=ExperimentalWarning src/main.ts
```

BFF will start on `:3001`, Certify tap on `:3002`.  
All wallet traffic should then go to `:3002` instead of directly to Certify's `:8090`.

### Quick smoke test
```sh
# Create a run and register a correlation key
curl -s -X POST http://localhost:3001/api/runs
# → { "id": "<runId>" }

curl -s -X POST http://localhost:3001/api/tap/correlate \
  -H "Content-Type: application/json" \
  -d '{"runId":"<runId>","keys":["<pre_authorized_code>"]}'

# Fire a request through the tap (simulates the wallet hitting Certify's token endpoint)
curl -s -X POST http://localhost:3002/v1/certify/oauth/token \
  -d "grant_type=...&pre-authorized_code=<pre_authorized_code>"

# Fetch captured exchanges
curl -s "http://localhost:3001/api/runs/<runId>/exchanges" | jq .
curl -s "http://localhost:3001/api/runs/<runId>/exchanges?decode=true" | jq .
```

---

## How to wire into Docker Compose (Phase 4 — next)

Add the following to `injistack/docker-compose.yml`:

```yaml
# Add to the playground-bff service's environment:
environment:
  TAP_UPSTREAM_CERTIFY: http://certify:8090
  TAP_UPSTREAM_VERIFY: http://verify-service:8080
  TAP_CERTIFY_PORT: "3002"
  TAP_VERIFY_PORT: "3003"

# Expose tap ports:
ports:
  - "8102:3002"   # Certify tap (replaces direct :8090 access)
  - "8103:3003"   # Verify tap
```

Then update `certify-nginx` to proxy to the tap instead of directly to Certify.

---

## What's still to do (remaining tasks)

- [ ] **Phase 4:** Wire tap into `docker-compose.yml` and update nginx routing
- [ ] **Phase 5:** Expired credential config in `injistack/certify/` for `EXPIRED` verdict demo
- [ ] **Mimoto 401 fix:** Regenerate `oidckeystore.p12` and register with eSignet to unblock Inji Web flow
- [ ] **SD-JWT end-to-end (Task 6):** Verify proxy captures and decodes `vc+sd-jwt` flows correctly

---

## No new npm dependencies

Everything uses Node.js built-ins only:
- `node:http` — proxy server
- `node:crypto` — `randomUUID()`
- `Buffer` — base64url decoding in the payload decoder
- Native `fetch` — forwarding requests to upstreams (Node 18+)
