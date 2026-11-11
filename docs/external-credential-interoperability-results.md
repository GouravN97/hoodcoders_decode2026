# External credential interoperability test results

Date: 24 October 2026  
Branch: `test/external-credential-interoperability`

## Scope

The requested test covers no more than two credentials from each public issuer playground:

1. Hovi PID as `dc+sd-jwt`
2. Hovi PID as `mso_mdoc`
3. Animo EUDI PID as `dc+sd-jwt`
4. Animo EUDI PID as `mso_mdoc`

Temporary credential offers were created directly through each playground's public test interface. Offer URLs, pre-authorized codes and credential contents are intentionally not stored in this repository.

## Results

| Playground | Credential | Format | Offer created | Offer document fetched | Stored in Inji Wallet |
| --- | --- | --- | --- | --- | --- |
| Hovi | Personal Identification Data (PID) | `dc+sd-jwt` | Pass | Pass (`HTTP 200`) | Inconclusive — no Inji Wallet session was connected |
| Hovi | Personal Identification Data (PID) | `mso_mdoc` | Pass | Pass (`HTTP 200`) | Inconclusive — no Inji Wallet session was connected |
| Animo | EUDI PID (Bundesdruckerei) | `dc+sd-jwt` | Pass | Pass (`HTTP 200`) | Inconclusive — no Inji Wallet session was connected |
| Animo | EUDI PID (Bundesdruckerei) | `mso_mdoc` | Pass | Pass (`HTTP 200`) | Inconclusive — no Inji Wallet session was connected |

All four offers used the `openid-credential-offer` scheme, the pre-authorized-code grant and no transaction code.

## Metadata observed

Both issuers exposed valid OpenID Credential Issuer metadata with the selected credential configurations:

| Playground | SD-JWT configuration | mDoc configuration | Proof type |
| --- | --- | --- | --- |
| Hovi | `person_identification_data_(pid)_1.0.0_sd_jwt` (`dc+sd-jwt`) | `person_identification_data_(pid)_1.0.0_mdoc` (`mso_mdoc`) | JWT |
| Animo | `eudi-pid-sd-jwt-bdr` (`dc+sd-jwt`) | `eudi-pid-mdoc-bdr` (`mso_mdoc`) | JWT |

The SD-JWT credentials use VCT `urn:eudi:pid:1`. The mDoc credentials use doctype `eu.europa.ec.eudi.pid.1`. Both metadata documents expose a nonce endpoint, consistent with the current OpenID4VCI 1.0 flow.

## Compatibility risk

The repository currently describes Inji Wallet as supporting the `oid4vci-draft13` profile and the `vc+sd-jwt` and `mso_mdoc` formats. These external issuers advertise current OpenID4VCI 1.0 metadata and `dc+sd-jwt` for their SD-JWT credentials.

Consequently:

- SD-JWT import has a likely version/format interoperability risk (`vc+sd-jwt` versus `dc+sd-jwt`).
- mDoc has a closer format match, but still needs a real Inji Wallet scan to verify the complete offer, token, proof and credential flow.
- Successful QR generation is not evidence that Inji Wallet stored the credential.

## Remaining manual step

Connect an Inji Wallet mobile session, create fresh offers and scan each one using **+ → Scan QR code**. Record the exact wallet message and whether the credential appears in the wallet. This consent-controlled phone action could not be performed from the test environment used for this report.

## Animo → Paradym → Inji Verify (MOSIP Collab)

Date: 11 November 2026  
Branch: `feat/animo-paradym-inji-verify`  
Stack: `injistack` Docker Compose (playground UI and BFF), Animo's public playground (`playground.animo.id`) as issuer, Paradym on a physical phone as wallet, MOSIP Collab's Inji Verify (1.0 API: `/v2/vp-request`, DCQL, `decentralized_identifier:` client ID) as verifier.

**Result: VALID.** A Tax-ID from Animo's "Bundeszentralamt fur Steuern" issuer, in `dc+sd-jwt`, was issued to Paradym, presented to Collab's Inji Verify and verified. Issuer, wallet and verifier come from three different parties, and only the verifier is Inji. This is the first lane in the playground where a credential from outside the Inji ecosystem is verified by Inji.

