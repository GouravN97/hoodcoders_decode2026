# Inji interoperability matrix

Generated 2026-11-12T02:00:13.581Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/493d2501-f668-4c13-b371-291fa7e5d976) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/c1c30d58-384f-456a-838e-f5a5a85bac92) | [✅ Pass (issued)](http://localhost:8100/runs/eaded81f-7b1b-42e3-bdf3-24e69045e5f8) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/6347cfa6-4b3f-417e-8777-5a2f8b9299f9) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/bda0b27e-0ffe-496d-be25-a424a0da9303) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/29e6c1a4-2c9b-4e01-9822-4f0a80bf9b34) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/9f6da532-2c1c-404e-a774-9420b9c54f14) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
