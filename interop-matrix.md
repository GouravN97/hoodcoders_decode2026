# Inji interoperability matrix

Generated 2026-11-27T03:02:26.252Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/a014b644-da49-402b-b3d5-fca605f35c36) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/f5df6c6d-e732-4281-8969-d1b578cadf04) | [✅ Pass (issued)](http://localhost:8100/runs/0cf3b755-cb94-42b6-9576-a71a512e26a9) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/f90f1f88-35e2-4721-80ed-751e733ec26b) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/694c5dcc-8dcf-4517-98f6-696453b24cb2) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/b2e2603e-788d-4215-bf50-e211d0a004bb) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/2f6227cc-f263-4e35-bd59-9b4947c3d287) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
