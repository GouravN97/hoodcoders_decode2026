# Inji interoperability matrix

Generated 2026-10-26T06:15:58.401Z from 100 finished runs. Each cell is the latest run of that combination; negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works. Versions are the ones the catalog reported when the run was created.

| Issuer | Wallet | Verifier | JSON-LD VC (`ldp_vc`) | SD-JWT VC (`vc+sd-jwt`) | mDoc / mDL (`mso_mdoc`) |
| --- | --- | --- | --- | --- | --- |
| Animo Playground live | Inji Wallet (mobile) 1.0.0-alpha.1 | — (issue only) |  |  | [⚠️ Pass with warnings (issued)](http://localhost:8100/runs/c27b9223-aa77-4327-9145-69616177a01c) |
| Hovi Playground live | Inji Wallet (mobile) 1.0.0-alpha.1 | — (issue only) |  |  | [⚠️ Pass with warnings (issued) · 1/3 passed](http://localhost:8100/runs/edc9709e-50e3-4813-939b-43945cfa501e) |
| Inji Certify (mock mDoc) 0.14.0 | Inji Wallet (mobile) 1.0.0-alpha.1 | — (issue only) |  |  | [❌ Fail (not issued) · 0/2 passed](http://localhost:8100/runs/714478ff-ce8e-41ce-8473-9f98604ccc07) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 |  |  | [➖ Known unsupported (no result)](http://localhost:8100/runs/a87fc6f9-8cb4-4f66-ba95-15930afc820a) |
| Inji Certify (mock mDoc) 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  |  | [✅ Pass (Valid) · 8/8 passed](http://localhost:8100/runs/86e4ab48-0ebb-4572-b4a1-5a158ca210c1) |
| Inji Certify 0.14.0 | Inji Wallet (mobile) 1.0.0-alpha.1 | Inji Verify 0.18.2 | [✅ Pass (Valid)](http://localhost:8100/runs/33d84bb6-6e06-4634-be16-140d881d1fa0) | [❌ Fail (no result) · 1/2 passed](http://localhost:8100/runs/96fba6d8-481e-4cef-b60b-8d674c4c151b) |  |
| Inji Certify 0.14.0 | Inji Wallet (mobile) 1.0.0-alpha.1 | Mock verifier 0.1.0 |  | [✅ Pass (Valid) · 2/3 passed](http://localhost:8100/runs/3a088eec-6bcb-4380-86ba-7519880d3f06) |  |
| Inji Certify 0.14.0 | Inji Wallet (mobile) unknown | Inji Verify 0.18.2 | [✅ Pass (Valid) · 1/7 passed](http://localhost:8100/runs/2e946c94-59d4-4e43-9a26-d3439f6a8c7c) | [✅ Pass (Valid) · 2/4 passed](http://localhost:8100/runs/5ef9723d-3ee7-4a4a-bcd4-8203d2c3398d) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued) · 5/5 passed](http://localhost:8100/runs/f7f80020-b824-43d4-8e4a-532e98fd8f32) | [✅ Pass (issued) · 4/4 passed](http://localhost:8100/runs/969a196e-3ee9-485d-9ff8-6a31cb709f90) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify (MOSIP Collab) collab | [❌ Fail (Invalid)](http://localhost:8100/runs/85a82f6b-a7e4-4c9c-9d1d-ffc708e5f7af) | [✅ Pass (Valid) · 3/3 passed](http://localhost:8100/runs/90cc3d85-d726-4898-9729-0b7cedfeb265) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [✅ Pass (Valid) · 10/14 passed](http://localhost:8100/runs/8579f7fb-ec78-4f80-856c-0dadf45d3601) | [✅ Pass (Valid) · 30/31 passed](http://localhost:8100/runs/023c8d3c-5acb-49c7-bb1c-dd3b1e04d4f5) |  |
| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Mock verifier 0.1.0 |  | [✅ Pass (Valid) · 10/10 passed](http://localhost:8100/runs/194779bf-7e44-465b-a28c-80f61bf3eeb0) |  |

Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.
