# Adding an implementation

Each issuer, wallet and verifier in the selector is one file in [`catalog/`](../catalog), and each file names an **adapter**. An adapter is the class in [`apps/playground-bff/src/adapters`](../apps/playground-bff/src/adapters) that drives that kind of product. The run orchestrator only talks to the role interfaces in [`adapters/types.ts`](../apps/playground-bff/src/adapters/types.ts), so a new product never touches the run machine, the inspector, the reports or the UI.

There are three cases, from least to most work:

| Case | What you add | Typical time |
| --- | --- | --- |
| An existing adapter fits (another phone wallet, another Inji Verify or Certify instance) | One YAML file | Minutes |
| A new product with a new API | One YAML file, one adapter class, one line in the registry | Under an hour |
| The product should appear in the protocol inspector | The two above, plus a Protocol Tap listener and a gateway route | Another 15 minutes |

## 1. The catalog entry

Create `catalog/<id>.yaml`. It is validated against `ImplementationDescriptorSchema` in [`packages/shared/src/domain.ts`](../packages/shared/src/domain.ts) when the BFF starts. A file that fails validation is logged and skipped. `${VAR:-default}` is filled in from the BFF's environment.

```yaml
# A second phone wallet: the existing human-in-the-loop adapter already fits.
id: acme-wallet
role: wallet                        # issuer | wallet | verifier
displayName: Acme Wallet
description: "Acme's mobile wallet. Scans OpenID4VCI offers and OpenID4VP requests."
vendor: external                    # inji | mock | external
adapter: InjiMobileWalletAdapter    # any key of FACTORIES in catalog/registry.ts
publicUrl: https://acme.example
versionProbe:
  kind: static                      # static | actuator | header
  value: 2.3.0
capabilities:
  formats: [vc+sd-jwt, dc+sd-jwt]
  proofSuites: [ES256]
  grantTypes: [pre-authorized_code]
  vciProfiles: [oid4vci-1.0]
  vpProfiles: [oid4vp-1.0]
  queryLanguages: [dcql]
  responseModes: [direct_post]
  didMethods: [did:jwk]
  presentationFlows: [cross-device-qr, same-device-deeplink]
  deliveryChannels: [qr, deeplink]
  automation: human-in-the-loop     # headless wallets run in CI and the interop suite
  supportsTamper: false
notes: Anything a tester should know before picking it.
```

The capabilities drive the compatibility prediction in the selector (`packages/shared/src/compatibility.ts`): formats, profiles, query languages, response modes and flows are intersected across the three selected roles. They are a prediction only, and a surprising pass or fail in a real run is a finding. Declare what the product claims, not what you hope works.

Restart the BFF (`docker compose up -d --build playground-bff` in `injistack/`). The entry appears in the selector, in `GET /api/catalog`, and in the in-browser mock catalog of `pnpm dev`, which reads the same YAML files.

The existing adapters:

| Adapter | Role | Fits |
| --- | --- | --- |
| `InjiCertifyIssuerAdapter` | issuer | Inji Certify with the pre-authorized code flow (any version with the `/pre-authorized-data` endpoint) |
| `HoviPlaygroundIssuerAdapter`, `AnimoPlaygroundIssuerAdapter` | issuer | Those public playgrounds; the holder confirms storage, because the phone talks to them directly |
| `InjiMobileWalletAdapter` | wallet | Any phone wallet that scans `openid-credential-offer://` and `openid4vp://` QR codes or opens them as links |
| `InjiWebWalletAdapter` | wallet | A browser wallet where issuance starts inside the wallet (authorization code) |
| `MockWalletAdapter` | wallet | `apps/mock-wallet`, headless |
| `InjiVerifyServiceAdapter` | verifier | Inji Verify's verify-service API (`/vp-request`, status long poll, `/vp-result`), Presentation Exchange |
| `InjiVerifyDcqlAdapter` | verifier | Inji Verify's 1.0 API (OpenID4VP 1.0, DCQL, `/v2/vp-request`, `/v2/vp-results`), such as the MOSIP Collab sandbox; set the descriptor's `clientId` |
| `MockVerifierAdapter` | verifier | `apps/mock-verifier` |

## 2. A new adapter

Implement the role's interface from `adapters/types.ts`:

| Role | Must implement | Optional |
| --- | --- | --- |
| Issuer | `listCredentialConfigurations()`, `prepareIssuance(ctx)` returning an `IssuanceHandle` with the `openid-credential-offer://` URI | — |
| Wallet | `issuanceDelivery(handle)`, `presentationDelivery(ctx, handle)` returning a `DeliveryInstruction` (QR, link or manual steps) | `acceptOffer`, `respond`, `listCredentials` (headless wallets only) |
| Verifier | `createPresentationRequest(ctx, spec)`, `pollStatus(ctx, handle)`, `fetchResult(ctx, handle)` mapping the verifier's answer to `VALID` / `INVALID` / `EXPIRED` / … | `verifyCredential` (second opinion), `submitDcApiResponse` |

