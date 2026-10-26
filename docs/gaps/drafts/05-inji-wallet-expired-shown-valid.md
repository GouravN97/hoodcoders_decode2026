<!-- target: inji/inji-wallet · gap 6 -->

# Expired ldp_vc is stored and labelled "Valid"

### Summary

Inji Wallet `1.0.0-alpha.1` accepts an `ldp_vc` whose `expirationDate` is in the past and shows it with the **Valid** status. When it is presented, Inji Verify correctly reports **EXPIRED**, so the holder learns that the credential has expired only when the verifier rejects it.

### Environment

| Module | Version |
| --- | --- |
| Inji Wallet (Android emulator) | 1.0.0-alpha.1 |
| Inji Certify | 0.14.0, `FarmerCredentialExpired` (`ldp_vc`, Ed25519Signature2020, `expirationDate` 2025-01-01) |
| Inji Verify | 0.18.2 |

### Steps to reproduce

1. Issue an `ldp_vc` with an `expirationDate` in the past (genuinely signed) to Inji Wallet.
2. Open the card in the wallet.
3. Present it to Inji Verify.

### Expected

The wallet marks the card as expired when it is downloaded or displayed (VC Data Model 1.1 `expirationDate`), as it does for other status problems.

### Actual

The card shows **Valid**. Inji Verify returns **EXPIRED** for the same credential.
