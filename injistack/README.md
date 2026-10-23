# Local Inji Core Stack

This directory runs the core Inji services and the playground locally with Docker Compose:

| Service | Address |
| --- | --- |
| **Playground UI** | <http://localhost:8100> |
| Playground BFF (REST, socket.io, health report) | <http://localhost:8101/api/health> |
| Mock wallet (headless) | <http://localhost:8104/health> |
| **Inji Certify**, public issuer address | <https://certify.localhost:8443> (metadata, offers, tokens, credentials, `did:web`) |
| **Inji Verify**, public address | <https://verify.localhost:8443/v1/verify> (request objects, VP submission, `did:web`) |
| Inji Certify, direct (bypasses the Protocol Tap) | <http://localhost:8090/v1/certify> |
| Inji Verify API, direct (bypasses the Protocol Tap) | <http://localhost:8080/v1/verify> |
| Gateway, plain HTTP | <http://localhost:8091> |
| **Inji Verify UI** | <http://localhost:3000> |
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
Certify and Verify need outbound internet access to sign and verify them, and the
mock wallet needs it to sign a JSON-LD presentation (it ships the W3C contexts but
fetches the farmer context). Without it, Certify answers the credential request
with `ERROR_SIGNING_QR_DATA: Error occurred during canonicalization.` and the run
shows that error on the credential step. SD-JWT credentials need none.

## Playground, Protocol Tap and mock wallet

<http://localhost:8100> is the playground. Pick **Inji Certify**, **Mock wallet**
and **Inji Verify**, choose SD-JWT or JSON-LD and press **Run**: the BFF creates a
pre-authorized offer in Certify, the mock wallet redeems it, the BFF asks Inji
Verify for a presentation request, the wallet answers it, and the run ends with
Inji Verify's verdict and a pass/fail report. Choose **Invalid** as the expected
result and the mock wallet breaks the issuer's signature before presenting.
With **Inji Wallet (mobile)** the run shows QR codes for a phone instead (see
[Phones and tunnels](#phones-and-tunnels)).

How the pieces connect:

```
wallet / phone / Mimoto ─► certify-nginx (https://certify.localhost:8443, https://verify.localhost:8443)
                                  │
                                  ▼
                 playground-bff: Protocol Tap :3002 (Certify), :3003 (Verify)  ──records──► inspector
                                  │
                                  ▼
                          certify:8090, verify-service:8080
```

- `certify-nginx` is the public gateway for both services. It routes by host
  name, and sends every protocol request through the Protocol Tap in
  `playground-bff`, which records it and forwards it unchanged. If the BFF is
  down, nginx falls back to the services directly, so the stack keeps working.
- The BFF's own calls (offer creation, VP request, status, result) also go
  through the tap, tagged with the run id.
- The tap links each message to its run by following identifiers from one
  message to the next: offer id → pre-authorized code → access token (from the
  `Authorization` header) for issuance; request id, `state` and transaction id
  for presentation. Metadata and DID document fetches carry no identifier and
  join the run of the same client's neighbouring requests.
- Access tokens, codes, cookies and similar secrets are masked in everything the
  tap stores and the API returns (first and last four characters kept). Set
  `TAP_REVEAL_SECRETS=true` on `playground-bff` to see them while debugging.
- Finished runs, with their messages, are saved in the `playground-data` volume
  and survive a BFF restart.

The REST API is at <http://localhost:8101/api> (`/catalog`, `/runs`,
`/runs/:id`, `/runs/:id/exchanges?decode=true`, `/runs/:id/report?format=md|json`,
`/runs/:id/manual-evidence`, `/runs/:id/cancel`). A headless run from the shell:

```sh
curl -s -X POST http://localhost:8101/api/runs -H 'content-type: application/json' -d '{
  "mode": "full", "issuerId": "inji-certify", "walletId": "mock-wallet", "verifierId": "inji-verify",
  "format": "vc+sd-jwt", "credentialConfigurationId": "FarmerCredentialSdJwt",
  "grantType": "pre-authorized_code", "presentationFlow": "cross-device-qr", "expectedOutcome": "VALID"}'
# → {"id":"<run id>"}; then GET /api/runs/<run id>/report?format=md
```

Rebuild after changing the UI, BFF or wallet code:

```sh
docker compose up -d --build playground-ui playground-bff mock-wallet
```

`PLAYGROUND_UI_MOCKS=true` in `.env` builds the UI in mock mode instead (the
browser simulates runs, as in `pnpm dev`).

## Inji Verify's public address

Inji Verify puts its own base URL into every presentation request
(`request_uri`, `response_uri`) and signs request objects as a `did:web`
verifier. Both point at the gateway, not at `localhost:8080`, so the mock wallet
inside Docker, a browser on the host and a phone behind a tunnel all reach the
same URLs, through the Protocol Tap:

| Setting (`.env`) | Default | Used for |
| --- | --- | --- |
| `VERIFY_PUBLIC_HOST` | `verify.localhost` | gateway host name, HTTPS certificate, Docker network alias |
| `VERIFY_PUBLIC_URL` | `https://verify.localhost:8443` | `request_uri` and `response_uri` (`INJI_VP_SUBMISSION_BASE_URL`) |
| `VERIFY_DID` | `did:web:verify.localhost%3A8443:v1:verify` | client id of presentation requests; resolves to `${VERIFY_PUBLIC_URL}/v1/verify/did.json` |

Inji Verify's default request (used by the Verify UI and by Certify's
presentation-during-issuance config, `config/verify-config.json` and
`config/vp_request_config.json`) asks for the Farmer credential, JSON-LD with
Ed25519Signature2020 first and SD-JWT second, instead of the MOSIP ID with an RSA
signature that no credential in this stack matches.

