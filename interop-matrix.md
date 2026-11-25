# Inji interoperability matrix

Generated 2026-11-25T03:40:08.886Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/809f9b59-0bea-4b2c-9d76-dcf405cc4f0c) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/e3c34226-c781-4c5c-96ed-ba258f4fe24e) | [✅ Pass (issued)](http://localhost:8100/runs/4517e701-1c9b-4e56-9cca-4a6dd1de15fc) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/29c5bfa6-dfba-4a9f-94d8-510314ece621) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/5f8dece0-6835-4615-ba18-5e3b4bc865de) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/48c06227-fd14-48de-a43c-ce3940a1d61f) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/0d013704-0bf4-4119-88dc-b32cf1060d7c) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
