# Local Inji Core Stack

This directory runs the core Inji services locally with Docker Compose:

- **Inji Certify**: credential issuer at <http://localhost:8090>
- **Certify gateway**: issuer metadata and public endpoints at <http://localhost:8091>
- **Inji Verify API**: verifier API at <http://localhost:8080>
- **Inji Verify UI**: verifier UI at <http://localhost:3000>
- **Inji Wallet**: React Native mobile app, run separately on Android or iOS

The Compose file uses the mock CSV Certify plugin and one PostgreSQL instance. It
does not use the MOSIP Collab Docker network or the Verify repository's separate
database container. The provided `esignet` repository is wired into an optional
local mock authorization profile. Mimoto and Inji Web are also optional because
they still require additional Resident/WebSub/MOSIP services for every Wallet
flow.

## Prerequisites

- Docker Desktop with Compose v2
- Git
- The provided `esignet` directory (required for the local authorization profile)
- Java 17 and Node 18.17.1/npm 8.19.3 for the mobile Wallet
- Android Studio and an Android emulator, or Xcode on macOS

## Start the server stack

Run these commands from this directory:

```powershell
docker compose pull
docker compose up -d
docker compose ps
```

The first start downloads the published Inji images and can take several
minutes. Inspect a service when it is not ready:

```powershell
docker compose logs -f certify
docker compose logs -f mimoto-service
docker compose logs -f verify-service
```

The Certify mock setup is intended for the guest/demo flow documented by
[Inji Certify](./inji-certify/docker-compose/docker-compose-injistack/README.md).
Authentication through eSignet, Google sign-in, and MOSIP Resident APIs are
not included in the baseline command. The command intentionally starts the local
Certify and Verify services without silently falling back to Collab.

To start the local eSignet mock authorization platform, use a clean database
volume so all eSignet schemas are initialized:

```powershell
docker compose --profile esignet --profile wallet down -v --remove-orphans
docker compose --profile esignet --profile wallet pull
docker compose --profile esignet --profile wallet up -d
docker compose --profile esignet --profile wallet ps
```

The eSignet profile uses the cloned repository's documented mock setup:

- eSignet service: <http://localhost:8088> (the OIDC issuer hostname is
  `http://esignet.localhost:8088` so both the browser and Docker containers
  can reach the same service)
- eSignet OIDC UI: <http://localhost:3005>
- Mock identity system: <http://localhost:8082>

The eSignet profile deliberately uses ports `8088` and `3005` because Verify
already uses `8080` and `3000`. The mock identity credentials and OIDC client
must still be seeded/onboarded using the eSignet repository's Postman
collection; see
[the eSignet local setup guide](./esignet/docker-compose/README.md).

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

After the eSignet profile is healthy, start the Wallet backend and Web UI:

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
Compose. The keystore is mounted from
`inji-certify/docker-compose/docker-compose-injistack/certs/oidckeystore.p12`.
Do not commit that file or its private key. A new environment must generate
its own PKCS#12 file using the `certgen.zip` procedure from the Inji
documentation, register the matching public JWK in eSignet, and set the
`oidc_p12_password` Compose value to the keystore password.

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
esignet/postman-collection/Go-eSignet.postman_collection.json
```

Run it with:

```text
esignet/postman-collection/Go-eSignet (local).postman_environment.json
```

Postman validates eSignet authentication, consent, token, and UserInfo. It
does not replace the browser credential-download path through Mimoto and
Certify.

## Run Inji Wallet against the local backend

The Wallet is a native mobile app and cannot be served by this Compose file.
It requires Mimoto, so start the optional profile after configuring the local
authorization platform. Then copy [`.env.local.example`](./inji-wallet/.env.local.example) to
`inji-wallet/.env.local`, replacing `<host-ip>` with the host machine's
LAN address when using a physical device. Android emulators use
`10.0.2.2`; iOS simulators can use `localhost`.

```powershell
cd inji-wallet
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

```powershell
docker compose --profile esignet --profile wallet down --remove-orphans
docker compose --profile esignet --profile wallet down -v --remove-orphans
# The second command deletes the local database and generated state.
```

The mobile app's local environment is intentionally not committed with
machine-specific host addresses or credentials.
