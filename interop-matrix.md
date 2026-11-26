# Inji interoperability matrix

Generated 2026-11-26T02:59:40.213Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/6c9ab91e-7ceb-48b9-885e-e5467d535b8f) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/6f538abb-9120-4884-b65a-86bc1fcc5a7b) | [✅ Pass (issued)](http://localhost:8100/runs/bf7a5317-0bd8-4b94-bcf2-91123cfdf0f3) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/b5e5c4a9-8ac8-49d8-9e60-b3ae9ddbbf28) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/fef0a80e-0897-40be-a963-2864b29275e3) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/e44ceef4-7df9-4914-a9ac-1cb1a68814cc) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/4f4e8710-f566-4ef5-84a9-03e10bea35f6) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
