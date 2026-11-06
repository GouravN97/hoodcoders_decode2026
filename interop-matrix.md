# Inji interoperability matrix

Generated 2026-11-06T01:03:02.045Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/c667be14-5c30-44f5-a1df-a7451d197029) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/db358887-c562-46ad-8b6a-618f26fc4244) | [✅ Pass (issued)](http://localhost:8100/runs/6202f184-9e4e-448c-b3fc-270931718d2b) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/9e7c127e-1f17-408b-8bfb-ab3e40e64183) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/7c3055d4-abf2-4cc6-8518-ec8d8fcdc3f0) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/f3134e03-eb31-48b3-9f1d-9657aec887c4) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/851a7689-f13f-457b-98da-207a8dd05de3) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
