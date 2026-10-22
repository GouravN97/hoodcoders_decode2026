# Protocol Tap

First built by Shive (Person D — Protocols & Message Capture) on `feature/shive-protocol-tap`; now wired into Docker Compose, correlating by bearer token and masking secrets.

The Protocol Tap is the recording layer behind the **Protocol Inspector**. Wallets talk to Certify and Verify directly, so the playground would normally see none of those messages. The tap is a reverse proxy in the BFF process that every protocol request passes through: it forwards the request unchanged, records the exchange (headers, bodies, status, latency), works out which run it belongs to, and masks secrets in the stored copy.

```
wallet / phone / Mimoto / BFF
          │
          ▼
certify-nginx  (https://certify.localhost:8443, https://verify.localhost:8443)
          │  Host, X-Forwarded-Proto, X-Original-URI = the public URL the caller used
          ▼
Protocol Tap  :3002 → certify:8090      classify → extract keys → correlate → redact → ExchangeStore
              :3003 → verify-service:8080                                                  │
                                                       GET /api/runs/:id/exchanges, run.exchange events
```

The gateway lists the services themselves as `backup` upstreams, so Certify and Verify stay reachable when the BFF is down.

## Files

| File | Role |
| --- | --- |
| `src/tap/proxy.ts` | The proxy. Buffers both bodies (stored copies capped at 2 MiB), forwards with `redirect: 'manual'`, drops `content-encoding` / `content-length` from the forwarded response because `fetch()` has already decoded the body, strips the BFF's `x-playground-*` headers, records the exchange after answering |
| `src/tap/classifier.ts` | Method + public path → `ProtocolStep` (Certify and Inji Verify 0.18 paths), and the artifacts an exchange carries (`offer`, `credential`, `auth_request`, `presentation_definition`, `vp_token`, `presentation_submission`, `verification_result`) |
| `src/tap/correlator.ts` | Correlation keys, the key → run index and the armed window for wallet-initiated flows |
| `src/tap/redact.ts` | Masks secrets in what is stored and served |
| `src/store/exchange-store.ts` | In-memory exchanges by id and by run; emits `run-exchange` when an exchange joins a run (evidence for the orchestrator, `run.exchange` for the UI) |
| `src/decoder/payload-decoder.ts` | JWT, SD-JWT (with disclosures), JSON-LD VC, form decoding for `?decode=true` |

## Classification

| Request | ProtocolStep |
| --- | --- |
| `GET /.well-known/openid-credential-issuer` | `oid4vci.issuer_metadata` |
| `GET /.well-known/oauth-authorization-server`, `/.well-known/jwks.json` | `oid4vci.as_metadata` |
| `POST /v1/certify/pre-authorized-data`, `GET /v1/certify/credential-offer-data/{id}` | `oid4vci.credential_offer` |
| `POST /v1/certify/oauth/token` | `oid4vci.token` |
| `POST /v1/certify/issuance/credential` | `oid4vci.credential` |
| `POST /v1/verify/vp-request` | `verify.create_request` |
| `GET /v1/verify/vp-request/{requestId}` | `oid4vp.request_object` |
| `GET /v1/verify/vp-request/{requestId}/status` | `verify.status_poll` |
| `POST /v1/verify/vp-submission/direct-post` | `oid4vp.response` |
| `GET /v1/verify/vp-result/{transactionId}` | `verify.result` |
| `GET …/did.json` | `did.resolution` |

## Correlation

In order of preference:

1. **Run header.** The BFF's own calls carry `x-playground-run-id`, so offer creation, VP request creation, status polls and result fetches correlate exactly.
2. **Keys.** Each exchange yields keys from its URL, headers and both bodies: offer id (path), `pre-authorized_code`, the access token from `Authorization: Bearer …`, `c_nonce`, Verify `requestId` / `transactionId` (path and JSON), `state` and `nonce` (form bodies and the signed request object). Secret values (codes, tokens) are stored only as `sha256:` prefixes.
3. **Transitive linking.** When an exchange matches a run, every key it carries is linked to that run. The offer response introduces the pre-authorized code; the token request carries it and its response introduces the access token; the credential request then correlates through its `Authorization` header alone.
4. **Adjacency.** Issuer metadata, authorization server metadata and DID document fetches carry no key. A keyless fetch from the same client (address + user agent) within 30 s of that client's last correlated request joins its run.
5. **Armed window.** For wallet-initiated issuance (Inji Web), the orchestrator arms the run for the Certify component; the first uncorrelated authorize / token / credential exchange is bound to it, and the run is marked `correlation: heuristic`.

Exchanges captured before their run's keys are known are backfilled when the keys are registered.

## Masking

Stored and served copies mask the `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and `dpop` headers and the `access_token`, `refresh_token`, `pre-authorized_code`, `tx_code`, `code`, `client_secret` and `id_token` fields in JSON and form bodies and in URLs, keeping the first and last four characters (`eyJi…cwXQ`). JSON bodies keep their original formatting. Set `TAP_REVEAL_SECRETS=true` on the BFF to store them unmasked for local debugging. Credentials, presentations and verification results are not secret in this playground (mock identity data only) and are stored as they are.

## Configuration

| Env var | Compose value | Purpose |
| --- | --- | --- |
| `TAP_UPSTREAM_CERTIFY` | `http://certify:8090` | Certify upstream; unset disables the Certify tap |
| `TAP_UPSTREAM_VERIFY` | `http://verify-service:8080` | Verify upstream; unset disables the Verify tap |
| `TAP_CERTIFY_PORT` / `TAP_VERIFY_PORT` | `3002` / `3003` | Listener ports |
| `CERTIFY_PUBLIC_URL` / `VERIFY_PUBLIC_URL` | `https://certify.localhost:8443` / `https://verify.localhost:8443` | URL recorded for requests that do not come through the gateway (the BFF's own) |
| `TAP_REVEAL_SECRETS` | unset | `true` stores secrets unmasked |

## Running without Docker

```sh
cd apps/playground-bff
TAP_UPSTREAM_CERTIFY=http://localhost:8090 TAP_UPSTREAM_VERIFY=http://localhost:8080 pnpm dev
```

Point a wallet at `http://localhost:3002` (Certify) and `http://localhost:3003` (Verify), then read `GET http://localhost:3001/api/runs/<run id>/exchanges?decode=true`.

## Tests

`src/tap/tap.test.ts` covers classification, the offer → token → credential chain through the bearer token, presentation correlation, masking, and a real proxy round trip (gzip upstream, redirects, error responses).
