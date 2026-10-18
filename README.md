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

Planning stage — no code yet.

## Docs

- [Mandatory tasks explained](docs/mandatory-tasks.md) — what we are building, task by task, in plain language
- [Implementation plan](docs/implementation-plan.md) — architecture, components, flows, infrastructure and schedule

## License

[Mozilla Public License 2.0](LICENSE)