| Step | Observed |
| --- | --- |
| Issue (Animo → Paradym) | Offer created through Animo's `/api/offers/create`, scanned and accepted in Paradym (OpenID4VCI 1.0). The phone talks to Animo directly, so the run records the offer and the holder's confirmation (manual evidence) |
| Request (playground → Collab) | DCQL query `{"format": "dc+sd-jwt", "meta": {"vct_values": ["https://example.eudi.ec.europa.eu/tax-id/1"]}}`, sent through the Protocol Tap; Collab answered `201` with a `requestUri` |
| Request object (Collab → Paradym) | Signed JAR (`typ: oauth-authz-req+jwt`, `alg: EdDSA`, `kid: did:web:injiverify.collab.mosip.net:v1:verify#key-0`). The DCQL query arrived unchanged; `client_metadata.vp_formats_supported` lists `dc+sd-jwt` with `ES256` among `sd-jwt_alg_values` and `kb-jwt_alg_values`; `response_mode: direct_post`. Collab's `did.json` publishes `#key-0` as an `Ed25519VerificationKey2020` under both `authentication` and `assertionMethod` |
| Present and verify (Paradym → Collab) | Paradym shared the card; Collab's result was **VALID** |

### What it took

1. **Animo's issuer list changed.** By 11 November 2026 the Bundesdruckerei issuer used on 24 October was gone, so the adapter (which looked only for its "EUDI PID") listed nothing ("No credential for this format"). The adapter now offers every `dc+sd-jwt` and `mso_mdoc` credential Animo publishes, PIDs first. The EUDI PID now sits under "Utopia Government" (`eudi-pid-sd-jwt-utopia`); its type is not in the adapter yet.
2. **The request must name the credential's real `vct`.** Animo's `/api/issuers` does not publish it. Without it the playground fell back to the configuration id (`vct = tax-id-sd-jwt`), Paradym found no matching card and posted `error=access_denied`, which Collab returned as the result. The Tax-ID types were read from the issuer's `/.well-known/openid-credential-issuer` and added to the adapter (`ANIMO_KNOWN_TYPES`).
3. **A wallet that speaks `dc+sd-jwt`.** Present-only and full runs offer only formats the issuer and wallet share; Inji Wallet's catalog entry has no `dc+sd-jwt`, so with Animo only `mso_mdoc` was offered. Paradym was added to the catalog (`catalog/paradym-wallet.yaml`, human in the loop).

### Not working: Animo mDoc → Paradym → mock verifier

Paradym answers the mock verifier's request with "presentation information could not be extracted". The mock verifier speaks OpenID4VP draft 23 (`presentation_definition`, a bare `did:web` client ID, `client_metadata.vp_formats`), which Paradym (OpenID4VP 1.0) does not read; on a local stack its `verify.localhost` host is also unreachable from a phone without tunnels. Collab's adapter does not request `mso_mdoc`. External mDoc verification therefore remains untested.

### What was not observed

The phone's traffic to Animo and to Collab bypasses the Protocol Tap, so the inspector shows request creation and Collab's result, not the presented `vp_token`. The request object above was fetched separately with the same query, not captured from the run.

## Replay and tamper runs against Inji Verify 0.18.2

Date: 25 October 2026  
Branch: `feat/tamper-mode`  
Stack: `injistack` Docker Compose: Inji Certify `0.14.0` (pre-authorized code), the playground mock wallet, Inji Verify `0.18.2` (Presentation Exchange, `direct_post`), every message captured by the Protocol Tap.

Each row is one full run (issue → hold → present → verify) started through `POST /api/runs` with the run's `tamper` set, as the **Tamper** picker does. The issued credential is always genuine; the mock wallet changes only what it presents. The request nonces, key-binding nonces and types below were read from the captured `request_uri` and `direct_post` messages, not inferred.

| Tamper | `vc+sd-jwt` | `ldp_vc` | Expected |
| --- | --- | --- | --- |
| None (baseline) | VALID | VALID | Valid |
| `T-SIG-FLIP` | INVALID | INVALID | Invalid |
| `T-CLAIM-EDIT` | INVALID | INVALID | Invalid |
| `T-WRONG-TYPE` | **VALID** | **VALID** | Invalid |
| `T-NONCE-REPLAY`, resubmit the earlier `vp_token` | **VALID** | Refused at `direct_post`: HTTP 400 `invalid_request` "Nonce validation failed due to invalid nonce" | Invalid |
| `T-NONCE-REPLAY`, new presentation over the earlier nonce | **VALID** | Refused at `direct_post` (same 400) | Invalid |
| `T-EXPIRED` (`FarmerCredential*Expired`) | EXPIRED | EXPIRED | Valid but expired |

