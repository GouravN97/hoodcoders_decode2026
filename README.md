# Inji Interop Playground

Team **hoodcoders** · MOSIP Decode 2026 · Problem Statement 02 (Inji)

A web playground that tests whether a verifiable credential can be **issued** by one system, **held** by another and **verified** by a third, and shows every protocol message exchanged along the way.

Pick an issuer, a wallet and a verifier, choose a credential format, press **Run**, and watch a live issue → hold → present → verify cycle (OpenID4VCI + OpenID4VP). Every run ends with a pass/fail interoperability report.

| Role     | Starting implementation                   |
| -------- | ----------------------------------------- |
| Issuer   | Inji Certify                              |
| Wallet   | Inji Wallet (mobile), Inji Web (+ Mimoto) |
| Verifier | Inji Verify                               |

Supported credential formats include W3C VC JSON-LD (`ldp_vc`), SD-JWT VC (`vc+sd-jwt`
and `dc+sd-jwt`) and mDoc (`mso_mdoc`).

## Status

Live runs work end to end: [`injistack/`](injistack) starts Inji Certify, Inji Verify, the playground UI, the BFF with its Protocol Tap and a headless mock wallet with Docker Compose. A run issues a real credential from Certify (pre-authorized code), the wallet presents it to Inji Verify over OpenID4VP, every message passes through the tap and shows in the inspector, and the run ends with a pass/fail report.

