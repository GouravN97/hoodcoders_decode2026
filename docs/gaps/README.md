# Interoperability gaps

The gaps the playground found against the pinned stack (Inji Certify `0.14.0`, Inji Verify `0.18.2`, Inji Wallet `1.0.0-alpha.1`, Mimoto `0.21.0`, eSignet `2.0.0`), what is already known upstream, and what to file. The numbering matches the [README](../../README.md#interoperability-gaps-found).

**Nothing has been filed yet.** Each draft below is waiting for a team member to review and file it by hand. Before filing, check that the upstream search below is still current.

## How the drafts are made

`make up`, then `make interop` and `pnpm --filter @playground/interop-cli start gaps --out ../../out/gaps` (bonus B2, plan §16.2). The `gaps` command reads every saved run with verdict Fail from the BFF and groups the runs by a **gap signature**: what failed, in which module and version. For a tamper the verifier let through, the signature is that verifier version plus the tamper, across formats. For a wrong verdict, it is that verifier version plus the format and the expected and observed results. For any other failure, it is the failing step plus the normalized error. Signatures are sorted into three categories:

- **interop**: a GitHub issue draft is written, with the plan §16.2 template: environment, a one-lane matrix that reproduces it with `make interop`, expected and actual results, and redacted evidence from the Protocol Tap. The evidence includes the decoded request object, the presentation with its key-binding JWT, and the verifier's answer.
- **infrastructure**: tunnel hostnames, DNS, timeouts. Listed, never drafted.
- **holder**: a person declined in the wallet. Listed, never drafted.

Drafts 01 and 02 below were generated this way from the 26 October 2026 nightly run. Drafts 03 to 06 were written by hand: their evidence is a service log line or an observation on the phone, which the tap does not capture.

## Summary

| # | Gap | Module | Evidence | Upstream (searched 26 October 2026) | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | Wrong credential type accepted | Inji Verify 0.18.2 | Nightly suite, `T-WRONG-TYPE`, both formats, 10 runs | Known: [inji-verify#1790](https://github.com/inji/inji-verify/issues/1790) (a wrong VC returns success, open) and [inji-verify#1807](https://github.com/inji/inji-verify/issues/1807) (server-side matching of the VP token against the presentation definition, open) | Fixed in the 1.0 API: on 26 October 2026 Collab's Inji Verify refused it (`vct claim does not match any of the vct_values in the DCQL query`). Comment on #1790 with [draft 01](drafts/01-inji-verify-wrong-credential-type.md): reproduced on 0.18.2, refused by the 1.0 API, so #1790 may be closable for 1.0 |
| 2 | SD-JWT key-binding nonce not checked (replay accepted) | Inji Verify 0.18.2 | Nightly suite, `T-NONCE-REPLAY`, `vc+sd-jwt`, 9 runs | Known and fixed upstream: [inji-verify#2043](https://github.com/inji/inji-verify/issues/2043), closed 3 August 2026 in milestone `1.0.0-alpha.1`. The fix, PR [#2051](https://github.com/inji/inji-verify/pull/2051), was merged into `develop` on 18 June 2026. Inji Verify 0.18.2 (13 July 2026) still accepts the replay, so the fix is not in 0.18.x | No new issue. Confirmed fixed in the 1.0 API: Collab's Inji Verify refused the replay (`Nonce validation failed`). If 0.18.x stays supported, ask on #2043 for a backport, attaching [draft 02](drafts/02-inji-verify-sd-jwt-nonce.md) |
| 3 | `did:web` with a port does not resolve | `vc-verifier` (used by Inji Verify 0.18.2) | Verify log: `DidWebPublicKeyResolver: Invalid URL host: "certify.localhost%3A8443"`; every `ldp_vc` failed until the DID became portless | Not found in inji/vc-verifier or inji/inji-verify | File [draft 03](drafts/03-vc-verifier-did-web-port.md) against inji/vc-verifier |
| 4 | VP holder becomes `…#0#0` | Inji Wallet 1.0.0-alpha.1 (Android) | Emulator, `ldp_vc`, run `139b5a05` (24 October 2026); Verify: `Illegal character in fragment` | Related, not the same: [inji-wallet#2619](https://github.com/inji/inji-wallet/issues/2619) (iOS: remove holder ID sanitization in the OVP library) | File [draft 04](drafts/04-inji-wallet-holder-fragment.md) against inji/inji-wallet, linking #2619 |
| 5 | `did:web` with a port does not resolve (wallet) | Inji Wallet 1.0.0-alpha.1 | Emulator: `Invalid URL host: "<host>%3A8443"` | Same root cause as 3 if the wallet uses the same resolver | Mention it in draft 03; file separately only if the wallet's resolver is a different library |
| 6 | Expired credential shown as Valid | Inji Wallet 1.0.0-alpha.1 | Emulator, `FarmerCredentialExpired` (`ldp_vc`) | Not found | File [draft 05](drafts/05-inji-wallet-expired-shown-valid.md) |
| 7 | Empty `face` claim forces a selfie match | Inji Wallet 1.0.0-alpha.1 | Emulator | Not found (the share-with-selfie issues are about broken flows, not the trigger) | File [draft 06](drafts/06-inji-wallet-empty-face-selfie.md) |
| 8 | OpenID4VCI 1.0 issuers may not be accepted | Inji Wallet | Predicted; not tested on a phone | — | Test first |
| 9 | Needs a hardware-backed keystore | Inji Wallet | Emulator hang | Likely deliberate (key protection) | Not filed; documented for testers |
| 10 | SD-JWT only as `vc+sd-jwt` | Inji Certify 0.14.0 | Catalog and metadata | Known: [inji-certify#901](https://github.com/inji/inji-certify/issues/901) (`dc+sd-jwt` with pre-authorized code, open) | No new issue; +1 on #901 with the Hovi and Animo mismatch |
| 11 | Mimoto token request rejected with `invalid_client` | Mimoto 0.21.0 / eSignet 2.0.0 | Local Inji Web setup | Root cause unknown; may be our setup | Not filed until reproduced on a reference setup |
| 12 | Mock mDoc plugin cannot read a `did:jwk…#0` proof `kid` | Inji Certify 0.14.0 (mock mDoc) | Emulator: `vci_exchange_failed`, `Illegal base64 character 23` | Related: [inji-certify#999](https://github.com/inji/inji-certify/issues/999) (support `cose_key` binding for `mso_mdoc`, open) | Comment on #999: Inji Wallet sends `kid: did:jwk:…#0` for `mso_mdoc`, and the plugin decodes the DID with its fragment |

## Not gaps

The `gaps` command also groups these failures. They are listed here so they are not filed:

- **Infrastructure:** credential and offer requests to tunnel hostnames that had changed (`*.trycloudflare.com`). See the tunnel notes in [injistack](../../injistack/README.md#phones-and-tunnels).
- **Holder:** `access_denied`, where the person declined in the wallet. Paradym also sends it when it holds no card matching the request (seen when the request asked for the wrong `vct`), so check the request's `vct_values` before treating it as a decline.
- **Our own setup:**
  - Three mock wallet `ldp_vc` runs returned Invalid. Run `93d3d8b1` (26 October 2026) was gap 3: it ran before the local issuer DID became portless. Runs `73c9c037` and `b28d045e` (24 October 2026) came from the same setup period, and their cause was not recorded.
  - Three `vc+sd-jwt` runs (23 October 2026) expected Expired from the normal configuration, a day before the expired copy was added (commit `ef81dd9`). Run `d54f2981` expected Valid from the expired copy.
- **Playground mocks:** one mock verifier run (`T-CLAIM-EDIT` on `mso_mdoc`) and one SD-JWT format error from Inji Wallet's JSON-quoted `vp_token` (now accepted with a warning). Both were fixed in this repository.