### Findings

1. **Wrong credential type accepted (both formats).** The presentation definition's only field filter asked for `$.vct` (SD-JWT) or `$.type` (JSON-LD) matching `PlaygroundWrongTypeCredential`. The wallet presented a `FarmerCredentialSdJwt` (or `FarmerCredential`) credential. Inji Verify returned `vpResultStatus: SUCCESS`. It verified the credential's signature but did not check the credential against the input descriptor it had asked for.
2. **SD-JWT holder binding not tied to the request.** In the resubmit run, the request carried nonce `93fb6255…` and the key-binding JWT carried `65392987…` from an earlier request. In the stale-nonce run, the key-binding JWT was freshly signed over an earlier request's nonce. Inji Verify returned SUCCESS both times. For JSON-LD, the same two tampers are refused at `direct_post` with an explicit nonce error, so Inji Verify checks the `ldp_vp` proof challenge but not the SD-JWT key-binding nonce. The key-binding `aud` was the correct `client_id` in every run, so audience checking was not tested (that is `T-AUD-MISMATCH`, not implemented yet).

What was not established: whether these come from Inji Verify itself or from the `vc-verifier` library it uses, and whether Inji Verify 1.0.x (the DCQL lane) behaves the same. Both need a second run before an issue is filed.

### Reproduce

```sh
# Stack up (injistack/README.md), then one run per tamper:
curl -s -X POST http://localhost:8101/api/runs -H 'content-type: application/json' -d '{
  "mode": "full", "issuerId": "inji-certify", "walletId": "mock-wallet", "verifierId": "inji-verify",
  "format": "vc+sd-jwt", "credentialConfigurationId": "FarmerCredentialSdJwt",
  "grantType": "pre-authorized_code", "presentationFlow": "cross-device-qr",
  "expectedOutcome": "INVALID", "tamper": { "id": "T-NONCE-REPLAY", "params": { "variant": "stale-nonce" } }}'
```

`T-NONCE-REPLAY` needs an earlier untampered run of the same format that Inji Verify accepted. The inspector's **Tamper** tab on the `vp_token` message shows the nonce the request asked for and the nonce that was sent.

## Mock verifier and second opinion

Date: 25 October 2026  
Branch: `feat/mock-verifier`  
Stack: `injistack` Docker Compose: Inji Certify `0.14.0` (pre-authorized code), the playground mock wallet, Inji Verify `0.18.2` and the playground mock verifier `0.1.0` (`/mock-verifier/…` on the Verify host), every message captured by the Protocol Tap.

Each row is one full `vc+sd-jwt` run started through `POST /api/runs`. The **second opinion** column is the other verifier's verdict on the presented credential alone (`VER-002`): Inji Verify's `/v1/verify/vc-verification` (`Content-Type: application/vc+sd-jwt`) for runs that end at the mock verifier, and the mock verifier's `api/verify-credential` for runs that end at Inji Verify. "Not compared" means the run is judged on presentation checks that a credential-only check cannot make.

