# Local Inji Core Stack

This directory runs the core Inji services and the playground locally with Docker Compose:

| Service | Address |
| --- | --- |
| **Inji Certify**, public issuer address | <https://certify.localhost:8443> (metadata, offers, tokens, credentials, `did:web`) |
| Inji Certify, direct | <http://localhost:8090/v1/certify> |
| Certify gateway, plain HTTP | <http://localhost:8091> |
| **Inji Verify API** | <http://localhost:8080/v1/verify> |
| **Inji Verify UI** | <http://localhost:3000> |
| **Playground UI** (mock mode) | <http://localhost:8100> |
| Playground BFF (placeholder) | <http://localhost:8101/api/health> |
| PostgreSQL | `localhost:5433`, user and password `postgres` |
| **Inji Wallet** | React Native mobile app, run separately on Android or iOS |

Certify issues two credentials from the same farmer data:

| Configuration id | Format | Signature |
| --- | --- | --- |
| `FarmerCredential` | W3C VC JSON-LD (`ldp_vc`) | Ed25519Signature2020 |
| `FarmerCredentialSdJwt` | SD-JWT VC (`vc+sd-jwt`), every claim selectively disclosable | ES256 |

The Compose file uses one PostgreSQL instance. It
does not use the MOSIP Collab Docker network or any cloned upstream source
repository. All database scripts, service configuration, templates, and Nginx
files required by Compose are included in this directory. Mimoto and Inji Web
are also optional because they still require additional Resident/WebSub/MOSIP
services for every Wallet flow.

## Prerequisites

- Docker Desktop with Compose v2
- Git
- Java 17 and Node 18.17.1/npm 8.19.3 for the mobile Wallet
- Android Studio and an Android emulator, or Xcode on macOS

## Start the server stack

Run these commands from this directory:

```powershell
docker compose pull
docker compose up -d
docker compose ps
```

The first start downloads the published Inji images (about 3.5 GB), builds the
playground UI and BFF images, and can take several minutes. Certify and Verify
need another minute or two after their containers start. Check everything at once
with the BFF's health report, <http://localhost:8101/api/health>. Inspect a service
when it is not ready:

```powershell
docker compose logs -f certify
docker compose logs -f mimoto-service
docker compose logs -f verify-service
```

The Certify mock setup is intended for the local guest/demo flow.
Authentication through eSignet, Google sign-in, and MOSIP Resident APIs are
not included in the baseline command. The command intentionally starts the local
Certify and Verify services without silently falling back to Collab.

## Issuer address, HTTPS and did:web

Certify's public address is `https://certify.localhost:8443`. The same URL works
from the host and from inside Docker: browsers and `curl` resolve any
`*.localhost` name to the local machine, and inside the `injistack` network the
name is an alias of the `certify-nginx` gateway. Issuer metadata, credential
offers, token audiences and the issuer DID (`did:web:certify.localhost%3A8443`,
resolved through `https://certify.localhost:8443/.well-known/did.json`) all use it.

The one-shot `certs` service creates a local certificate authority and an HTTPS
certificate for that hostname (`scripts/make-local-certs.sh`) on first start. The
Java services (Certify, Verify, Mimoto) trust it through a truststore passed in
`JAVA_TOOL_OPTIONS`, and the BFF through `NODE_EXTRA_CA_CERTS`. The CA is also
copied to `certs/local-ca.crt` (not committed). To avoid certificate warnings,
import that file into your browser as a trusted authority, or pass it to tools:

```sh
curl --cacert certs/local-ca.crt https://certify.localhost:8443/.well-known/openid-credential-issuer
```

Some host tools, such as Node.js, ask the operating system to resolve names and
do not know `certify.localhost`. Add `127.0.0.1 certify.localhost` to your hosts
file when you run such tools on the host. Containers are not affected.

To use another hostname, for example a tunnel for phone testing, set it in
`injistack/.env` (not committed) and recreate the stack with a fresh database,
because the DID is written into the credential configurations on first start:

```sh
echo "CERTIFY_PUBLIC_HOST=certify.example.test" > .env
docker compose down -v
docker compose up -d
```

## Issuance flows

`CERTIFY_FLOW` (in `.env`) selects how Certify authorizes issuance:

| `CERTIFY_FLOW` | Tokens | Credential data | Use for |
| --- | --- | --- | --- |
| `preauth` (default) | Certify issues its own tokens for pre-authorized offers | the claims given when the offer is created | the playground, scripted runs, wallets that scan a credential-offer QR |
| `esignet` | eSignet (`esignet` profile) | the farmer CSV, looked up by the token's subject | Mimoto and Inji Web (`wallet` profile) |

The settings live in `config/certify-preauth.properties` and
`config/certify-esignet.properties`. Restart Certify after changing the flow:
`docker compose up -d certify`.

