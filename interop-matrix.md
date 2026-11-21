# Inji interoperability matrix

Generated 2026-11-21T01:40:49.722Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/10edd493-8a14-4d17-a237-2c206a54f3ab) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/425ae119-7d83-4c20-ab2d-1feb927f4262) | [✅ Pass (issued)](http://localhost:8100/runs/cf1ef634-07f2-4b29-b709-88375ba96f29) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/b879d0da-d12e-4ad8-b34f-df7b500dbc0b) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/e5cbca7f-53d4-4ce5-82fa-c92ff16fbee5) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/73290979-1c54-486b-a96c-2c94c7718c3c) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/ef0b76f6-a519-4b72-8eca-c7348e2fd3d6) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