| Tamper | Mock verifier (failing check) | Inji Verify on the credential alone | Inji Verify (full run) | Mock verifier on the credential alone |
| --- | --- | --- | --- | --- |
| None | VALID, all ten checks pass | VALID, agrees | VALID | VALID, agrees |
| `T-SIG-FLIP` | INVALID (issuer signature) | INVALID, agrees | INVALID | INVALID, agrees |
| `T-CLAIM-EDIT` | INVALID (disclosures: `gender` not committed to by the issuer) | INVALID, agrees | INVALID | INVALID, agrees |
| `T-WRONG-TYPE` | INVALID (requested credential: `$.vct` matching `PlaygroundWrongTypeCredential` not met) | VALID, not compared | **VALID** | VALID, not compared |
| `T-NONCE-REPLAY` | INVALID (holder binding: key-binding nonce is the earlier request's) | VALID, not compared | **VALID** | VALID, not compared |
| `T-EXPIRED` | EXPIRED (validity: expired at 2025-01-01) | EXPIRED, agrees | EXPIRED | EXPIRED, agrees |

What this shows:

1. The mock verifier interoperates with Inji Certify's SD-JWT: it verifies the issuer signature from the `x5c` header, all 13 disclosures and the mock wallet's key-binding JWT. Certify's `iss` is `mosip.certify.domain.url` (`https://<certify-host>:8443`, with the port, also in tunnel mode); that is the value its trust list needs.
2. On the credential itself, the two verifiers never disagreed: same verdict for the genuine, broken-signature, edited-claim and expired credentials.
3. The two Inji Verify gaps found with the tamper runs are presentation checks, not credential checks: the mock verifier catches both, at the requested-credential and holder-binding stages. This confirms the gaps are on Inji Verify's side and not an artefact of the mock wallet's presentations.
4. `ldp_vc` gets no second opinion: the mock verifier checks SD-JWT VC only.

### Inji Wallet (emulator) → mock verifier

Run 25 October 2026 through Cloudflare quick tunnels (portless `MOCK_VERIFIER_DID`), Inji Wallet `1.0.0-alpha.1` on the `Medium_Phone_API_37.0` emulator, Certify → Inji Wallet → mock verifier, `vc+sd-jwt`: **VALID** (run `d24bf201` after the fix below). Inji Wallet resolved the mock verifier's `did:web`, verified its EdDSA request object (no warning), asked the holder for consent ("share your cards with Playground mock…", a step the Inji Verify runs did not show), and posted a presentation that passes every check, including the key-binding JWT (an Ed25519 `did:jwk` holder key). Inji Verify's second opinion agreed.

Two things only this lane showed:

1. **`vp_token` is a JSON-encoded string.** Inji Wallet posts `vp_token="eyJ…~…~<kb-jwt>"` with the quotes. OpenID4VP draft 23 calls `vp_token` a "JSON String", and Inji Verify reads this form; the playground's mock wallet, like most wallets, sends the bare value. The first attempt failed at the mock verifier's SD-JWT format check. The mock verifier now reads the quoted form and reports it as a warning.
2. **No claims were disclosed.** The presentation definition only constrains `$.vct`, and Inji Wallet sent the SD-JWT with no disclosures. That satisfies the request; a request that needs claims has to name them.

The first attempt also exposed a playground bug: the second opinion sent the quoted string to Inji Verify, got INVALID, and recorded the verifiers as agreeing. The credential is now unwrapped before the second opinion.

## mDoc: Certify mock mDoc

Date: 25 October 2026  
Branch: `feat/mdoc`  
Stack: `injistack` Docker Compose with `--profile mdoc`: a second Inji Certify `0.14.0` (`injistack/inji-certify-with-plugins:0.14.0`, which bundles `mock-certify-plugin` 0.6.0) with `plugin-mode=VCIssuance` and `MDocMockVCIssuancePlugin`, published at `https://<certify-host>:8443/mdoc`; the playground mock wallet; the mock verifier; Inji Verify `0.18.2`.

**Gate.** Before any other mDoc code, one mDoc was issued from the pinned image by pre-authorized offer (offer → token → credential, HTTP 200). The gate passed, so no fallback to Certify's DataProvider mDoc path was needed.

| Run (`mso_mdoc`, `MockMDL`) | Result |
| --- | --- |
| Certify mock mDoc → mock wallet → mock verifier | **VALID**: COSE issuer signature, trusted certificate, 3 element digests, device signature over the session transcript, validity |
| `T-SIG-FLIP` | INVALID (issuer signature) |
| `T-CLAIM-EDIT` | INVALID (digests: the edited `birth_date` is not committed to by the MSO) |
| `T-WRONG-TYPE` | INVALID (requested credential: docType is `org.iso.18013.5.1.mDL`, the request asked for another) |
| `T-NONCE-REPLAY` | INVALID (holder binding: the device signature does not verify over this request's session transcript) |
| Certify mock mDoc → mock wallet → **Inji Verify 0.18.2** | Refused at `direct_post`: HTTP 400 `{"errorCode":"INVALID_VP_TOKEN","errorMessage":"Verifiable presentation failed due to invalid VP token"}`. This matches the source at `v0.18.2`, where every string `vp_token` is read as SD-JWT |

Observed in the credential Certify returns (not inferred from source):

1. **Wrapped structure.** The credential is CBOR `{docType, issuerSigned}`. OpenID4VCI's `mso_mdoc` and ISO 18013-5 expect the `IssuerSigned` structure itself. The mock wallet unwraps it when presenting.
2. **The offer's claims are ignored.** Whatever the pre-authorized offer says, the mDL carries the plugin's fixed mock data (family name "Agatha", given name "Joseph", birth date 1994-11-06). `document_number` holds the access token's `sub`, which for a pre-authorized token is the offer's claims serialised as JSON.
3. **`driving_privileges` is a text string** (a Java `Map.toString()`, e.g. `{issue_date=…, vehicle_category_code=A, …}`). ISO 18013-5 defines an array of maps.
4. **Holder key binding is `cose_key` only.** A proof whose `kid` is `did:jwk:…#0` fails with `vci_exchange_failed` (the plugin base64-decodes the DID including the fragment: `Illegal base64 character 23`). A `jwk` header or a bare `did:jwk` works. Inji Wallet `1.0.0-alpha.1` sends exactly that for `mso_mdoc` (observed on the emulator, below).
5. **Padded base64url.** The credential string sometimes ends in `=`.
6. The concern from reading the DataProvider path's source (untagged `validityInfo` dates, no `signed` date) does **not** apply to this plugin: its `validityInfo` dates are tagged and `signed` is present.

The issuer signature and every element digest of a Certify-issued mDL also verify in `packages/protocol-core` unit tests, against a saved credential (`src/fixtures/certify-0.14.0-mock-mdl.mdoc`).

**Certify mock mDoc → Inji Wallet (emulator), issue-only: fails at the credential request** (run `714478ff`). The wallet took the offer, showed the issuer's name from the metadata, exchanged the pre-authorized code, and sent `{"format":"mso_mdoc","doctype":"org.iso.18013.5.1.mDL"}` with a proof whose header has `kid: did:jwk:…#0` and no `jwk`. Certify answered `400 vci_exchange_failed` (log: `Exception on mdoc creation`, `Illegal base64 character 23`); the wallet showed "Server issue". Both sides contribute: the configuration advertises `cose_key` binding, for which the proof should carry the key (`jwk`), and the mock plugin cannot read a valid `did:jwk` DID URL with a fragment.

## Same-device link and Digital Credentials API

Date: 25 October 2026  
Branch: `feat/same-device-dc-api`

**Same-device link (Android emulator, `Medium_Phone_API_37.0`, Inji Wallet `1.0.0-alpha.1` debug build).** The playground was opened in the emulator's Chrome at `http://10.0.2.2:8100/runs/<id>` for a Certify → Inji Wallet (mobile) run. The phone layout showed **Open in wallet**; tapping it made Chrome start `io.mosip.residentapp/.MainActivity` with the `openid-credential-offer://` link (`ActivityTaskManager: START … cat=[BROWSABLE] dat=openid-credential-offer:///…`), and Inji Wallet came to the foreground at its unlock screen. The issuance was not completed: the offer's host is a Cloudflare quick-tunnel name and no tunnel was running. This is an emulator result, not a physical phone.

**Digital Credentials API.** No wallet tested here offers it: Inji Wallet `1.0.0-alpha.1` registers no Credential Manager provider. What was checked:

| Check | Result |
| --- | --- |
| UI, stubbed `navigator.credentials.get` (Playwright) | The page sends `openid4vp-v1-unsigned` with `response_mode: dc_api` and a DCQL query; the stubbed answer is relayed and the run completes; a refusal (`NotAllowedError`) fails the delivery step with that error |
| UI, browser without the API | Explanation shown, no button. Playwright's own Chromium already exposes `DigitalCredential`, so the test removes it |
| Server side, live (BFF → Protocol Tap → mock verifier) | A script stands in for the browser's wallet with a real Certify `vc+sd-jwt` credential: bound to the page origin (`aud` = `origin:http://localhost:8100`) → **VALID**; bound to another origin → INVALID at holder binding (`aud is "origin:https://evil.example"`) |