## Phones and tunnels

A phone cannot reach `localhost` or `*.localhost`. Expose the gateway's HTTPS
port (8443) through a tunnel with stable host names, one for Certify and one for
Verify, then set the public names in `.env` and recreate the stack with a fresh
database (the issuer DID is written into the credential configurations on first
start):

```sh
CERTIFY_PUBLIC_HOST=certify.example.test
VERIFY_PUBLIC_HOST=verify.example.test
VERIFY_PUBLIC_URL=https://verify.example.test
VERIFY_DID=did:web:verify.example.test:v1:verify
```

Certify's public address keeps the `:8443` port, so its tunnel must serve that
port too. The tunnel must present a certificate the phone trusts.

## Upgrading an existing database

`db/verify_init.sql` now matches Inji Verify 0.18.2's schema: the
`vp_submission` table has the `response_code` columns that Verify reads on every
status poll and VP submission. Without them those requests fail with HTTP 500.
The init scripts only run on a new database volume, so for an existing one either
recreate it (`docker compose down -v`) or add the columns:

```sh
docker compose exec -T database psql -U postgres -d inji_verify -c "
  ALTER TABLE verify.vp_submission ALTER COLUMN vp_token DROP NOT NULL,
    ALTER COLUMN presentation_submission DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS response_code varchar(200) UNIQUE,
    ADD COLUMN IF NOT EXISTS response_code_expiry_at timestamptz,
    ADD COLUMN IF NOT EXISTS response_code_used boolean DEFAULT false;"
```

Changing `VERIFY_PUBLIC_HOST` also re-creates the local certificates (the `certs`
service adds the Verify host name to them), so import `certs/local-ca.crt` into
your browser again.

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

### Mimoto keystore and the `wallet-demo` client

Mimoto signs its eSignet client assertion with the `wallet-demo-client` key in
`certs/oidckeystore.p12`, as eSignet client `wallet-demo`. The keystore is
environment-specific: never commit it (`.gitignore` excludes `certs/*.p12`).

1. **Create the keystore before the first `--profile wallet` start.** If the
   file is missing, Docker creates an empty *directory* named
   `oidckeystore.p12` for the bind mount, and Mimoto exits with
   `/home/mosip/certs/oidckeystore.p12 (Is a directory)`. Either copy the team
   keystore into `certs/`, or generate one:

   ```bash
   cd certs
   openssl genrsa -out wallet-demo.key 2048
   openssl req -new -x509 -key wallet-demo.key -out wallet-demo.crt -days 365 -subj "/CN=wallet-demo-client"
   openssl pkcs12 -export -inkey wallet-demo.key -in wallet-demo.crt \
     -name wallet-demo-client -out oidckeystore.p12 -passout pass:local
   chmod 644 oidckeystore.p12
   cd ..
   ```

