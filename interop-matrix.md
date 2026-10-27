# Inji interoperability matrix

Generated 2026-10-27T23:57:15.344Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/70a967be-1dc3-467e-9be7-689f11e22401) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/0b108fd6-e6c3-4537-bb56-3480b83372b5) | [✅ Pass (issued)](http://localhost:8100/runs/62b01575-c3ae-4f02-b4ab-ec7a5514d2dd) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/594cb6fc-d230-4aff-ab7c-804c7c536396) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/3bca7eac-97ba-4dd5-895d-cc0f72418d8f) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/3b8eb3a3-1314-44d9-9b4f-d42e7abd91fc) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/556419a0-550b-471d-8bbc-3ff64dd8069a) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
