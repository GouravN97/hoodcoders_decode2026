# Interop suite: nightly

**Passed** — 30 lanes: 27 pass · 3 known gap.

Run from 2026-11-27T03:01:35.547Z to 2026-11-27T03:02:26.205Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [ed5544a6](http://localhost:8100/runs/ed5544a6-0a0a-4f28-9b5d-73cc27b9b302?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | valid path | Valid | Valid | Pass | ✅ pass | [694c5dcc](http://localhost:8100/runs/694c5dcc-8dcf-4517-98f6-696453b24cb2?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [2f6227cc](http://localhost:8100/runs/2f6227cc-f263-4e35-bd59-9b4947c3d287?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [0cf3b755](http://localhost:8100/runs/0cf3b755-cb94-42b6-9576-a71a512e26a9?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [f5df6c6d](http://localhost:8100/runs/f5df6c6d-e732-4281-8969-d1b578cadf04?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [b2e2603e](http://localhost:8100/runs/b2e2603e-788d-4215-bf50-e211d0a004bb?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [25d0c497](http://localhost:8100/runs/25d0c497-51a9-4799-8fe3-56d22be7c792?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [00826bf8](http://localhost:8100/runs/00826bf8-1275-4da7-8d3f-cab0be542acd?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [8fd462a8](http://localhost:8100/runs/8fd462a8-1ea8-4551-8ea1-d7d076ca6556?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [9f10a953](http://localhost:8100/runs/9f10a953-c357-45de-a4ac-e997094eaf85?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [7bd8e16e](http://localhost:8100/runs/7bd8e16e-9fe0-4f56-af9a-887211baf56a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [afaccbfd](http://localhost:8100/runs/afaccbfd-6c19-425a-a9c3-b315c9588cb6?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [6a33abee](http://localhost:8100/runs/6a33abee-386d-42f5-9a7a-96dee4168d60?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [45530004](http://localhost:8100/runs/45530004-138b-4484-8021-fd65964d0830?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [c9ddfa75](http://localhost:8100/runs/c9ddfa75-5e57-4957-9be7-f3b45af4e50e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [b1359e6f](http://localhost:8100/runs/b1359e6f-ff1e-4682-b19c-89baf7601b8a?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [be68b632](http://localhost:8100/runs/be68b632-c9cf-4751-90ad-605ce8646e28?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [f31f5b1d](http://localhost:8100/runs/f31f5b1d-3e80-4a3d-b63e-a81daf1a942b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [0f02a694](http://localhost:8100/runs/0f02a694-e6ba-4639-82bd-4ac914baf2f6?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [4a931b12](http://localhost:8100/runs/4a931b12-de68-4b76-b921-80ec7348e485?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [ad16b305](http://localhost:8100/runs/ad16b305-2834-41d1-9cf8-9d6c5a339f9f?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [a014b644](http://localhost:8100/runs/a014b644-da49-402b-b3d5-fca605f35c36?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [e781a024](http://localhost:8100/runs/e781a024-cff2-4191-8b39-dded51af48ad?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [8d703a57](http://localhost:8100/runs/8d703a57-51b6-4d5f-b390-8e22f8feaf1e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [f90f1f88](http://localhost:8100/runs/f90f1f88-35e2-4721-80ed-751e733ec26b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [b0b5c6c9](http://localhost:8100/runs/b0b5c6c9-8bcb-43d9-bb75-dede2d3db19d?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [0ad00666](http://localhost:8100/runs/0ad00666-d028-4129-8c1f-b3291770264e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [62eab9dd](http://localhost:8100/runs/62eab9dd-2f9a-46ed-b59a-5e36ca3794ab?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [42b49c78](http://localhost:8100/runs/42b49c78-71d6-4a55-b0b7-e5940d2a2e06?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [a6ac63d2](http://localhost:8100/runs/a6ac63d2-71d6-4e0c-977c-66c9cd735dbc?view=inspector) |

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