In the default flow, create an offer with the claims to issue (mock data only).
The response is an `openid-credential-offer://` link for a wallet or QR code:

```sh
curl --cacert certs/local-ca.crt -X POST https://certify.localhost:8443/v1/certify/pre-authorized-data \
  -H 'content-type: application/json' \
  -d '{"credential_configuration_id": "FarmerCredentialSdJwt",
       "claims": {"fullName": "Ramesh Kumar", "farmerID": "FRM-2026-004217", "landArea": "2.5 acres"}}'
```

The wallet then fetches the offer, exchanges the pre-authorized code at
`https://certify.localhost:8443/v1/certify/oauth/token` and requests the
credential with a proof of possession. Claims left out of an offer are issued as
empty strings. An issued credential can be checked directly with Inji Verify:

```sh
curl -X POST http://localhost:8080/v1/verify/v2/vc-verification -H 'content-type: application/json' \
  -d '{"verifiableCredential": "<the SD-JWT>", "includeClaims": true}'
```

JSON-LD credentials load their `@context` documents from the internet
(`www.w3.org`, `w3id.org` and the farmer context on `piyush7034.github.io`), so
Certify and Verify need outbound internet access to sign and verify them.
SD-JWT credentials need none.

## Playground UI and BFF

`playground-ui` serves the playground at <http://localhost:8100>, built from
`apps/playground-ui` in mock mode: the browser simulates runs and the API, as in
`pnpm dev`. `playground-bff` is a placeholder for the real BFF. It answers
`GET /api/health` with the state of every Inji service (services from profiles
that are off show as `not-running`) and returns 501 for every other `/api` route.
The UI's nginx proxies `/api` and `/socket.io` to it, ready for a build with
`VITE_USE_MOCKS=false` once the BFF serves runs.

Rebuild after changing the UI or BFF code:

```sh
docker compose up -d --build playground-ui playground-bff
```

## eSignet and the wallet profile

To start the local eSignet mock authorization platform, use a clean database
volume so all eSignet schemas are initialized:

```powershell
docker compose --profile esignet --profile wallet down -v --remove-orphans
docker compose --profile esignet --profile wallet pull
docker compose --profile esignet --profile wallet up -d
docker compose --profile esignet --profile wallet ps
```

The eSignet profile uses the included local mock setup:

- eSignet service: <http://localhost:8088> (the OIDC issuer hostname is
  `http://esignet.localhost:8088` so both the browser and Docker containers
  can reach the same service)
- eSignet OIDC UI: <http://localhost:3005>
- Mock identity system: <http://localhost:8082>

The eSignet profile deliberately uses ports `8088` and `3005` because Verify
already uses `8080` and `3000`. The mock identity is seeded by
`db/esignet-init.sql`. The `postman` directory contains the local eSignet
collection for onboarding and API verification.

When the `wallet` profile is enabled, Mimoto is available under its configured
context path:

```powershell
Invoke-WebRequest http://localhost:8099/v1/mimoto/actuator/info
Invoke-WebRequest http://localhost:8099/v1/mimoto/issuers
```

The Mimoto endpoint is not available at `/actuator/info`; requests to that
path return 404. The `/v1/mimoto/actuator/health` endpoint may return HTTP 503
because this local demo does not include every MOSIP platform dependency
(including the production HSM and Config Server). Use `/v1/mimoto/issuers`
and the Mimoto logs to verify that the service is running.

The Compose database health check waits for the eSignet and mock-identity
schemas to finish initializing before starting eSignet. Verify readiness with:

```powershell
Invoke-WebRequest http://localhost:8088/health
Invoke-WebRequest http://localhost:3005/.well-known/openid-configuration
Invoke-WebRequest http://localhost:8082/v1/mock-identity-system/actuator/health
```

The eSignet log line `HSM Client installation is ignored` is expected for this
local demo: it uses the configured software PKCS#12 keystore rather than a
production HSM. A persistent `postgres connection failed` message or an exited
`esignet` container is not expected; inspect the database health and restart
with the full profile command above.

Mimoto's local Compose configuration disables MOSIP service discovery for
ordinary HTTP URLs and uses Docker DNS for `esignet.localhost` and
`certify-nginx`. This is required because the standalone stack does not run
MOSIP's service registry. `No servers available` messages for
`websub.websub` are expected optional WebSub warnings; the same message for
`esignet.localhost` or `certify-nginx` indicates that Mimoto was not restarted
after a configuration change.

The local issuer configuration uses
`http://esignet.localhost:8088/oauth2/token` as Mimoto's
`authorization_audience`, matching the token endpoint expected by Mimoto's
OIDC client assertion. This is separate from the eSignet issuer URL used for
discovery and authorization.

