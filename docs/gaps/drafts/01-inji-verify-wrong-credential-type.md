<!-- gap signature: tamper-accepted|inji-verify@0.18.2|T-WRONG-TYPE -->
<!-- target: inji/inji-verify · category: interop · 10 run(s) -->

# Inji Verify 0.18.2 accepts a presentation with T-WRONG-TYPE (wrong credential type)

### Summary

Inji Verify 0.18.2 accepts a presentation with T-WRONG-TYPE (wrong credential type), seen in 10 runs of Inji Certify → Mock wallet → Inji Verify (`ldp_vc`, `vc+sd-jwt`, tamper `T-WRONG-TYPE`).

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
  - { issuer: inji-certify, wallet: mock-wallet, verifier: inji-verify, format: ldp_vc, credentialConfigurationId: FarmerCredential, mode: full, tamper: { id: T-WRONG-TYPE }, expectedOutcome: INVALID }
```

### Expected

The verifier rejects the presentation. The verifier asks for a credential type the wallet does not hold, and the wallet presents its credential anyway. Expected result: Invalid.

### Actual

The verifier returned Valid.

### Evidence (redacted)

Captured by the playground's Protocol Tap in run `d5ca1ffa-edb7-49d3-8159-7175763b6f2b` (2026-10-26T05:02:28.889Z). Secrets are masked; identity data is mock data.

**GET https://verify.localhost:8443/v1/verify/vp-request/req_bf567a7a-eb17-4973-bb18-92da98633cb5** → 200 (`oid4vp.request_object`)

Response:

```
JWT payload:
{
  "response_uri": "https://verify.localhost:8443/v1/verify/vp-submission/direct-post",
  "iss": "did:web:verify.localhost%3A8443:v1:verify",
  "response_type": "vp_token",
  "presentation_definition": {
    "id": "FarmerCredential",
    "purpose": "Interop playground run d5ca1ffa: present the PlaygroundWrongTypeCredential credential",
    "input_descriptors": [
      {
        "id": "FarmerCredential",
        "format": {
          "ldp_vc": {
            "proof_type": [
              "Ed25519Signature2020"
            ]
          }
        },
        "constraints": {
          "fields": [
            {
              "path": [
                "$.type"
              ],
              "filter": {
                "type": "object",
                "pattern": "PlaygroundWrongTypeCredential"
              }
            }
          ]
        }
      }
    ]
  },
  "state": "req_bf567a7a-eb17-4973-bb18-92da98633cb5",
  "iat": 1792990950,
  "nonce": "1381dc929482cd3588e9641bc9f996ce",
  "client_id": "did:web:verify.localhost%3A8443:v1:verify",
  "jti": "c2f9ba14-5603-46f1-bd30-06baf35b5806",
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
          "
… (188 more characters)
```

**POST https://verify.localhost:8443/v1/verify/vp-submission/direct-post** → 200 (`oid4vp.response`)

Tampered by the playground (T-WRONG-TYPE): Presented a credential that does not satisfy the request

Request:

```
vp_token: {"@context":["https://www.w3.org/2018/credentials/v1","https://w3id.org/security/suites/jws-2020/v1"],"type":["VerifiablePresentation"],"holder":"did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6IjdIdnRtR1I0TWlFZHQtLU5LdXc1V1VDWmZiX1lsaWk2anRkdmFreDdUMFUiLCJ5IjoiMmI5ekpuVFFvdWZRVlRab1ZTZmFGZDNmTVN2MTBZU2UzaUZFRFBUNVUtVSJ9","verifiableCredential":[{"issuanceDate":"2026-10-26T05:02:28.977Z","credenti… (2156 characters)

presentation_submission: {"id":"7fdba041-f5fc-48a9-8e9b-f8bfc8fdcd13","definition_id":"FarmerCredential","descriptor_map":[{"id":"FarmerCredential","format":"ldp_vp","path":"$","path_nested":{"id":"FarmerCredential","format":"ldp_vc","path":"$.verifiableCredential[0]"}}]}

state: req_bf567a7a-eb17-4973-bb18-92da98633cb5
```

Response:

```
{}
```

**GET https://verify.localhost:8443/v1/verify/vp-result/txn_d5ca1ffaedb749d381597175763b6f2b** → 200 (`verify.result`)

Response:

```
{"transactionId":"txn_d5ca1ffaedb749d381597175763b6f2b","vpResultStatus":"SUCCESS","vcResults":[{"vc":"{\"issuanceDate\":\"2026-10-26T05:02:28.977Z\",\"credentialSubject\":{\"gender\":\"Male\",\"primaryCropType\":\"Ragi\",\"mobileNumber\":\"+91 90000 00042\",\"postalCode\":\"562114\",\"landArea\":\"2.5 acres\",\"fullName\":\"Ramesh Kumar\",\"secondaryCropType\":\"Tomato\",\"dateOfBirth\":\"1984-03-12\",\"farmerID\":\"FRM-2026-004217\",\"villageOrTown\":\"Hoskote\",\"district\":\"Bengaluru Rural\",\"id\":\"did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6IjdIdnRtR1I0TWlFZHQtLU5LdXc1V1VDWmZiX1lsaWk2anRkdmFreDdUMFUiLCJ5IjoiMmI5ekpuVFFvdWZRVlRab1ZTZmFGZDNmTVN2MTBZU2UzaUZFRFBUNVUtVSJ9\",\"state\":\"Karnataka\",\"landOwnershipType\":\"Owner\"},\"id\":\"https://mosip.io/credential/4b402339-1b85-4801-8d59-f944aa674d0f\",\"proof\":{\"proofValue\":\"zgV6QwqpaNbS3bS3NZijq6WUCddJ6gW6EuSoy9NeVdoQXukcLNL6hPwMjCnTsxp6qJPRbrBQJuRiRRWL9GwW9o5R\",\"created\":\"2026-10-26T05:02:28Z\",\"proofPurpose\":\"assertionMethod\",\"type\":\"Ed25519Signature2020\",\"verificationMethod\":\"did:web:certify.localhost#j2o1DGix_dbUxrLlqvNlFpOB9piwF0ZMVKVElszbtYA\"},\"type\":[\"VerifiableCredential\",\"FarmerCredential\"],\"@context\":[\"https://www.w3.org/2018/credentials/v1\",\"https://piyush7034.github.io/my-files/farmer.json\",\"https://w3id.org/security/suites/ed25519-2020/v1\"],\"issuer\":\"did:web:certify.localhost\",\"expirationDate\":\"2028-10-25T05:02:28.977Z\"}","verificationStatus":"SUCCESS"}]}
```

### Occurrences

- `d5ca1ffa-edb7-49d3-8159-7175763b6f2b` 2026-10-26T05:02:28.889Z · `ldp_vc` · FAIL
- `b1d0f6cb-1958-4e0d-b675-ac9c10c3130e` 2026-10-26T05:02:27.880Z · `vc+sd-jwt` · FAIL
- `d73436f4-c095-4ac6-b88a-b02a79a3f68d` 2026-10-26T05:00:03.714Z · `ldp_vc` · FAIL
- `2e3c0fb0-ed49-4733-9e62-100bd168d434` 2026-10-26T05:00:02.706Z · `vc+sd-jwt` · FAIL
- `e0e95427-948c-4089-8385-704ba33c6ac9` 2026-10-26T04:57:53.852Z · `ldp_vc` · FAIL
- `a9b095bb-ffb4-4816-891c-083e63a248a2` 2026-10-26T04:55:37.854Z · `vc+sd-jwt` · FAIL
- `fb9170f0-06ed-4ef9-aff3-682e3674edf4` 2026-10-25T16:37:13.904Z · `vc+sd-jwt` · FAIL
- `24ec34fe-3abc-4a47-ba20-4bea201f4eb5` 2026-10-25T08:18:11.317Z · `vc+sd-jwt` · FAIL
- `ed86faff-a8e8-4f04-bc98-1531d295270a` 2026-10-25T08:16:46.133Z · `ldp_vc` · FAIL
- `0e768b8a-98ad-4673-90c3-3da33b81d493` 2026-10-25T08:14:50.897Z · `vc+sd-jwt` · FAIL
