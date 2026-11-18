# Inji interoperability matrix

Generated 2026-11-18T02:32:57.108Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/c9fcc33b-4e0d-4f86-bedb-afc0c80f008f) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/e53a058c-a224-4d97-b537-bbe5d7cfd6d7) | [✅ Pass (issued)](http://localhost:8100/runs/75586211-9089-4110-baff-071eab3a7f71) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/f9e1ec7e-9468-4e84-9b12-612fb69568bb) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/b915f29b-3f01-46ea-8ae6-17057cddb65f) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/444f6e6d-f728-49bc-9162-e3cca2975512) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/bce4cdd7-7a39-4d8f-bfdf-0e92a68afd2d) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
