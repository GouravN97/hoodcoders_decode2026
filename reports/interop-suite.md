# Interop suite: nightly

**Passed** — 30 lanes: 27 pass · 3 known gap.

Run from 2026-10-26T06:15:10.903Z to 2026-10-26T06:15:58.348Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [eec385ec](http://localhost:8100/runs/eec385ec-6d1e-4202-b22c-12e97cdd23f5?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | valid path | Valid | Valid | Pass | ✅ pass | [8579f7fb](http://localhost:8100/runs/8579f7fb-ec78-4f80-856c-0dadf45d3601?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [194779bf](http://localhost:8100/runs/194779bf-7e44-465b-a28c-80f61bf3eeb0?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [969a196e](http://localhost:8100/runs/969a196e-3ee9-485d-9ff8-6a31cb709f90?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [f7f80020](http://localhost:8100/runs/f7f80020-b824-43d4-8e4a-532e98fd8f32?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [023c8d3c](http://localhost:8100/runs/023c8d3c-5acb-49c7-bb1c-dd3b1e04d4f5?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [7c63391e](http://localhost:8100/runs/7c63391e-0c04-40f3-ac1e-21f91f9181a2?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [0eab61d7](http://localhost:8100/runs/0eab61d7-3df1-4e69-9563-8e734f82ee42?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [bbe04c66](http://localhost:8100/runs/bbe04c66-9a6f-46ba-8cf0-3f879734570c?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [f4f089fd](http://localhost:8100/runs/f4f089fd-7d0a-461d-9d2a-fabbb1c68c1d?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [9d5125b7](http://localhost:8100/runs/9d5125b7-b048-4edc-883f-6b584ae63c9a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [77956e8f](http://localhost:8100/runs/77956e8f-e275-44f7-96f9-7ba982278ad4?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [9476fb57](http://localhost:8100/runs/9476fb57-b3c4-4d54-be99-e11318116239?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [513e6ef6](http://localhost:8100/runs/513e6ef6-4785-4b16-b4a9-ed9d786d899a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [6f399103](http://localhost:8100/runs/6f399103-e792-4cb1-b30f-084614d03712?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [2aa78ed0](http://localhost:8100/runs/2aa78ed0-4331-4a5e-b8ce-5c4d354371c3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [fa88072f](http://localhost:8100/runs/fa88072f-b56c-4d6d-9dc3-a1308a2c1f6b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [b3adc187](http://localhost:8100/runs/b3adc187-c1d9-4362-b28d-5448f1d181ab?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [a8ba373f](http://localhost:8100/runs/a8ba373f-506e-45bf-ac13-64b5dafaf5ea?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [f98b6a31](http://localhost:8100/runs/f98b6a31-ce64-4003-ab44-42ed3e9fc993?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [51d9b205](http://localhost:8100/runs/51d9b205-c037-40d5-87e0-ea8f144d65fd?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [86e4ab48](http://localhost:8100/runs/86e4ab48-0ebb-4572-b4a1-5a158ca210c1?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [89354cb2](http://localhost:8100/runs/89354cb2-6ae4-45f6-9fbf-fa6c78cd49a8?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [314821df](http://localhost:8100/runs/314821df-2cc1-4538-99e9-fe38ea4fef1a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [90cc3d85](http://localhost:8100/runs/90cc3d85-d726-4898-9729-0b7cedfeb265?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [d00907b7](http://localhost:8100/runs/d00907b7-373f-4621-8bfe-002934a64642?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [213692c6](http://localhost:8100/runs/213692c6-e25d-45e8-96f2-f413ab06cc97?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Rejected | Pass with warnings | ✅ pass | [bde7f848](http://localhost:8100/runs/bde7f848-448e-42be-985c-d111bb801872?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [798a34b0](http://localhost:8100/runs/798a34b0-3d4f-4050-b9ed-538a293c21ad?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [8f86b70a](http://localhost:8100/runs/8f86b70a-d2ef-4f28-9d24-71194079464b?view=inspector) |

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
