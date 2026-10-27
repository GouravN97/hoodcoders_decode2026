# Inji interoperability matrix

Generated 2026-10-27T00:01:24.744Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/685c3bba-5c5b-4fce-a23b-83501bbd8630) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/30eb1d97-943b-425d-92c9-a65123fd7306) | [✅ Pass (issued)](http://localhost:8100/runs/c26c73e7-343c-474a-b3fa-aaa857caee15) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/6009e777-ef16-43fe-aa5e-274f8dcf3f94) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/25cb0add-51b0-4e2a-ac94-0bb4480bfb23) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/6ad1189c-e6c1-4440-a5cc-2403965b062a) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/fc42c81b-c1c2-4aa8-84db-d69b454cad5f) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
