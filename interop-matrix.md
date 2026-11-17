# Inji interoperability matrix

Generated 2026-11-17T03:03:53.037Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/dbca14f1-29d6-4c1f-bc78-4bd5c1015fb0) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/82abfa4b-d525-4bd0-8e23-222a4e626e5d) | [✅ Pass (issued)](http://localhost:8100/runs/6e6d76b6-b5a9-48e3-9df4-9debbe5c98e3) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/9be95faa-d339-49f3-9e80-6b77b0e6724f) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/af4597b1-8634-41aa-88f3-4789c271caf3) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/f49d69ae-452b-432c-b93c-8361ed68e33b) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/9c58a3b4-630c-4a12-bd77-6fece2c8c725) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