Every role also implements `healthCheck()` and `version()`. The helpers in [`adapters/http.ts`](../apps/playground-bff/src/adapters/http.ts) cover both (`probeHealth`, `staticVersion`), plus `upstream()` for calls with timeouts and errors that the run report can show (`AdapterError` carries the step, status and body).

A sketch of a verifier:

```ts
// apps/playground-bff/src/adapters/acme-verifier.ts
export class AcmeVerifierAdapter implements VerifierAdapter {
  readonly component = 'acme-verifier'; // the tap component its traffic is recorded under
  constructor(readonly descriptor: ImplementationDescriptor, private readonly apiUrl: string) {}

  healthCheck() { return probeHealth(`${this.descriptor.internalUrl}/health`); }
  async version() { return staticVersion(this.descriptor); }

  async createPresentationRequest(ctx: RunContext, spec: PresentationSpec) {
    const res = await upstream('verify.create_request', `${this.apiUrl}/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: spec.credentialType, purpose: spec.purpose }),
      runId: ctx.runId, // tags the call so the tap files it under this run
      signal: ctx.signal,
    });
    const body = res.json() as { id: string; uri: string; definition: object };
    return { requestId: body.id, transactionId: body.id, authorizationRequestUri: body.uri,
             presentationDefinition: body.definition };
  }

  async pollStatus(ctx: RunContext, h: PresentationRequestHandle): Promise<RequestStatus> { /* … */ }
  async fetchResult(ctx: RunContext, h: PresentationRequestHandle): Promise<VerifierResult> { /* … */ }
}
```

[`mock-verifier.ts`](../apps/playground-bff/src/adapters/mock-verifier.ts) is a complete, short example to copy (create, long poll, fetch, second opinion). For issuers, see [`inji-certify.ts`](../apps/playground-bff/src/adapters/inji-certify.ts).

Register it in `FACTORIES` in [`catalog/registry.ts`](../apps/playground-bff/src/catalog/registry.ts):

```ts
AcmeVerifierAdapter: (d, s) => new AcmeVerifierAdapter(d, apiUrl(d, s)),
```

`apiUrl(d, s)` is the tap listener for this implementation when one is configured (step 3), and otherwise the descriptor's `internalUrl`.

Add a test next to the adapter, for example `acme-verifier.test.ts`. It should map the product's result payloads to `VerifierResult`: [`mock-verifier.test.ts`](../apps/playground-bff/src/adapters/mock-verifier.test.ts) stubs `fetch`, so nothing needs to run.

## 3. Showing its messages in the inspector

Protocol messages appear in the inspector when they pass through the Protocol Tap ([`PROTOCOL_TAP.md`](../apps/playground-bff/PROTOCOL_TAP.md)). For a product you run in the Compose stack:

1. Add a listener to `TAPS` in [`apps/playground-bff/src/main.ts`](../apps/playground-bff/src/main.ts): `{ component: 'acme-verifier', port: 3006, upstream: env.TAP_UPSTREAM_ACME ?? '', publicOrigin: … }`. Map the implementation id to it in `apiUrls`, so the BFF's own calls are tapped too.
2. Set `TAP_UPSTREAM_ACME` on `playground-bff` in [`injistack/docker-compose.yml`](../injistack/docker-compose.yml).
3. Route its public hostname or path through the tap in [`injistack/certify/gateway.conf.template`](../injistack/certify/gateway.conf.template), as the `/mock-verifier/` location does. The product's own public-URL setting must point at the gateway, so the wallet's calls pass the tap.

[`tap/classifier.ts`](../apps/playground-bff/src/tap/classifier.ts) labels a message's protocol step from its method and path. Add a rule if the product uses paths the classifier does not know. Unlabelled messages are still recorded, as `unknown`.

A product on the internet that the phone talks to directly (like Hovi and Animo) cannot be tapped. Set `observation: 'manual'` on its `IssuanceHandle`. The run then asks the holder to confirm, and the report labels those steps as manual evidence.

## 4. Check it

- `pnpm --filter @playground/bff test` and `typecheck`.
- `pnpm dev`: the entry shows in the selector with its capabilities and predictions (mock mode).
- `make up`, then one run in the UI, and the inspector shows its messages.
- For a headless implementation, add lanes to [`matrices/nightly.yaml`](../matrices/nightly.yaml) so the nightly suite covers it, and run only those lanes with `pnpm --filter @playground/interop-cli start run --matrix ../../matrices/nightly.yaml --only <id>`.
