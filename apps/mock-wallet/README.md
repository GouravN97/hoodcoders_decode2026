# mock-wallet

A headless wallet (plan §8.5) that runs without a phone, so runs can be repeated, tested in CI and tampered with. The BFF's `MockWalletAdapter` drives it over a small REST API; the wallet itself talks to issuers and verifiers on their public URLs, so its traffic passes the Protocol Tap like a real wallet's.

| Protocol | Supported |
| --- | --- |
| OpenID4VCI | Draft 13, pre-authorized code (optional `tx_code`), offers by value or by reference, `jwt` proof (ES256) with a `did:jwk` key id |
| OpenID4VP | Presentation Exchange, `request_uri` (signed request object) or by-value requests, `direct_post` |
| Formats | `vc+sd-jwt` / `dc+sd-jwt` (key-binding JWT over the verifier's nonce and client id, selective disclosure for `limit_disclosure: required`), `ldp_vc` (VP with a JsonWebSignature2020 ES256 holder proof, as Inji Verify's vc-verifier 1.8 checks it) |
| Request objects | Signed `did:web` request objects are verified against the verifier's DID document; problems become warnings, which the BFF reports as findings |

One P-256 key per process serves as both the proof-of-possession key during issuance and the holder key when presenting. Credentials are kept in memory.

## API

| Method | Path | Body → response |
| --- | --- | --- |
| `POST` | `/offers/accept` | `{ offerUri, txCode? }` → the stored credential |
| `POST` | `/presentations/respond` | `{ authorizationRequestUri, credentialId?, tamper? }` → `{ credentialId, responseUri, status, body, warnings }` |
| `GET` | `/credentials` | held credentials |
| `DELETE` | `/credentials/:id` | 204 |
| `GET` | `/health` | `{ status, holderDid, credentials }` |

Errors are `{ message, statusCode, step, upstreamStatus?, upstreamBody? }`, where `step` is the protocol step that failed, so the run screen can show the issuer's or verifier's own error. Schemas: `packages/shared/src/mockWallet.ts`.

`tamper` breaks the credential before it is presented, for repeatable Invalid results:

| Tamper | SD-JWT | JSON-LD |
| --- | --- | --- |
| `T-SIG-FLIP` | changes one character of the issuer signature | changes one character of `proof.proofValue` |
| `T-CLAIM-EDIT` | replaces a disclosure with a new one for the same claim | edits a `credentialSubject` claim |

A run whose expected result is Invalid uses `T-SIG-FLIP` unless the run config names another tamper.

## Run

```sh
pnpm --filter @playground/mock-wallet dev   # http://localhost:7003
```

It must trust the issuer's and verifier's HTTPS certificates: in Docker Compose `NODE_EXTRA_CA_CERTS=/certs/ca.crt` points at the local CA. JSON-LD presentations need the issuer's `@context` documents; the W3C credentials, JWS 2020 and Ed25519 2020 contexts are bundled in `src/contexts/`, anything else is fetched once and cached.