Mimoto 0.21 signs its OIDC client assertion with `RS256`. The local eSignet
Compose service therefore explicitly enables `RS256` through
`MOSIP_ESIGNET_OAUTH_SUPPORTED_SIGNING_ALGORITHMS`; without that compatibility
setting, credential downloads fail with `invalid_client: Invalid client
assertion`.

After the eSignet profile is healthy, start the Wallet backend and Web UI with
`CERTIFY_FLOW=esignet` in `.env`, so Certify accepts the eSignet tokens Mimoto
brings. Inji Web is at <http://localhost:3004>:

```powershell
docker compose --profile esignet --profile wallet up -d
```

This starts Mimoto and Inji Web with the local eSignet token endpoint. The
CBEFF schema is served locally from
[`esignet/docker-compose/cbeff/mosip-cbeff.xsd`](./esignet/docker-compose/cbeff/mosip-cbeff.xsd),
so Mimoto can initialize without downloading it from GitHub. The profile still
does not replace MOSIP Resident, Auth Manager, WebSub, or other platform
services needed by the full production-style issuance flow. Without a local
WebSub service, Mimoto remains running but logs retry errors for event
subscription; this affects asynchronous credential notification flows. Its
actuator health may report `DOWN` for HSM/config-server checks because the
full MOSIP Key Manager and Config Server are not part of this local profile;
the Mimoto process and HTTP API still remain available.

For browser-based credential issuance, the Certify signing keystore is
generated at runtime under the `certify-data` volume. If Certify fails with
`NoSuchSecurityProviderException` or `No such alias` after a database or
volume reset, stop Certify and clear only its generated key records:

```powershell
docker compose stop certify
docker compose exec -T database psql -U postgres -d inji_certify -c "BEGIN; DELETE FROM certify.key_alias; DELETE FROM certify.key_store; DELETE FROM certify.ca_cert_store; COMMIT;"
docker compose up -d certify
```

This does not reset eSignet clients or mock identities. The `certgen.zip`
mentioned in the Inji documentation is for creating the separate
`oidckeystore.p12` used when onboarding Mimoto as an eSignet OIDC client; it
is not required to regenerate Certify's `local.p12`.

The local wallet setup uses the eSignet client `wallet-demo`, with the
`wallet-demo-client` key alias and the local keystore password configured in
Compose. The keystore must be placed at `certs/oidckeystore.p12`.
Do not commit that file or its private key. A new environment must generate
its own PKCS#12 file using the `certgen.zip` procedure from the Inji
documentation, register the matching public JWK in eSignet, and set the
`oidc_p12_password` Compose value to the keystore password.

The `wallet` profile cannot start until that file exists. The keystore is
environment-specific and is intentionally not included in this repository.
For an eSignet/Mimoto demonstration, first generate or obtain a local
`oidckeystore.p12`, place it under `certs/`, and onboard its public JWK for the
`wallet-demo` client using the Postman collection. Then run:

```powershell
docker compose --profile esignet --profile wallet pull
docker compose --profile esignet --profile wallet up -d
```

### Current local Web Wallet limitation

The eSignet 2.0 and Mimoto 0.21 images currently reject Mimoto's
`private_key_jwt` during the browser credential download with
`invalid_client: Invalid client assertion`, before Certify is called. The
local stack remains usable for service and issuer metadata checks, but do not
use repeated browser retries as a flow test until Mimoto is upgraded or its
OIDC assertion implementation is patched for this eSignet version.

For a working authentication/API demonstration, use the local eSignet
Postman collection:

```text
postman/Go-eSignet.postman_collection.json
```

Run it with:

```text
postman/Go-eSignet (local).postman_environment.json
```

Postman validates eSignet authentication, consent, token, and UserInfo. It
does not replace the browser credential-download path through Mimoto and
Certify.

## Run Inji Wallet against the local backend

The Wallet is a native mobile app and cannot be served by this Compose file.
The native Wallet source is not included in this orchestration directory.
Clone the pinned Inji Wallet repository separately, then copy its
`.env.local.example` to `.env.local`, replacing `<host-ip>` with the host
machine's LAN address when using a physical device. Android emulators use
`10.0.2.2`; iOS simulators can use `localhost`.

```powershell
cd path\to\inji-wallet
npm install
npm start -- --reset-cache
```

In another terminal, launch the platform build:

```powershell
npm run android:mosip
# or: npm run ios
```

For a physical phone, the phone and computer must be on the same network and
ports `8099`, `8091`, and `3000` must be reachable from the phone.

## Stop and reset

`down -v` also deletes the local certificates; the next start creates a new CA,
so import `certs/local-ca.crt` into your browser again.

```powershell
docker compose --profile esignet --profile wallet down --remove-orphans
docker compose --profile esignet --profile wallet down -v --remove-orphans
# The second command deletes the local database and generated state.
```

The mobile app's local environment is intentionally not committed with
machine-specific host addresses or credentials.
