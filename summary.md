# Interop suite: nightly

**Passed** — 30 lanes: 27 pass · 3 known gap.

Run from 2026-11-25T03:39:18.391Z to 2026-11-25T03:40:08.853Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [e04aeeca](http://localhost:8100/runs/e04aeeca-3f4b-4577-9db4-476a1a19caad?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | valid path | Valid | Valid | Pass | ✅ pass | [5f8dece0](http://localhost:8100/runs/5f8dece0-6835-4615-ba18-5e3b4bc865de?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [0d013704](http://localhost:8100/runs/0d013704-0bf4-4119-88dc-b32cf1060d7c?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [4517e701](http://localhost:8100/runs/4517e701-1c9b-4e56-9cca-4a6dd1de15fc?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [e3c34226](http://localhost:8100/runs/e3c34226-c781-4c5c-96ed-ba258f4fe24e?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [48c06227](http://localhost:8100/runs/48c06227-fd14-48de-a43c-ce3940a1d61f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [a5f00db8](http://localhost:8100/runs/a5f00db8-d3f1-4b3c-82f7-48b13a4b35d0?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [3f0fc169](http://localhost:8100/runs/3f0fc169-ea03-4a7f-a901-9fe26eefd18a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [27714de5](http://localhost:8100/runs/27714de5-e8fc-442a-aa58-d050d67f83ac?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [c12257c3](http://localhost:8100/runs/c12257c3-1c77-43b2-a8c1-881282afb5c3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [ad73ee7a](http://localhost:8100/runs/ad73ee7a-c16f-489c-b1a9-0bfe235cbc0a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [b759b0cb](http://localhost:8100/runs/b759b0cb-8e06-4843-9aa5-97679b6451d9?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [59396545](http://localhost:8100/runs/59396545-6b2b-4cc3-ac7f-3045e3c880e9?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [de1832b8](http://localhost:8100/runs/de1832b8-a9dc-48dc-94b1-32689a35596f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [46fdc6c0](http://localhost:8100/runs/46fdc6c0-75a0-41a8-b56d-3c0ebae4f68f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [54dfc5b8](http://localhost:8100/runs/54dfc5b8-f640-4b21-adcc-69b1d15a8916?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [a4f1d333](http://localhost:8100/runs/a4f1d333-53d3-4bef-9c7e-6a2e80f52c6e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [3c680fa9](http://localhost:8100/runs/3c680fa9-8d1e-49aa-8d64-554cdd2a8100?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [e2f8021a](http://localhost:8100/runs/e2f8021a-43a2-498a-b4c1-a0fafb4971b6?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [833da201](http://localhost:8100/runs/833da201-d293-4faf-8322-1b1d732fd1bc?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [18c4388f](http://localhost:8100/runs/18c4388f-6759-46aa-b82a-365fe94b6b96?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [809f9b59](http://localhost:8100/runs/809f9b59-0bea-4b2c-9d76-dcf405cc4f0c?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [2837005d](http://localhost:8100/runs/2837005d-9f0c-4873-b366-9d596ae98363?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [9b0b5b0e](http://localhost:8100/runs/9b0b5b0e-ad60-4092-9d8f-57121f41c68c?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [29c5bfa6](http://localhost:8100/runs/29c5bfa6-dfba-4a9f-94d8-510314ece621?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [e949831d](http://localhost:8100/runs/e949831d-4309-411d-9fb2-f9a00d10d806?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [51406935](http://localhost:8100/runs/51406935-6126-4307-bd2c-2735f29bcbd2?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [2dfc6fe3](http://localhost:8100/runs/2dfc6fe3-8b7b-4444-86ca-bc6e47e80dbd?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [c0b30c58](http://localhost:8100/runs/c0b30c58-72de-4f3f-a526-0cada8b586a0?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [c9271503](http://localhost:8100/runs/c9271503-24ef-4e52-ac5e-d4c6d5e87704?view=inspector) |

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
