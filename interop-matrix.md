# Inji interoperability matrix

Generated 2026-11-07T23:48:05.748Z from 8 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid)](http://localhost:8100/runs/8d750d48-0197-4045-ba4b-f6c51a6055cb) |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://localhost:8100/runs/4d196bc9-d01f-490b-a084-1e520c3f91bd) | [✅ Pass (issued)](http://localhost:8100/runs/340c52a8-d93d-4d73-b6ad-6597b4047fbb) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab |  | [✅ Pass (Valid)](http://localhost:8100/runs/bf3cce0b-803c-4dfe-a3c3-b2b4987ecf3b) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/d8a548b7-7efe-42d7-a41b-0f18f19ba04f) | [✅ Pass (Valid) · 2/2 passed](http://localhost:8100/runs/38062523-b198-448c-bca5-74830dcbcaa8) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid)](http://localhost:8100/runs/d38d80e4-8903-4f8d-88d1-506b4ce7831d) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
