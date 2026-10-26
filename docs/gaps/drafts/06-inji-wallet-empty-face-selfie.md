<!-- target: inji/inji-wallet · gap 7 -->

# An empty `face` claim forces a selfie match before sharing

### Summary

When a credential has a `face` claim, Inji Wallet `1.0.0-alpha.1` asks the holder to pass a face match before it shares the credential, even when the claim is an empty string. There is no face to match, so the holder cannot share the credential.

### Environment

| Module | Version |
| --- | --- |
| Inji Wallet (Android emulator) | 1.0.0-alpha.1 |
| Inji Certify | 0.14.0, a Farmer credential template with `"face": ""` |

### Steps to reproduce

1. Issue a credential with `"face": ""` in `credentialSubject` to Inji Wallet.
2. Share it with a verifier.

### Expected

Share with selfie is required only when `face` contains an image the wallet can match against.

### Actual

The wallet starts the face match and does not share the credential without it. With the `face` claim removed from the template, the credential shares normally.
