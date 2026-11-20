# Interop suite: nightly

**Passed** — 30 lanes: 27 pass · 3 known gap.

Run from 2026-11-20T01:51:17.697Z to 2026-11-20T01:52:03.826Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [f0414543](http://localhost:8100/runs/f0414543-4597-4add-a9d5-5522544bb80e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | valid path | Valid | Valid | Pass | ✅ pass | [7c41b635](http://localhost:8100/runs/7c41b635-8849-43b6-a780-c7a1e3b72c71?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [23824f46](http://localhost:8100/runs/23824f46-8df9-47bd-b788-1192fc549c25?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [462ed580](http://localhost:8100/runs/462ed580-f5d3-4b15-b764-df1b6bf7dc43?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [09fd81fd](http://localhost:8100/runs/09fd81fd-48df-495b-acf6-d232b7889761?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [19c9919a](http://localhost:8100/runs/19c9919a-4493-49ed-b896-7be7e1b7d236?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [d12929c9](http://localhost:8100/runs/d12929c9-66a0-4962-833e-470dde6b68bf?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [91285f8a](http://localhost:8100/runs/91285f8a-5e8b-4f0b-853f-55292edfa778?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [b53911f2](http://localhost:8100/runs/b53911f2-0175-48fd-9ffe-5490e1bc5415?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [e2393246](http://localhost:8100/runs/e2393246-804b-4ef8-a8fb-0e1496008ee2?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [04ecb1ec](http://localhost:8100/runs/04ecb1ec-eac7-4516-a0d9-2df83ac60f6f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [f506898f](http://localhost:8100/runs/f506898f-5daf-445e-b4fd-72fcfafa68a0?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [9ebf608d](http://localhost:8100/runs/9ebf608d-7568-4cca-900c-21032b6f195e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [ed425643](http://localhost:8100/runs/ed425643-ad56-4232-b4e8-809c9fdef876?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [089f4290](http://localhost:8100/runs/089f4290-0084-4db1-b1c8-f356a31dec05?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [51a533f5](http://localhost:8100/runs/51a533f5-60dd-47be-b0a1-f554f817f38b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [68b537b4](http://localhost:8100/runs/68b537b4-7cf4-4e67-9d95-3e573734ce38?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [c47d05fc](http://localhost:8100/runs/c47d05fc-30cd-441e-a47d-00760b15db07?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [eb52a51c](http://localhost:8100/runs/eb52a51c-8c9a-44e0-98b1-56f23921cbd5?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [607174bc](http://localhost:8100/runs/607174bc-5665-4ab1-babd-3cbc4034e874?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [4d08f50d](http://localhost:8100/runs/4d08f50d-2a0c-4545-9414-27cb560f80e2?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [6f09d71b](http://localhost:8100/runs/6f09d71b-c85e-4b4a-9b03-c9c5d99af396?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [33dfd0f4](http://localhost:8100/runs/33dfd0f4-554d-4714-bf17-57e5c744a349?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [195e6dc3](http://localhost:8100/runs/195e6dc3-2039-479b-964d-52a2f47cf737?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [4357a818](http://localhost:8100/runs/4357a818-a69b-4661-8444-f73282a405fd?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [b207a944](http://localhost:8100/runs/b207a944-e691-4db6-a365-956f84b5a620?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [7417d92c](http://localhost:8100/runs/7417d92c-36c7-43f4-a45c-005502ee34ea?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [9d6e331c](http://localhost:8100/runs/9d6e331c-a0c7-40ee-bdd3-f9f30baea5fc?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [50305226](http://localhost:8100/runs/50305226-075c-41b6-80c1-a33ce54ce784?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [9aede79b](http://localhost:8100/runs/9aede79b-2ea8-4076-b9cc-14a5fcb946fe?view=inspector) |

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
