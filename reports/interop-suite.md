# Interop suite: nightly

**Passed** — 24 lanes: 21 pass · 3 known gap.

Run from 2026-10-26T05:02:01.316Z to 2026-10-26T05:02:44.013Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [e10796b0](http://localhost:8100/runs/e10796b0-0b33-475e-8dc4-32fa521bbef1?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | valid path | Valid | Valid | Pass | ✅ pass | [cf1cbee6](http://localhost:8100/runs/cf1cbee6-a936-4979-a175-f85f6554d832?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [13925496](http://localhost:8100/runs/13925496-39fb-4770-9d9b-34446ca87d29?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [17c5fd82](http://localhost:8100/runs/17c5fd82-b1ad-46ad-af8c-3fbc2937dcf1?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [3422be1c](http://localhost:8100/runs/3422be1c-d7ff-4737-b0b6-eefcedecd5cd?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [465f189d](http://localhost:8100/runs/465f189d-5c2a-41d7-9d95-ac47979e79f7?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [e01e6682](http://localhost:8100/runs/e01e6682-e759-4b49-9a27-ea5b6b3db0c8?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [ac2da9ec](http://localhost:8100/runs/ac2da9ec-9875-4fa2-9717-2d9056e87da3?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [1ae6e1e1](http://localhost:8100/runs/1ae6e1e1-5246-4ebb-9682-50dd095635e7?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [18f33a80](http://localhost:8100/runs/18f33a80-97ea-40a8-985c-03bfab0b7216?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [8e643220](http://localhost:8100/runs/8e643220-7e91-4bbb-95d4-46d114d96bf7?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [00142c8f](http://localhost:8100/runs/00142c8f-b2ed-4ef2-8f22-9644fac1ce04?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [b1d0f6cb](http://localhost:8100/runs/b1d0f6cb-1958-4e0d-b675-ac9c10c3130e?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [d5ca1ffa](http://localhost:8100/runs/d5ca1ffa-edb7-49d3-8159-7175763b6f2b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [fc23ebaf](http://localhost:8100/runs/fc23ebaf-e54d-4882-9419-bd6b30a1d007?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [a731d458](http://localhost:8100/runs/a731d458-39f4-42c6-ad07-761e2e3d0e99?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [1fd48f24](http://localhost:8100/runs/1fd48f24-a7e7-4203-979e-e6a304cbd241?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [ed59a323](http://localhost:8100/runs/ed59a323-1880-42d0-9b94-297858939ab9?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [95431c14](http://localhost:8100/runs/95431c14-1966-43c6-8063-2396bf0359da?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [78a9dd3b](http://localhost:8100/runs/78a9dd3b-bf89-4027-9da5-b77ee27c2f02?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [07510ec6](http://localhost:8100/runs/07510ec6-3f2a-4cd1-b64d-e11b32dcb7cf?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [7b059762](http://localhost:8100/runs/7b059762-86c9-40f0-824c-0dd1cf17f31d?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [ff68e9d3](http://localhost:8100/runs/ff68e9d3-9c86-4d85-b78f-e7794e7ba55c?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [a29aed82](http://localhost:8100/runs/a29aed82-d572-4e14-be3e-b3e8a95edaf8?view=inspector) |

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
