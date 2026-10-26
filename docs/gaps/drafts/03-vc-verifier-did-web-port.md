<!-- target: inji/vc-verifier · gap 3 (and 5: Inji Wallet's did:web resolver behaves the same) -->

# did:web resolver does not percent-decode a port (`did:web:host%3A8443`)

### Summary

`DidWebPublicKeyResolver` builds the DID document URL from the method-specific id without percent-decoding it, so a `did:web` with a port cannot be resolved. Every credential signed by an issuer at a non-default port then fails verification. In Inji Verify `0.18.2` an `ldp_vc` from such an issuer is reported **INVALID**.

### Environment

| Module | Version |
| --- | --- |
| Inji Verify (verify-service, with its bundled vc-verifier) | 0.18.2 |
| Inji Certify (issuer) | 0.14.0, issuer DID `did:web:certify.localhost%3A8443` |

### Steps to reproduce

1. Run an issuer whose DID document is served at `https://certify.localhost:8443/.well-known/did.json` and set its DID to `did:web:certify.localhost%3A8443`.
2. Issue an `ldp_vc` (Ed25519Signature2020) with `verificationMethod` `did:web:certify.localhost%3A8443#<key-id>`.
3. Present or verify it with Inji Verify.

In the [Inji Interop Playground](https://github.com/GouravN97/hoodcoders_decode2026), set `CERTIFY_DID=did:web:certify.localhost%3A8443` in `injistack/.env`, run `make up`, then run the lane `inji-certify → mock-wallet → inji-verify · ldp_vc` with `make interop`.

### Expected

The DID resolves. The [did:web specification](https://w3c-ccg.github.io/did-method-web/#read-resolve) says to percent-decode the port's colon: `did:web:certify.localhost%3A8443` resolves to `https://certify.localhost:8443/.well-known/did.json`.

### Actual

```
ERROR i.m.v.v.k.t.did.DidWebPublicKeyResolver : Error fetching DID document: Network request failed with error response - Invalid URL host: "certify.localhost%3A8443"
ERROR i.m.v.v.k.t.did.DidWebPublicKeyResolver : Error fetching public key: Network request failed with error response - Invalid URL host: "certify.localhost%3A8443"
```

`vpResultStatus: FAILED`, `verificationStatus: INVALID` (playground run `93d3d8b1`, 26 October 2026). With the DID changed to `did:web:certify.localhost` (no port), the same lane verifies **SUCCESS** (run `60c3d82d`).

Inji Wallet `1.0.0-alpha.1` fails the same way when it resolves a verifier's `did:web` client id with a port (`Invalid URL host: "<host>%3A8443"`). If the wallet uses this library, one fix covers both.

### Suggested fix

Percent-decode the host part (`%3A` → `:`) before building the URL, as `did:web` resolvers such as `web-did-resolver` do.
