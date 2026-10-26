<!-- gap signature: tamper-accepted|inji-verify@0.18.2|T-NONCE-REPLAY -->
<!-- target: inji/inji-verify · category: interop · 9 run(s) -->

# Inji Verify 0.18.2 accepts a presentation with T-NONCE-REPLAY (replayed presentation)

### Summary

Inji Verify 0.18.2 accepts a presentation with T-NONCE-REPLAY (replayed presentation), seen in 9 runs of Inji Certify → Mock wallet → Inji Verify (`vc+sd-jwt`, tamper `T-NONCE-REPLAY`).

### Environment

| Role | Module | Version |
| --- | --- | --- |
| issuer | Inji Certify | 0.14.0 |
| wallet | Mock wallet | 0.1.0 |
| verifier | Inji Verify | 0.18.2 |

Run in the [Inji Interop Playground](https://github.com/GouravN97/hoodcoders_decode2026) local stack (pinned images, `injistack/docker-compose.yml`).

### Steps to reproduce

1. `make up` with the versions above.
2. Save this as `repro.yaml` and run `make interop MATRIX=repro.yaml`:

```yaml
name: repro
include:
  - { issuer: inji-certify, wallet: mock-wallet, verifier: inji-verify, format: vc+sd-jwt, credentialConfigurationId: FarmerCredentialSdJwt, mode: full, tamper: { id: T-NONCE-REPLAY }, expectedOutcome: INVALID }
```

### Expected

The verifier rejects the presentation. The wallet answers with a vp_token from an earlier run, or signs a new one over an earlier run's nonce. Expected result: Invalid.

### Actual

The verifier returned Valid.

### Evidence (redacted)

Captured by the playground's Protocol Tap in run `fc23ebaf-e54d-4882-9419-bd6b30a1d007` (2026-10-26T05:02:32.907Z). Secrets are masked; identity data is mock data.

**GET https://verify.localhost:8443/v1/verify/vp-request/req_a1242958-592a-4af2-ab11-0f1419701553** → 200 (`oid4vp.request_object`)

Response:

```
JWT payload:
{
  "response_uri": "https://verify.localhost:8443/v1/verify/vp-submission/direct-post",
  "iss": "did:web:verify.localhost%3A8443:v1:verify",
  "response_type": "vp_token",
  "presentation_definition": {
    "id": "FarmerCredentialSdJwt",
    "purpose": "Interop playground run fc23ebaf: present the FarmerCredentialSdJwt credential",
    "input_descriptors": [
      {
        "id": "FarmerCredentialSdJwt",
        "format": {
          "vc+sd-jwt": {
            "sd-jwt_alg_values": [
              "ES256"
            ]
          }
        },
        "constraints": {
          "fields": [
            {
              "path": [
                "$.vct"
              ],
              "filter": {
                "type": "string",
                "pattern": "FarmerCredentialSdJwt"
              }
            }
          ]
        }
      }
    ]
  },
  "state": "req_a1242958-592a-4af2-ab11-0f1419701553",
  "iat": 1792990953,
  "nonce": "9ecb6ab5fdcaf97f160c500e3085f6b4",
  "client_id": "did:web:verify.localhost%3A8443:v1:verify",
  "jti": "3b6e79ea-81cf-435e-bef4-f27f37c3cc1d",
  "client_metadata": {
    "client_name": "did:web:verify.localhost%3A8443:v1:verify",
    "vp_formats": {
      "ldp_vp": {
        "proof_type": [
          "Ed25519Signature2018",
          "Ed25519Signature2020",
          "RsaSignature2018"
        ]
      },
      "vc+sd-jwt": {
        "sd-jwt_alg_values": [
          "RS256",
          "ES256",
          "ES256K",
          "EdDSA"
     
… (176 more characters)
```

**POST https://verify.localhost:8443/v1/verify/vp-submission/direct-post** → 200 (`oid4vp.response`)

Tampered by the playground (T-NONCE-REPLAY): Resubmitted a vp_token captured in an earlier run to this new request

Request:

```
vp_token: eyJ4NXQjUzI1NiI6IlVwTW1yazhHZTl4Ulc0N2VEMzlCOFNmWE9SdzlzRlVpbThueWhUY2NSZFEiLCJ4NWMiOlsiTUlJREVEQ0NBZmlnQXdJQkFnSUlROFhrZnp0UDMwY3dEUVlKS29aSWh2Y05BUUVMQlFBd2VERUxNQWtHQTFVRUJoTUNTVTR4Q3pBSkJnTlZCQWdNQWt0Qk1SSXdFQVlEVlFRSERBbENRVTVIUVV4UFVrVXhEakFNQmdOVkJBb01CVWxKU1ZSQ01SY3dGUVlEVlFRTERBNUZXRUZOVUV4RkxVTkZUbFJGVWpFZk1CMEdBMVVFQXd3V2QzZDNMbVY0WVcxd2JHVXVZMjl0SUNoU1QwOVVLVEFlRncweU5qRXdNak14TkRFMU1E… (5923 characters)

Key-binding JWT payload:
{
  "nonce": "60279a506883c7415ec97a4c4e1d11b6",
  "sd_hash": "7sapfKYpGsUo5-e4CcjVpq8RfX62AYeflrbw_TBbODc",
  "aud": "did:web:verify.localhost%3A8443:v1:verify",
  "iat": 1792990932
}

presentation_submission: {"id":"c0dbaeab-b341-472e-8483-4f81efbeb045","definition_id":"FarmerCredentialSdJwt","descriptor_map":[{"id":"FarmerCredentialSdJwt","format":"vc+sd-jwt","path":"$"}]}

state: req_a1242958-592a-4af2-ab11-0f1419701553
```

Response:

```
{}
```

**GET https://verify.localhost:8443/v1/verify/vp-result/txn_fc23ebafe54d48829419bd6b30a1d007** → 200 (`verify.result`)

Response:

```
{"transactionId":"txn_fc23ebafe54d48829419bd6b30a1d007","vpResultStatus":"SUCCESS","vcResults":[{"vc":"eyJ4NXQjUzI1NiI6IlVwTW1yazhHZTl4Ulc0N2VEMzlCOFNmWE9SdzlzRlVpbThueWhUY2NSZFEiLCJ4NWMiOlsiTUlJREVEQ0NBZmlnQXdJQkFnSUlROFhrZnp0UDMwY3dEUVlKS29aSWh2Y05BUUVMQlFBd2VERUxNQWtHQTFVRUJoTUNTVTR4Q3pBSkJnTlZCQWdNQWt0Qk1SSXdFQVlEVlFRSERBbENRVTVIUVV4UFVrVXhEakFNQmdOVkJBb01CVWxKU1ZSQ01SY3dGUVlEVlFRTERBNUZXRUZOVUV4RkxVTkZUbFJGVWpFZk1CMEdBMVVFQXd3V2QzZDNMbVY0WVcxd2JHVXVZMjl0SUNoU1QwOVVLVEFlRncweU5qRXdNak14TkRFMU1EZGFGdzB5T1RFd01qSXhOREUxTURkYU1JR2JNUXN3Q1FZRFZRUUdFd0pKVGpFTE1Ba0dBMVVFQ0F3Q1MwRXhFakFRQmdOVkJBY01DVUpCVGtkQlRFOVNSVEVPTUF3R0ExVUVDZ3dGU1VsSlZFSXhGekFWQmdOVkJBc01Ea1ZZUVUxUVRFVXRRMFZPVkVWU01VSXdRQVlEVlFRREREbDNkM2N1WlhoaGJYQnNaUzVqYjIwZ0tFTkZVbFJKUmxsZlZrTmZVMGxIVGw5RlExOVNNUzFGUTE5VFJVTlFNalUyVWpGZlUwbEhUaWt3V1RBVEJnY3Foa2pPUFFJQkJnZ3Foa2pPUFFNQkJ3TkNBQVNuTHdnRGo2bFBxTTAyM1kzcmhUOCt1aUFrOVViODkyekJoYjFQT1EyaU9JWHZGd1YyR3VuZkhnck1DemlIODJiVUdxTXRNeEw4WTRMeHVIM2hJazRJbzBVd1F6QVNCZ05WSFJNQkFmOEVDREFHQVFIL0FnRUJNQjBHQTFVZERnUVdCQlJSY2k1MWFBTFo1cE45Q1pMcU5Mcm9EV0ZhZURBT0JnTlZIUThCQWY4RUJBTUNBb1F3RFFZSktvWklodmNOQVFFTEJRQURnZ0VCQUpPNzVwUERkeGdWZXJ2MmQ2M1ZiRmZXdkkxRVZiaUZlNHpsNzltZDRXSCtZbXV1Rm1ialkzS1Qzck5UR0RQd25NM04rNldxck9Lbkh4c0NheFFkak9lcDlCUXVLcXZuU2wxQ0xOOE9rNkF1K0JqTEdyenNLM0wwNDFabVBINjRGTDFMV1NUb3ZOaXRuOEg1MDJnYzRJMkRZNmd1SDZSREtVNkVnQXU3eExDZ3hiS2FqYVlyRVVqejczanYrRll6L3RFYVpRWXNhNlFnRi9MWjhza0E3WTZrK2w5cEx2dENIaEZpUW4yQUdRYzBBNHJzQzA5bTBDZlZtY2EzZ0Q1WG5sMXZtZ1krUVVpSlc4UzA1Q
… (4561 more characters)
```

### Occurrences

- `fc23ebaf-e54d-4882-9419-bd6b30a1d007` 2026-10-26T05:02:32.907Z · `vc+sd-jwt` · FAIL
- `10988bb1-f495-4963-9afd-2352bbdfd80f` 2026-10-26T05:00:07.731Z · `vc+sd-jwt` · FAIL
- `d6732ec8-d944-40c1-940b-0ff2d031c676` 2026-10-26T04:55:41.892Z · `vc+sd-jwt` · FAIL
- `9caac14f-63a9-4d12-be6d-2f3aafac6f1d` 2026-10-25T16:37:16.032Z · `vc+sd-jwt` · FAIL
- `8762c0f8-8d14-40a3-a6ab-c7222ad83ba9` 2026-10-25T08:18:15.409Z · `vc+sd-jwt` · FAIL
- `6277c81c-ffa6-4678-a51b-61291e7a4256` 2026-10-25T08:18:13.363Z · `vc+sd-jwt` · FAIL
- `aeb3a1a0-be7f-4b78-ba4e-520a5c7e4806` 2026-10-25T08:16:25.858Z · `vc+sd-jwt` · FAIL
- `620ee79d-5313-4a4d-aaa1-dadf6d677340` 2026-10-25T08:14:54.994Z · `vc+sd-jwt` · FAIL
- `616a613a-7726-44a0-b53b-cf5bce06b9f8` 2026-10-25T08:14:52.947Z · `vc+sd-jwt` · FAIL
