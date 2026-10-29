# Interop suite: nightly

**Failed** — 30 lanes: 24 pass · 2 fail · 3 known gap · 1 error.

Run from 2026-10-29T00:09:22.606Z to 2026-10-29T00:10:07.057Z against http://localhost:8101. Versions are the ones the catalog reported for each run.

| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | — | valid path | Valid | — | Fail | ❌ fail | [7f0cbbc6](http://localhost:8100/runs/7f0cbbc6-395a-4b53-8f8a-ca44602764e4?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | — | valid path | Valid | — | Fail | ❌ fail | [6f71f154](http://localhost:8100/runs/6f71f154-78f2-4f05-8e21-81b43273320b?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [afde6cb6](http://localhost:8100/runs/afde6cb6-8978-476d-9010-fdfe07159661?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | SD-JWT VC | ES256 | issue-only | Valid | — | Pass | ✅ pass | [f82cbe77](http://localhost:8100/runs/f82cbe77-e4f3-4537-8966-cd4baf81bb1d?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue-only) | JSON-LD VC | Ed25519Signature2020 | issue-only | Valid | — | Pass | ✅ pass | [013b0ea7](http://localhost:8100/runs/013b0ea7-4b4b-4a4f-91a9-0b077b13e58d?view=inspector) |
| — (present-only) | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | present-only | Valid | Valid | Pass | ✅ pass | [b28e3de8](http://localhost:8100/runs/b28e3de8-3d33-4edc-ab95-b51eed7ccbf0?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [469a15fe](http://localhost:8100/runs/469a15fe-82d3-413f-a857-64887ca31b69?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [e8f58da3](http://localhost:8100/runs/e8f58da3-68b5-4ba6-b586-8314e02cd1ef?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [71f67ca9](http://localhost:8100/runs/71f67ca9-b717-4b60-b9ff-fd7ae2bf01b1?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [fa309dd9](http://localhost:8100/runs/fa309dd9-9093-4b42-bc7d-41dfe99bf6df?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [a5d9e11e](http://localhost:8100/runs/a5d9e11e-c051-41e5-bf0a-b40042529f28?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [2b6c1577](http://localhost:8100/runs/2b6c1577-cbf0-48aa-8d3f-c1c0bc08579f?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [c5e9b837](http://localhost:8100/runs/c5e9b837-c563-4b67-9669-ceaee57ad418?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | JSON-LD VC | Ed25519Signature2020 | T-WRONG-TYPE | Invalid | Valid | Fail | 🟠 known gap | [11660712](http://localhost:8100/runs/11660712-7763-4ccf-84c4-471cf79deadc?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Valid | Fail | 🟠 known gap | [f595bd58](http://localhost:8100/runs/f595bd58-dbaa-4952-b14a-5fd398b847f5?view=inspector) |
| inji-certify | mock-wallet | inji-verify | JSON-LD VC | — | T-NONCE-REPLAY | Invalid | — | — | 💥 error | — |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [b1339cbf](http://localhost:8100/runs/b1339cbf-0270-4a47-8c2c-cac74d0571ad?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [ae706349](http://localhost:8100/runs/ae706349-3e08-4bbe-a574-7110826cb120?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Invalid | Pass | ✅ pass | [a3fe92e5](http://localhost:8100/runs/a3fe92e5-c57f-4b2b-8246-06615a9db7c4?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Invalid | Pass | ✅ pass | [c720ed21](http://localhost:8100/runs/c720ed21-0523-417c-9120-b160ca97d939?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [01e98a3e](http://localhost:8100/runs/01e98a3e-fea7-4ec2-a728-b20c23d17fb2?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | valid path | Valid | Valid | Pass | ✅ pass | [345b92a8](http://localhost:8100/runs/345b92a8-1860-427d-9370-4f443b6ea91c?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [1aa66db7](http://localhost:8100/runs/1aa66db7-2a58-48e1-a76b-b08add0b6076?view=inspector) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 | mDoc / mDL | — | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [cd9cad78](http://localhost:8100/runs/cd9cad78-430c-498b-91aa-643c0bb294ae?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | valid path | Valid | Valid | Pass | ✅ pass | [4d917ba0](http://localhost:8100/runs/4d917ba0-1e1a-4077-a1b6-8fae0ebb14ff?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-SIG-FLIP | Invalid | Invalid | Pass | ✅ pass | [085b3710](http://localhost:8100/runs/085b3710-3a58-4705-b3b6-efed38e1e30d?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-CLAIM-EDIT | Invalid | Invalid | Pass | ✅ pass | [31278751](http://localhost:8100/runs/31278751-2d84-48ae-908a-9c1f2c8afe78?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-WRONG-TYPE | Invalid | Rejected | Pass with warnings | ✅ pass | [1e89a2c9](http://localhost:8100/runs/1e89a2c9-362c-47e4-bf5b-0e086ef4ec84?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-NONCE-REPLAY | Invalid | Rejected | Pass with warnings | ✅ pass | [0df18eeb](http://localhost:8100/runs/0df18eeb-29bb-42e3-b440-ed07b10c23a5?view=inspector) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | SD-JWT VC | ES256 | T-EXPIRED | Valid but expired | Valid but expired | Pass | ✅ pass | [9b872527](http://localhost:8100/runs/9b872527-a636-4760-a4d4-ae14db484416?view=inspector) |

## Failures

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt**: observed no result, expected Valid; at oid4vci.credential: Credential issued failed: POST https://certify.localhost:8443/v1/certify/issuance/credential answered HTTP 500 (HTTP 500)
- **inji-certify → mock-wallet → inji-verify · ldp_vc**: observed no result, expected Valid; at oid4vci.credential: Credential issued failed: POST https://certify.localhost:8443/v1/certify/issuance/credential answered HTTP 400 (HTTP 400)
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-NONCE-REPLAY · expect INVALID**: POST /api/runs?trigger=nightly: 400 No earlier untampered JSON-LD VC run passed this verifier, so there is no vp_token to replay. Run a normal full run first.

## Known gaps

- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · ldp_vc · T-WRONG-TYPE · expect INVALID** (gap 1: Inji Verify accepts a wrong credential type): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
- **inji-certify → mock-wallet → inji-verify · vc+sd-jwt · T-NONCE-REPLAY · expect INVALID** (gap 2: Inji Verify does not check the SD-JWT key-binding nonce): still present — observed Valid, expected Invalid; at verify.result: Expected INVALID, verifier returned VALID
