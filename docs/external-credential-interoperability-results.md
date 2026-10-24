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
