# Inji interoperability matrix

Generated 2026-11-15T00:02:45.612Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/dd31d29c-dea9-411a-95fc-11f2b1b84a06) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/58f15a33-4778-4ce8-b378-e657f46b4141) | [✅ Pass (issued)](http://localhost:8100/runs/bdd63442-9119-42ac-80a6-2fe2ac4d3b0a) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/dcfa57a5-d45c-4b93-98ae-92422a1e7c4e) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/c1973f20-23e9-44d0-b330-b402bf0ba31c) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/11bbbafc-aee1-4b19-bf90-875d986c5553) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/18cfd1ac-b204-44e6-a464-9fc0fac7d0c2) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
