# Inji interoperability matrix

Generated 2026-11-16T00:07:53.996Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/b2657889-1c33-4dea-a9d5-a32f23593574) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/c3fc4857-0e2a-4d7b-987c-290ef0ae3b1f) | [✅ Pass (issued)](http://localhost:8100/runs/07b021cf-fb88-4291-b497-daa478b29695) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/c6abae8b-bd78-4c26-8278-25a47d476b7a) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/c88d9aee-2840-4df1-a4f2-53b146e6e0ba) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/1eaa6006-0d6f-4ef5-9f93-c88cd10dcbd9) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/35e71601-d1f3-4691-8f28-1e2af19b3192) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
