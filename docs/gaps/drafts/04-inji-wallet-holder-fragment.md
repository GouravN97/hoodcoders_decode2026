<!-- target: inji/inji-wallet (Android, OpenID4VP) · gap 4 · related: inji/inji-wallet#2619 (iOS holder ID sanitization) -->

# ldp_vc presentation: holder built as `credentialSubject.id + "#0"` becomes `…#0#0`

### Summary

For an `ldp_vc`, Inji Wallet `1.0.0-alpha.1` sets the presentation's `holder` from the credential's `credentialSubject.id` with `#0` appended. When the subject id is already a DID URL with a fragment, the holder becomes `did:jwk:…#0#0`, which is not a valid URI. Inji Verify rejects the presentation (`Illegal character in fragment`). Inji Certify fills the subject id from `${_holderId}`, which is `did:jwk:…#0` for a `did:jwk` proof key, so this hits every Certify `ldp_vc` whose template uses that value unchanged.

### Environment

| Module | Version |
| --- | --- |
| Inji Wallet (Android emulator, API 37) | 1.0.0-alpha.1 |
| Inji Certify | 0.14.0, pre-authorized code, `ldp_vc` Ed25519Signature2020 |
| Inji Verify | 0.18.2 |

### Steps to reproduce

1. Issue an `ldp_vc` whose `credentialSubject.id` is `did:jwk:<holder key>#0` to Inji Wallet.
2. Present it to Inji Verify over OpenID4VP (cross-device QR).

### Expected

The VP `holder` is the holder's DID (`did:jwk:<holder key>`), and the proof's `verificationMethod` is that DID plus its key fragment, without adding a fragment to a DID URL that already has one.

### Actual

`holder: did:jwk:<holder key>#0#0`. Inji Verify answers `vpResultStatus: FAILED` with `Illegal character in fragment` (playground run `139b5a05`, 24 October 2026). When the issuer template strips the fragment from the subject id, the same lane verifies **VALID** (runs `2e946c94`, `33d84bb6`).

### Notes

[inji-wallet#2619](https://github.com/inji/inji-wallet/issues/2619) changes holder ID handling while constructing the VP on iOS. The Android flow may need the same review. Deriving the holder from the wallet's own key, not from the credential subject, would avoid the problem for any issuer.
