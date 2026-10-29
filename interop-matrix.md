# Inji interoperability matrix

Generated 2026-10-29T00:10:07.105Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/345b92a8-1860-427d-9370-4f443b6ea91c) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/013b0ea7-4b4b-4a4f-91a9-0b077b13e58d) | [✅ Pass (issued)](http://localhost:8100/runs/f82cbe77-e4f3-4537-8966-cd4baf81bb1d) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/4d917ba0-1e1a-4077-a1b6-8fae0ebb14ff) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [❌ Fail (no result)](http://localhost:8100/runs/6f71f154-78f2-4f05-8e21-81b43273320b) | [✅ Pass (Valid) · 1/2 passed](http://localhost:8100/runs/b28e3de8-3d33-4edc-ab95-b51eed7ccbf0) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/afde6cb6-8978-476d-9010-fdfe07159661) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
