# Inji interoperability matrix

Generated 2026-11-10T02:52:32.172Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/3ade35d1-86ff-44e0-b559-a97e4d79cf3c) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/d0b3fdee-9349-43e1-ab44-5f8e7e817d8c) | [✅ Pass (issued)](http://localhost:8100/runs/280aba36-305d-410b-a5b2-aa149eda4d69) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/2c9c8571-dd53-4fb7-b107-83f6cf8f4b51) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/38e88854-4abe-45a0-aeb1-ede676156d82) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/0c1535f4-115e-4cf5-aced-59dd8ebbbf72) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/ddfe8a43-c8d7-4ae3-b245-b62d663f87a2) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
