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
