# Inji interoperability matrix

Generated 2026-11-05T00:59:48.136Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/0d794297-ca03-4deb-a8f8-f2f72cd2f366) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/442faeca-7690-45f3-adfa-131cd4883d97) | [✅ Pass (issued)](http://localhost:8100/runs/7e154c1f-2115-43ef-a1f3-35ba5207354c) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/bedc00a9-7e95-4786-9265-964f64e87f63) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/64ac3da1-2914-49f6-8d93-87cbc2cb3001) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/0144b42a-31fb-4d6a-9795-81be3a3cd475) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/17f65fe1-b4a1-4d49-bf1e-0dfb1164b5dd) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
