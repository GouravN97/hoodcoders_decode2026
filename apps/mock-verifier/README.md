# mock-verifier

A standards-based OpenID4VP verifier that is not Inji (plan §8.4), so a run can end at a non-Inji party and every check the verifier makes is visible. It speaks the dialect Inji Verify 0.18.x speaks and Inji Wallet's `inji-openid4vp` documents (draft 23), so the same wallets can present to it. The BFF's `MockVerifierAdapter` drives it over a small REST API.

| | Supported |
| --- | --- |
| Profile | OpenID4VP draft 23, Presentation Exchange (`presentation_definition`), response mode `direct_post` |
| Request | Signed request object by reference (`request_uri`, JAR `typ: oauth-authz-req+jwt`, EdDSA), `GET` or `POST` (`request_uri_method=post`) |
| Client ID | `did:web`, resolving to `<public URL>/did.json` (an `Ed25519VerificationKey2020` key, the shape Inji Verify publishes). A new key per process |
| Formats | SD-JWT VC: `vc+sd-jwt` and `dc+sd-jwt`, ES256 or EdDSA issuer and key-binding signatures. ISO mDoc (`mso_mdoc`): a DeviceResponse `vp_token`, ES256 COSE. A JSON-LD (`ldp_vc`) presentation is answered "not checked by this mock verifier" (outcome Error) |
| Issuer keys | `jwk` or `x5c` in the issuer JWT header, `did:jwk`, `did:web` (via `kid`) |

## Checks

Every response goes through the same stages, in order, and the result lists each with pass, fail, warn or skip and a message:

| Stage | Checks | A failure means |
| --- | --- | --- |
| `response-shape` | `vp_token` and `presentation_submission` present, or the wallet's `error` | Rejected |
| `state` | `state` equals the request's | Rejected |
| `submission` | `definition_id`, the descriptor id, path `$` | Invalid |
| `requested-credential` | the input descriptor's format and field constraints (e.g. `$.vct`) against the disclosed claims | Invalid |
| `format` | SD-JWT parses; `typ` is `vc+sd-jwt` or `dc+sd-jwt` (other values warn) | Invalid |
| `issuer-signature` | the issuer JWT signature (with an `x5c` header, the leaf key; the chain is not validated, trust comes from the next stage) | Invalid |
| `issuer-trust` | `iss` is in `TRUSTED_ISSUERS` (otherwise a warning, not a failure) | — |
| `disclosures` | every disclosure's digest is in the issuer JWT's `_sd` | Invalid |
| `holder-binding` | key-binding JWT signed by the `cnf` key, `nonce` and `aud` of this request, `sd_hash` | Invalid |
| `validity` | `exp` and `nbf` | Expired (or Invalid for not-yet-valid) |

A response that cannot be used at all (wrong `state`, malformed) is refused at `direct_post` with HTTP 400 `invalid_request`, and the result is still stored. A wallet's `error` response is stored as Rejected and answered 200.

For `mso_mdoc` the stages are the same ids where they mean the same thing: `requested-credential` (the docType is the input descriptor's id, as ISO 18013-7 has it, and the requested `$['namespace']['element']` fields are disclosed), `format` (DeviceResponse status, MSO docType, and observed differences from ISO 18013-5 as a warning), `issuer-signature` (COSE_Sign1 with the `x5chain` leaf), `issuer-trust` (the leaf against `TRUSTED_MDOC_CERTS`), `digests` (each disclosed element against the MSO's value digests), `holder-binding` (the device signature over the ISO 18013-7 Annex B session transcript: `client_id`, `response_uri`, `nonce`; the mdoc nonce is the empty string because `direct_post` carries no JWE `apu`) and `validity` (`validFrom` / `validUntil`).

`api/verify-credential` runs the credential stages on a credential alone (holder binding is skipped). The BFF uses it as the **second opinion** (`VER-002`) after Inji Verify has answered a run.

## API

All paths are under `BASE_PATH` (default `/mock-verifier`).

| Method | Path | For | Body → response |
| --- | --- | --- | --- |
| `POST` | `api/requests` | BFF | `{ transactionId?, presentationDefinition }` → `{ requestId, transactionId, authorizationRequestUri, requestUri, clientId, expiresAt }` |
| `GET` | `api/requests/:requestId/status?wait=ms` | BFF | long poll → `{ status: ACTIVE \| VP_SUBMITTED \| EXPIRED }` |
| `GET` | `api/results/:transactionId` | BFF | `{ outcome, stages[], format?, credentialType?, issuer?, verifiedAt }` |
| `POST` | `api/verify-credential` | BFF | `{ credential, format? }` → same result shape |
| `GET`, `POST` | `oid4vp/request/:requestId` | wallet | signed request object |
| `POST` | `oid4vp/response/:requestId` | wallet | `direct_post` form |
| `GET` | `did.json` | wallet | DID document |
| `GET` | `health` | | `{ status, clientId }` |

Schemas: `packages/shared/src/mockVerifier.ts`. Transactions are in memory and expire after `REQUEST_TTL_MS`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `7004` | |
| `BASE_PATH` | `/mock-verifier` | path it serves under |
| `PUBLIC_URL` | `http://localhost:7004/mock-verifier` | where wallets reach it; `request_uri`, `response_uri` and the DID use it |
| `CLIENT_ID` | did:web of `PUBLIC_URL` | override for a portless DID behind a tunnel (Inji Wallet and Inji Verify do not decode `%3A<port>`) |
| `TRUSTED_ISSUERS` | none | comma-separated `iss` values; Certify's is `mosip.certify.domain.url` |
| `TRUSTED_MDOC_CERTS` | none | comma-separated PEM files with mDoc issuer certificates; re-read on each verification, missing files skipped (Compose mounts the one `certify-mdoc-init` makes) |
| `REQUEST_TTL_MS` | `300000` | |

In Compose it is published as `https://<verify-host>:8443/mock-verifier/…` through `certify-nginx` and the BFF's mock-verifier tap (`:3004`), with `CLIENT_ID` from `MOCK_VERIFIER_DID` (`tunnel-up.sh` sets a portless one).

## Run

```sh
pnpm --filter @playground/mock-verifier dev   # http://localhost:7004/mock-verifier
pnpm --filter @playground/mock-verifier test  # end to end with the real mock wallet code, in process
```
