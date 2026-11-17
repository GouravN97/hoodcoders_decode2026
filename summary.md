# Interop suite: nightly

**Passed** — 30 lanes: 27 pass · 3 known gap.

Run from 2026-11-17T03:02:58.407Z to 2026-11-17T03:03:52.995Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [78bfda5f](http://localhost:8100/runs/78bfda5f-fee4-4959-ad80-536173562b9f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | valid path | Valid | Valid | Pass | ✅ pass | [af4597b1](http://localhost:8100/runs/af4597b1-8634-41aa-88f3-4789c271caf3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [9c58a3b4](http://localhost:8100/runs/9c58a3b4-630c-4a12-bd77-6fece2c8c725?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [6e6d76b6](http://localhost:8100/runs/6e6d76b6-b5a9-48e3-9df4-9debbe5c98e3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [82abfa4b](http://localhost:8100/runs/82abfa4b-d525-4bd0-8e23-222a4e626e5d?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [f49d69ae](http://localhost:8100/runs/f49d69ae-452b-432c-b93c-8361ed68e33b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [3abab7d6](http://localhost:8100/runs/3abab7d6-5da2-4684-9b4b-fef4df3c49a3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [36923cbe](http://localhost:8100/runs/36923cbe-66eb-42c7-92cd-9197e9cc28f6?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [2235853a](http://localhost:8100/runs/2235853a-b202-4740-8aeb-fc195579b6be?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [a144a55c](http://localhost:8100/runs/a144a55c-90c6-4f71-abad-cf50630e5d93?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [366c2873](http://localhost:8100/runs/366c2873-4207-49e4-ae53-4456eb76bcce?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [a5e7d677](http://localhost:8100/runs/a5e7d677-6808-4922-9cef-650a25d8a11d?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [cbf652d9](http://localhost:8100/runs/cbf652d9-8f59-44e7-9d91-82460898d318?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [803edb51](http://localhost:8100/runs/803edb51-c277-4355-ae0b-c6b77269c7ee?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [72b9f135](http://localhost:8100/runs/72b9f135-4d5f-41ba-a490-fa569bcdf2f3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [f82bb87b](http://localhost:8100/runs/f82bb87b-a569-4bb4-96ea-c362acaa8aa6?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [1e309976](http://localhost:8100/runs/1e309976-ca60-4801-8a1f-682207a6adac?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [e6053260](http://localhost:8100/runs/e6053260-98d6-4cad-b6c5-9a0f115dbcfb?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [811bace4](http://localhost:8100/runs/811bace4-9b66-4f41-b3bc-397dd6e47533?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [743c95be](http://localhost:8100/runs/743c95be-8388-4cc3-9ef7-792ec6d5c2ca?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [e0cd2fdb](http://localhost:8100/runs/e0cd2fdb-d295-4b68-bc72-e1738c51fd7d?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [dbca14f1](http://localhost:8100/runs/dbca14f1-29d6-4c1f-bc78-4bd5c1015fb0?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [9b848498](http://localhost:8100/runs/9b848498-44bf-406e-94d7-6941bf322cf3?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [c057dffe](http://localhost:8100/runs/c057dffe-de47-4c98-85fc-f9b91f9cfcc2?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [9be95faa](http://localhost:8100/runs/9be95faa-d339-49f3-9e80-6b77b0e6724f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [57168468](http://localhost:8100/runs/57168468-fe1d-4c04-ae11-53220c77f38b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [46bbcdbb](http://localhost:8100/runs/46bbcdbb-f291-4dbe-b1c1-74fc7963a6fa?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Rejected | Pass with warnings | ✅ pass | [0e75ab89](http://localhost:8100/runs/0e75ab89-2ee6-405c-bcd3-f8a5c07176ab?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [9cb12476](http://localhost:8100/runs/9cb12476-0273-4ac8-80f5-92d3b3ca747b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [75232c8e](http://localhost:8100/runs/75232c8e-edb7-444d-8c62-0732a00bdf10?view=inspector) |

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
