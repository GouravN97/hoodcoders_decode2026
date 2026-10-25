# CLAUDE.md

## Project

**Inji Interop Playground** — MOSIP Decode 2026, Problem Statement 02 (Inji). A web app where a user picks an **issuer**, a **wallet** and a **verifier**, picks a credential format, and runs a live **issue → hold → present → verify** cycle while watching every protocol message. Each run ends with a pass/fail interoperability report.

Inji products per role: **Inji Certify** (issuer), **Inji Wallet** mobile app / **Inji Web** backed by **Mimoto** (wallet), **Inji Verify** (verifier).

## Reference docs — read the relevant one before starting work

| Doc | Contents |
| --- | --- |
| [`docs/mandatory-tasks.md`](docs/mandatory-tasks.md) | Plain-language explanation of the seven mandatory tasks, glossary, done-criteria, order of work, open team questions |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Full design: architecture, Protocol Tap, repo layout, domain model, class catalogue, flows, data model and APIs, compliance checks, tamper catalogue, test matrix, infra/networking, CI, schedule, risks |

## The seven mandatory tasks

| # | Task | Plan section |
| --- | --- | --- |
| 1 | Run Inji Certify, a wallet (Mimoto + Inji Web / Inji Wallet) and Inji Verify end-to-end | §15 |
| 2 | Three-column Issuer / Wallet / Verifier selector, driven by a catalog, plus BFF | §8.2, §9 |
| 3 | Live OpenID4VCI issuing: offer, token exchange, credential | §4.3–4.4, §10.1–10.2 |
| 4 | Live OpenID4VP present & verify → Valid / Invalid / Valid-but-Expired | §10.3 |
| 5 | Protocol inspector: every message, raw and decoded | §8.2, §9.3 |
| 6 | Two formats end-to-end: `ldp_vc` and SD-JWT (`vc+sd-jwt`) | §7.1 formats |
| 7 | Pass/fail report per run (issuer, wallet, verifier, format, proof type, outcome, error) | §6, §8.2 |

Task 1 is the critical path. Tasks 2, 5 and 7 can be built against mocks/fake data. All seven lanes work (the mobile `ldp_vc` `#0#0` and Inji Web `invalid_client` gaps are documented findings), so good-to-have work started on 25 October 2026, one PR per item: tamper mode, sequence diagram, history, mock verifier, mDoc, same-device / DC API.

## Key design decisions (summary of plan §1)

- **D1 Protocol Tap:** a recording reverse proxy is the public face of every Inji module; host-based routing (`certify.<domain>`, `verify.<domain>`, …). Modules' own public-URL properties point at the tap — never rewrite responses.
- **D2 Adapters:** one adapter per implementation behind `IssuerAdapter` / `WalletAdapter` / `VerifierAdapter`, each with a capability descriptor in `catalog/*.yaml`. Adding a product = one class + one YAML entry.
- **D3 Evidence-driven runs:** XState v5 machine per run; steps complete on adapter, tap or manual evidence.
- **D4 Compliance checks + differential verification** over captured payloads.
- **D5 Headless mock wallet** for CI, tamper and repeatable demos.
- **D6 One `docker compose`** with profiles; all config rendered from a single `.env`.

## Stack and conventions

- pnpm workspaces + Turborepo, TypeScript 5 strict, zod for every schema crossing a process boundary.
- `apps/`: `playground-ui` (Vite + React + Tailwind), `playground-bff` (NestJS), `protocol-tap` (Fastify), `mock-issuer`, `mock-verifier`, `mock-wallet`.
- `packages/`: `shared` (domain types), `protocol-core`, `compliance-checks`, `interop-cli`.
- Tests: Vitest (unit), Supertest (BFF API), Playwright (UI e2e).
- License: MPL-2.0 (matches the Inji projects).

## Gotchas

- Anything marked ⚠️ in the plan is unverified against pinned image tags — confirm before coding.
- Inji repos moved from `github.com/mosip/*` to `github.com/inji/*`.
- Inji Verify ≤ 0.18.x uses Presentation Exchange; 1.0.x uses DCQL. Inji Wallet's `inji-openid4vp` is documented against draft 23 / `presentation_definition` — test this pairing early.
- Certify issues SD-JWT as `vc+sd-jwt` only; newer systems use `dc+sd-jwt`.
- `mosip.certify.domain.url` must equal the tap's public hostname, or signatures, `aud` and did:web break.
- The phone cannot reach `localhost`: use tunnel mode with stable hostnames. `MIMOTO_HOST` is baked into the Inji Wallet build.
- Never commit `.env`, `infra/rendered/`, `infra/certs/` or Mimoto key files.
- Redact secrets in captured traffic by default; use mock identity data only.
