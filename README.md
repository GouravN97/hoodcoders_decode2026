# Inji Interop Playground

Team **hoodcoders** · MOSIP Decode 2026 · Problem Statement 02 (Inji)

A web playground that tests whether a verifiable credential can be **issued** by one system, **held** by another and **verified** by a third, and shows every protocol message exchanged along the way.

Pick an issuer, a wallet and a verifier, choose a credential format, press **Run**, and watch a live issue → hold → present → verify cycle (OpenID4VCI + OpenID4VP). Every run ends with a pass/fail interoperability report.

| Role | Starting implementation |
| --- | --- |
| Issuer | Inji Certify |
| Wallet | Inji Wallet (mobile), Inji Web (+ Mimoto) |
| Verifier | Inji Verify |

Supported credential formats (target): W3C VC JSON-LD (`ldp_vc`) and SD-JWT VC.

## Status

Live runs work end to end: [`injistack/`](injistack) starts Inji Certify, Inji Verify, the playground UI, the BFF with its Protocol Tap and a headless mock wallet with Docker Compose. A run issues a real credential from Certify (pre-authorized code), the wallet presents it to Inji Verify over OpenID4VP, every message passes through the tap and shows in the inspector, and the run ends with a pass/fail report.

| Lane | State |
| --- | --- |
| Certify → mock wallet → Inji Verify, SD-JWT (`vc+sd-jwt`) | Valid and tampered (Invalid) runs pass, in the browser and over the API |
| Certify → mock wallet → Inji Verify, JSON-LD (`ldp_vc`) | Built; needs internet access for the JSON-LD contexts, not yet run against the real stack |
| Certify → Inji Wallet (Android app, `v1.0.0-alpha.1`) → Inji Verify | SD-JWT (`vc+sd-jwt`) verifies **VALID** on an emulator through Cloudflare quick tunnels. JSON-LD issuance and VP submission reach Verify, but the pinned Wallet/OpenID4VP dependency emits `did:jwk:...#0#0`, so Verify rejects the presentation. |
| Inji Web | Mimoto, Inji Web and the eSignet login work once the keystore and `wallet-demo` client are set up ([`register-wallet-client.sh`](injistack/scripts/register-wallet-client.sh)); the download still fails because eSignet rejects the client assertion with `invalid_client` ([details and what was ruled out](injistack/README.md#current-local-web-wallet-limitation)) |
| Valid-but-expired | `FarmerCredentialExpired` (ldp_vc) and `FarmerCredentialSdJwtExpired` (vc+sd-jwt) are signed with validity in the past; Inji Verify reports **EXPIRED** |

The reproducible passing demonstrations are SD-JWT with the mock wallet
(including tampered/Invalid runs) and SD-JWT with the mobile Wallet. The mobile
JSON-LD result is a documented compatibility limitation of the pinned Wallet
release, not a Certify or Docker-stack failure.

The UI also still runs entirely against in-browser mocks with `pnpm dev`.

### Run modes

Issuing and verifying are separate parties, so each half can run on its own. Pick one under **What to run** in the run settings:

| Mode | Phases | Talks to |
| --- | --- | --- |
| Full cycle | issue → hold → present → verify | issuer, wallet, verifier |
| Issue only | issue → hold; passes once the credential is in the wallet | issuer, wallet |
| Present & verify only | hold → present → verify, using a credential the wallet already holds | wallet, verifier |

For present-only runs the mock wallet lists what earlier runs stored in it, so you can pick a credential (it forgets them when its container restarts). With Inji Wallet on a phone or Inji Web, you confirm on the run screen that the credential is already in the wallet. Present-only is the easiest way to test the verifier while the issuer is down, or to present an already-expired credential for **Valid-but-expired**.

## Getting started

Needs Node 20+ and pnpm.

```sh
pnpm install
pnpm dev          # playground UI on http://localhost:5173, API served by mocks
pnpm test         # unit tests (Vitest)
pnpm e2e          # browser tests against the mocks (Playwright; run `pnpm exec playwright install chromium` once)
```

For live runs start the Compose stack ([`injistack/README.md`](injistack/README.md)) and open <http://localhost:8100>. With the stack up, `PLAYGROUND_LIVE_URL=http://localhost:8100 pnpm e2e` runs the browser tests against it.

| Path | What it is |
| --- | --- |
| [`apps/playground-ui`](apps/playground-ui) | Vite + React UI ([details](apps/playground-ui/README.md)) |
| [`apps/playground-bff`](apps/playground-bff) | BFF: catalog, run orchestration, reports, live run events (socket.io) and the Protocol Tap ([details](apps/playground-bff/PROTOCOL_TAP.md)) |
| [`apps/mock-wallet`](apps/mock-wallet) | Headless wallet (OpenID4VCI + OpenID4VP) for runs without a phone, with tamper switches ([details](apps/mock-wallet/README.md)) |
| [`injistack/`](injistack) | Docker Compose sandbox with the Inji stack and the playground ([details](injistack/README.md)) |
| [`packages/shared`](packages/shared) | Domain types, zod schemas, REST and WebSocket contracts shared with the BFF |
| [`catalog/`](catalog) | One YAML file per issuer / wallet / verifier; adding a product = adding a file |

## Docs

- [Mandatory tasks explained](docs/mandatory-tasks.md) — what we are building, task by task, in plain language
- [Implementation plan](docs/implementation-plan.md) — architecture, components, flows, infrastructure and schedule

## License

[Mozilla Public License 2.0](LICENSE)
