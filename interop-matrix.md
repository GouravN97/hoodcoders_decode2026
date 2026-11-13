# Inji interoperability matrix

Generated 2026-11-13T01:19:29.969Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/48cd7e6e-5e02-4fc8-be1f-bae45c48eb09) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/0962d283-6b60-4c5b-951b-5cffd9ddb921) | [✅ Pass (issued)](http://localhost:8100/runs/7d898f10-33c3-4ad8-a244-d9e044bdd1a6) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/8e1e38db-afe0-4dc2-ae11-ef922ba3e9ae) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/20d74bb6-c815-4928-9799-806e7000d024) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/68f2ba34-2a8e-449b-804d-3669f25d7d12) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/53cfc032-0c85-4ef6-a09f-6bade9930585) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