2. **Put the keystore password in `.env`** as `OIDC_P12_PASSWORD=...`
   (Compose passes it to Mimoto as `oidc_p12_password`; the default is
   `local`). A wrong value makes Mimoto exit with `keystore password was
   incorrect`.

3. **Start the profiles**, then **register the client** in eSignet. eSignet's
   database starts with no clients, and without this step Inji Web's login
   redirects to `localhost:3005/error?errorCode=invalid_request&errorMessage=Invalid+client_id`.

   ```bash
   docker compose --profile esignet --profile wallet up -d
   ./scripts/register-wallet-client.sh
   ```

   The client is stored in the Postgres volume, so run the script again after
   `down -v`. It reads `OIDC_P12_PASSWORD` from `.env`, selects the
   `wallet-demo-client` entry explicitly (Mimoto's key manager adds its own
   ROOT and MIMOTO entries to the same file) and registers its public JWK.

4. **Switch Certify to the eSignet flow** with `CERTIFY_FLOW=esignet` in
   `.env`, then `docker compose up -d --force-recreate certify`. In this mode
   pre-authorized mock-wallet runs fail; remove the line and recreate Certify
   to get them back.

Checks: `docker compose --profile esignet --profile wallet ps mimoto-service`
shows `Up`, and `curl http://localhost:8099/v1/mimoto/issuers` lists the
Farmer and MockMdl issuers. `UnknownHostException: websub.websub` in Mimoto's
log is expected (see above).

Troubleshooting:

| Symptom | Cause and fix |
| --- | --- |
| Playground shows Inji Web offline; `inji-web` up but `mimoto-service` missing from `ps` | Mimoto exited; check `docker compose --profile wallet logs mimoto-service` |
| `oidckeystore.p12 (Is a directory)` | See step 1. After replacing the directory with the file, also run `docker compose --profile esignet --profile wallet rm -sf mimoto-service inji-web`: the old container keeps the directory mount, and `up` then fails with `not a directory: Are you trying to mount a directory onto a file` |
| `keystore password was incorrect` | `OIDC_P12_PASSWORD` does not match the keystore (step 2), then `up -d --force-recreate mimoto-service` |
| `openssl pkcs12` fails with `RC2-40-CBC ... unsupported` | Keystores made by certgen or Java keytool use RC2; OpenSSL 3 reads them with `-legacy` (the password is correct if there is no `Mac verify error`) |
| Client registration returns `invalid_claim` | Use only `name`, `email`, `picture`, `phone_number` and `address` as `userClaims` (the script does) |

### Current local Web Wallet limitation

With the keystore and client set up as above, the eSignet login in Inji Web
succeeds, but the credential download fails at the token step. Inji Web shows
"Due to technical error, we were unable to download the card"; Mimoto logs
`Exception occurred while generating pdf` (its name for the whole download)
caused by `401 Unauthorized: {"error":"invalid_client","error_description":"Invalid client assertion"}`
from eSignet. The request never reaches Certify (no `credential` call in the
`certify-nginx` log).

What has been ruled out (eSignet 2.0.0, Mimoto 0.21.0, 2026-10-23):

- The client is registered and `ACTIVE`; the registered JWK is the
  `wallet-demo-client` key, and that key's private key and certificate match
  (same modulus).
- eSignet's discovery advertises `issuer` `http://esignet.localhost:8088` and
  `token_endpoint` `http://esignet.localhost:8088/oauth2/token`, which matches
  Mimoto's `authorization_audience`.
- Hand-signed assertions with the same key are also rejected, for every
  combination of `aud` (issuer, token endpoint), `alg` (RS256, PS256) and
  with or without a `kid` header (thumbprint, as the Postman collection
  computes it). These tests used a dummy authorization code, so they are only
  conclusive if eSignet checks the client assertion before the code.

Next thing to check: the stored client row
(`docker compose exec -T database psql -U postgres -d mosip_esignet -c "SELECT id, status, public_key FROM esignet.client_detail;"`)
and eSignet's client-assertion validation for this build. Until then, use the
mock wallet or the Inji Wallet app (pre-authorized flow) for live runs.

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
ports `8099`, `8091`, and `3000` must be reachable from the phone. To scan the
playground's credential offers and presentation requests, the phone must also
reach the public Certify and Verify addresses; see [Phones and tunnels](#phones-and-tunnels).

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
