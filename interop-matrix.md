# Inji interoperability matrix

Generated 2026-11-01T23:45:33.430Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/4b0ee494-f095-4c0b-b4a9-2d407a18918d) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/e89c078e-f1e9-44ad-b292-b1bf17300dfe) | [✅ Pass (issued)](http://localhost:8100/runs/def747dd-6b62-4add-8251-62fe46850617) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/0838e5df-dbd1-468c-917b-d7ccbe498940) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/8bbc92f7-61ec-43d7-a7fa-21bc00fe2d3e) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/8d9ce654-0865-4cf0-95d1-86cf8de9c2cb) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/e2af7bb7-216a-4501-840f-2ab2f4ca9290) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