| Lane | State |
| --- | --- |
| Certify → mock wallet → Inji Verify, SD-JWT (`vc+sd-jwt`) | Valid runs pass, in the browser and over the API |
| Certify → mock wallet → Inji Verify, JSON-LD (`ldp_vc`) | Valid runs pass against the real stack (checked 25 October 2026; the JSON-LD contexts need internet access) |
| Certify → Inji Wallet (Android app, `v1.0.0-alpha.1`) → Inji Verify | SD-JWT (`vc+sd-jwt`) verifies **VALID** on an emulator through Cloudflare quick tunnels ([how to test](injistack/README.md#test-with-inji-wallet-on-an-android-emulator)). JSON-LD issuance and VP submission reach Verify, but the pinned Wallet/OpenID4VP dependency emits `did:jwk:...#0#0`, so Verify rejects the presentation. |
| Hovi Playground → Inji Wallet | Selectable for Issue-only PID tests in `dc+sd-jwt` and `mso_mdoc`; live offer creation verified, wallet acceptance still needs a phone scan |
| Animo Playground → Inji Wallet | Selectable for Issue-only EUDI PID tests in `dc+sd-jwt` and `mso_mdoc`; live offer creation verified, wallet acceptance still needs a phone scan |
| Inji Web | Mimoto, Inji Web and the eSignet login work once the keystore and `wallet-demo` client are set up ([`register-wallet-client.sh`](injistack/scripts/register-wallet-client.sh)); the download still fails because eSignet rejects the client assertion with `invalid_client` ([details and what was ruled out](injistack/README.md#current-local-web-wallet-limitation)) |
| Valid-but-expired | `FarmerCredentialExpired` (ldp_vc) and `FarmerCredentialSdJwtExpired` (vc+sd-jwt) are signed with validity in the past; Inji Verify reports **EXPIRED** (also the T-EXPIRED tamper) |
| History and matrix | `/history` with filters by module version, format, outcome, mode, tamper and date; matrix exported as Markdown. Checked against the real stack's saved runs and the mocks |
| Sequence diagram | Live in the inspector for every run; checked against the real stack (SD-JWT, mock wallet) and the in-browser mocks, in both themes |
| Replay & tamper (mock wallet → Inji Verify 0.18.2) | Run live for both formats. Broken signature and edited claim are rejected (**INVALID**). Inji Verify **accepts** a wrong credential type for both formats, and, for SD-JWT only, a replayed `vp_token` or one bound to an old nonce ([results](docs/external-credential-interoperability-results.md#replay-and-tamper-runs-against-inji-verify-0182)) |

The reproducible passing demonstrations are SD-JWT and JSON-LD with the mock
wallet (including tamper runs) and SD-JWT with the mobile Wallet. The mobile
JSON-LD result is a documented compatibility limitation of the pinned Wallet
release, not a Certify or Docker-stack failure.

The UI also still runs entirely against in-browser mocks with `pnpm dev`.

### Run modes

Issuing and verifying are separate parties, so each half can run on its own. Pick one under **What to run** in the run settings:

| Mode                  | Phases                                                               | Talks to                 |
| --------------------- | -------------------------------------------------------------------- | ------------------------ |
| Full cycle            | issue → hold → present → verify                                      | issuer, wallet, verifier |
| Issue only            | issue → hold; passes once the credential is in the wallet            | issuer, wallet           |
| Present & verify only | hold → present → verify, using a credential the wallet already holds | wallet, verifier         |

For present-only runs the mock wallet lists what earlier runs stored in it, so you can pick a credential (it forgets them when its container restarts). With Inji Wallet on a phone or Inji Web, you confirm on the run screen that the credential is already in the wallet. Present-only is the easiest way to test the verifier while the issuer is down, or to present an already-expired credential for **Valid-but-expired**.

### Replay and tamper

With the **Mock wallet**, the run settings offer a **Tamper** picker: a deliberate negative test that checks whether the verifier rejects a broken presentation (plan §13). Picking one sets the expected result; the expected result otherwise defaults to **Valid** and is not remembered between visits.

| Tamper | What is broken | Expected |
| --- | --- | --- |
| `T-SIG-FLIP` | One character of the issuer's signature | Invalid |
| `T-CLAIM-EDIT` | One claim value after issuance (a disclosure for SD-JWT) | Invalid |
| `T-WRONG-TYPE` | The verifier asks for a type the wallet does not hold; the wallet presents its credential anyway | Invalid |
| `T-NONCE-REPLAY` | The `vp_token` of an earlier, accepted run is resubmitted, or a new one is signed over that run's nonce | Invalid |
| `T-EXPIRED` | Certify issues the expired copy of the credential (`FarmerCredential*Expired`) | Valid but expired |

The inspector marks the message that carried the tampered payload and shows a before/after view, and the result card and report say whether the verifier caught the tamper. A tamper refused with another status than expected (for example Rejected at `direct_post` instead of Invalid) passes with a warning; one the verifier accepts fails the run.

### Sequence diagram

In the protocol inspector, **Sequence** shows the run's messages as an animated Mermaid sequence diagram that grows as the run goes; clicking an arrow opens that message underneath. **OpenID4VP** shows the presentation between the verifier, the wallet and the wallet's OpenID4VP library; **Full run** adds issuance.

- Solid arrows were captured by the Protocol Tap (or handed out by the playground as a QR code or link).
- Dashed arrows were **not** captured: the wallet's calls into its own library, and the token and credential requests a phone sends straight to an external issuer such as Hovi or Animo, which the run only knows from the holder's confirmation.
- A tamper shows as a note on the library lane and a red arrow.

The same diagram (full run) is in the Markdown report, and `GET /api/runs/:id/sequence?view=openid4vp|full` returns its Mermaid source.

### History and interoperability matrix

**History** in the sidebar lists every saved run (they survive restarts in the `playground-data` volume). You can filter by issuer, wallet and verifier and their versions, format, run mode, verifier result, verdict, tamper and date. The filters are kept in the URL, so a filtered view can be shared. Each run records the catalog versions it ran against when it was created, so a module upgrade does not rewrite old results.

The **Matrix** tab is the interoperability matrix deliverable: the latest run of each issuer × wallet × verifier × format, with versions, so an upgrade starts a new row. Negative tests (tampers, runs expecting Invalid or Expired) are left out unless included, so each cell answers "does the normal path work". **Export Markdown** downloads it with a link to each run; the API serves the same data at `GET /api/matrix` and `GET /api/matrix.md` (`?includeNegative=true`). `GET /api/runs` takes the same filters as query parameters.

With `pnpm dev` the history starts with a few runs marked **sample**, generated in the browser so the page is not empty; they are labelled everywhere and are not results.

### Test Hovi or Animo issuance in Inji Wallet

1. Start the live Compose stack and open <http://localhost:8100>.
2. Choose **Hovi Playground** or **Animo Playground** as issuer.
3. Choose **Inji Wallet (mobile)** as wallet and any verifier (Issue only does not contact it).
4. Under **What to run**, choose **Issue only**.
5. Choose `dc+sd-jwt` or `mso_mdoc`, select the PID credential and press **Run**.
6. In Inji Wallet, tap **+ → Scan QR code**, scan the offer and accept it.
7. Once the credential is visible, press **I can see the credential in my wallet** on the run page.

The phone communicates with these public issuers directly, outside the local Protocol Tap. The run
therefore records the offer and the holder's explicit confirmation, and labels the inferred token
and credential steps as manual evidence. A successful issue-only run is reported as **Pass with
warnings** so it does not pretend that the unobserved third-party traffic was captured. Format or
OpenID4VCI-profile mismatches remain selectable on purpose: the compatibility panel predicts the
risk, while the run lets the team test whether the wallet actually accepts the offer.

## Getting started

Needs Node 20+ and pnpm.

```sh
pnpm install
pnpm dev          # playground UI on http://localhost:5173, API served by mocks
pnpm test         # unit tests (Vitest)
pnpm e2e          # browser tests against the mocks (Playwright; run `pnpm exec playwright install chromium` once)
```

For live runs start the Compose stack ([`injistack/README.md`](injistack/README.md)) and open <http://localhost:8100>. With the stack up, `PLAYGROUND_LIVE_URL=http://localhost:8100 pnpm e2e` runs the browser tests against it.

| Path                                         | What it is                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`apps/playground-ui`](apps/playground-ui)   | Vite + React UI ([details](apps/playground-ui/README.md))                                                                                   |
| [`apps/playground-bff`](apps/playground-bff) | BFF: catalog, run orchestration, reports, live run events (socket.io) and the Protocol Tap ([details](apps/playground-bff/PROTOCOL_TAP.md)) |
| [`apps/mock-wallet`](apps/mock-wallet)       | Headless wallet (OpenID4VCI + OpenID4VP) for runs without a phone, with tamper switches ([details](apps/mock-wallet/README.md))             |
| [`injistack/`](injistack)                    | Docker Compose sandbox with the Inji stack and the playground ([details](injistack/README.md))                                              |
| [`packages/shared`](packages/shared)         | Domain types, zod schemas, REST and WebSocket contracts shared with the BFF                                                                 |
| [`catalog/`](catalog)                        | One YAML file per issuer / wallet / verifier; adding a product = adding a file                                                              |

## Docs

- [Mandatory tasks explained](docs/mandatory-tasks.md) — what we are building, task by task, in plain language
- [Implementation plan](docs/implementation-plan.md) — architecture, components, flows, infrastructure and schedule

## License

[Mozilla Public License 2.0](LICENSE)

## Interoperability gaps found

Gaps found while running the playground against the pinned stack (Inji Certify `0.14.0`, Inji Verify `0.18.2`, Inji Wallet `1.0.0-alpha.1`, Mimoto `0.21.0`, eSignet `2.0.0`). **Confirmed** means reproduced in a live run, with the messages captured. **Open** means seen but not yet root-caused, or predicted but not yet tested. None has been filed upstream yet.

### Inji Verify `0.18.2`

| # | Gap | Status | Details |
| --- | --- | --- | --- |
| 1 | **Wrong credential type accepted.** The presentation definition asks for one type (`$.vct` / `$.type`); a credential of another type is returned `SUCCESS`. Verify checks the signature but not the input descriptor it asked for. Both `vc+sd-jwt` and `ldp_vc`. | Confirmed (`T-WRONG-TYPE`) | [results](docs/external-credential-interoperability-results.md#replay-and-tamper-runs-against-inji-verify-0182) |
| 2 | **SD-JWT key-binding nonce not checked.** A resubmitted `vp_token`, or a new one whose key-binding JWT is signed over an earlier request's nonce, is accepted. For `ldp_vc` the same tampers are refused at `direct_post` with a nonce error, so only SD-JWT is affected. | Confirmed (`T-NONCE-REPLAY`) | [results](docs/external-credential-interoperability-results.md#replay-and-tamper-runs-against-inji-verify-0182) |
| 3 | **did:web with a port does not resolve.** `did:web:verify.localhost%3A8443:…` fails with `Invalid URL host: <host>%3A8443`; the resolver does not decode the percent-encoded port that the did:web spec requires. Worked around with portless DIDs behind tunnels. | Confirmed | [injistack](injistack/README.md#3-start-the-stack-and-the-tunnels-every-session) |

For 1 and 2 it is not yet known whether the cause is Inji Verify or the `vc-verifier` library it uses, or whether Inji Verify `1.0.x` (DCQL) behaves the same. Both need checking before filing issues.

### Inji Wallet mobile `1.0.0-alpha.1`

| # | Gap | Status | Details |
| --- | --- | --- | --- |
| 4 | **Malformed holder ID in `ldp_vc` presentations.** The VP holder is `did:jwk:…#0#0` (the wallet appends `#0` to a DID URL that already ends in `#0`). Verify rejects it with `Illegal character in fragment`. Issuance and VP submission work; the mobile JSON-LD lane cannot pass. SD-JWT is unaffected. | Confirmed | [injistack](injistack/README.md#test-with-inji-wallet-on-an-android-emulator) |
| 5 | **did:web with a port does not resolve** (same as 3, in the wallet's resolver). | Confirmed | [injistack](injistack/README.md#3-start-the-stack-and-the-tunnels-every-session) |
| 6 | **Expired credential shown as "Valid".** An `ldp_vc` past its `expirationDate` is stored and labelled Valid in the wallet; Inji Verify correctly reports EXPIRED. | Confirmed | [injistack](injistack/README.md#5-other-outcomes) |
| 7 | **An empty `face` claim forces a selfie match.** A credential with a `face` claim, even `""`, cannot be shared until the holder passes a face match. | Confirmed | [injistack](injistack/README.md#troubleshooting) |
| 8 | **OpenID4VCI 1.0 issuers may not be accepted.** The wallet speaks OpenID4VCI draft 13 and `vc+sd-jwt`; the Hovi and Animo playgrounds advertise OpenID4VCI 1.0 metadata (nonce endpoint) and `dc+sd-jwt`. Offers are created and fetched correctly, but the wallet import has not been tested on a phone yet. `mso_mdoc` is the closer match. | Open (predicted) | [results](docs/external-credential-interoperability-results.md) |
| 9 | **Needs a hardware-backed keystore.** On an emulator (software keystore only) the app can hang during onboarding, so testing needs a local patch or a physical phone. | Confirmed | [injistack](injistack/README.md#2-build-and-install-the-app-once) |

### Inji Certify `0.14.0`

| # | Gap | Status | Details |
| --- | --- | --- | --- |
| 10 | **SD-JWT is issued only as `vc+sd-jwt`.** Current SD-JWT VC issuers and wallets (Hovi, Animo, EUDI) use `dc+sd-jwt`, so Certify's SD-JWT credentials and theirs do not match by format identifier. | Confirmed | [catalog](catalog/inji-certify.yaml) |

### Inji Web, Mimoto `0.21.0` and eSignet `2.0.0`

| # | Gap | Status | Details |
| --- | --- | --- | --- |
| 11 | **Credential download fails with `invalid_client`.** After a successful eSignet login, Mimoto's token request is rejected with `401 invalid_client: Invalid client assertion`, so the request never reaches Certify. The client, key and audience have been checked and ruled out; hand-signed assertions are rejected too. Mimoto also reports the failure as `Exception occurred while generating pdf`, which hides the real cause. | Open (root cause unknown) | [injistack](injistack/README.md#current-local-web-wallet-limitation) |
