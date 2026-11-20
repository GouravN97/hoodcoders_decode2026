# Inji interoperability matrix

Generated 2026-11-20T01:52:03.862Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/6f09d71b-c85e-4b4a-9b03-c9c5d99af396) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/09fd81fd-48df-495b-acf6-d232b7889761) | [✅ Pass (issued)](http://localhost:8100/runs/462ed580-f5d3-4b15-b764-df1b6bf7dc43) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/4357a818-a69b-4661-8444-f73282a405fd) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/7c41b635-8849-43b6-a780-c7a1e3b72c71) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/19c9919a-4493-49ed-b896-7be7e1b7d236) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/23824f46-8df9-47bd-b788-1192fc549c25) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
