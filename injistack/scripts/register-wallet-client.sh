#!/usr/bin/env bash
# Registers Mimoto's eSignet OIDC client (`wallet-demo`) with the public key of the
# `wallet-demo-client` entry in certs/oidckeystore.p12. Run it from injistack/ once the
# esignet profile is healthy, and again after `docker compose down -v` (the client lives
# in the Postgres volume).
#
#   ./scripts/register-wallet-client.sh
#
# Reads OIDC_P12_PASSWORD from .env (default: local). Needs openssl, node and curl.
# Override ESIGNET_URL, CLIENT_ID, KEY_ALIAS or KEYSTORE through the environment.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  # Only the one variable; .env may contain values that are not valid shell.
  OIDC_P12_PASSWORD="${OIDC_P12_PASSWORD:-$(sed -n 's/^OIDC_P12_PASSWORD=//p' .env | tail -1)}"
fi
P12_PASS="${OIDC_P12_PASSWORD:-local}"
ESIGNET_URL="${ESIGNET_URL:-http://localhost:8088}"
CLIENT_ID="${CLIENT_ID:-wallet-demo}"
KEY_ALIAS="${KEY_ALIAS:-wallet-demo-client}"
KEYSTORE="${KEYSTORE:-certs/oidckeystore.p12}"

fail() { echo "error: $*" >&2; exit 1; }

[[ -e "$KEYSTORE" ]] || fail "$KEYSTORE not found. Generate it first (see README, 'Mimoto keystore')."
[[ -d "$KEYSTORE" ]] && fail "$KEYSTORE is a directory: Docker created it because the file was missing when the wallet profile started. Remove it with 'sudo rm -rf $KEYSTORE', create the keystore, then 'docker compose --profile esignet --profile wallet rm -sf mimoto-service inji-web'."
for tool in openssl node curl; do command -v "$tool" >/dev/null || fail "$tool is not installed"; done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Keystores from certgen / Java keytool use RC2-40, which OpenSSL 3 only reads with -legacy.
p12() { openssl pkcs12 -legacy "$@" 2>/dev/null || openssl pkcs12 "$@"; }

p12 -in "$KEYSTORE" -passin "pass:$P12_PASS" -nokeys -clcerts -out "$tmp/all.crt" \
  || fail "cannot open $KEYSTORE with the password from OIDC_P12_PASSWORD (Mimoto will fail with 'keystore password was incorrect')."

# Mimoto's key manager adds its own ROOT and MIMOTO entries to this file, so select the alias explicitly.
awk -v a="friendlyName: $KEY_ALIAS" 'index($0,a){f=1} f&&/BEGIN CERT/{p=1} p{print} p&&/END CERT/{exit}' \
  "$tmp/all.crt" > "$tmp/client.crt"
[[ -s "$tmp/client.crt" ]] || fail "no '$KEY_ALIAS' entry in $KEYSTORE. Entries: $(grep -o 'friendlyName: .*' "$tmp/all.crt" | tr '\n' ' ')"

JWK="$(node -e "
const c=require('crypto'),f=require('fs');
const j=c.createPublicKey(f.readFileSync(process.argv[1])).export({format:'jwk'});
j.alg='RS256'; j.use='sig';
process.stdout.write(JSON.stringify(j));" "$tmp/client.crt")"
echo "Public key for $KEY_ALIAS: n=$(node -e "console.log(JSON.parse(process.argv[1]).n.slice(0,16))" "$JWK")…"

# Same shape as the Postman 'Create client' request. Only these userClaims are accepted by
# eSignet 2.0 here (individual_id, gender and birthdate are rejected with invalid_claim).
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
BODY="$(cat <<EOF
{
  "requestTime": "$NOW",
  "request": {
    "clientId": "$CLIENT_ID",
    "clientName": "Inji Wallet (local)",
    "clientNameLangMap": { "eng": "Inji Wallet (local)" },
    "relyingPartyId": "$CLIENT_ID",
    "logoUri": "https://mosip.github.io/inji-config/logos/agro-vertias-logo.png",
    "redirectUris": ["http://localhost:3004/redirect", "io.mosip.residentapp.inji://oauthredirect"],
    "userClaims": ["name", "email", "picture", "phone_number", "address"],
    "authContextRefs": ["mosip:idp:acr:generated-code", "mosip:idp:acr:password", "mosip:idp:acr:biometrics"],
    "publicKey": $JWK,
    "grantTypes": ["authorization_code"],
    "clientAuthMethods": ["private_key_jwt"],
    "additionalConfig": { "require_pushed_authorization_requests": false, "dpop_bound_access_tokens": false, "require_pkce": false }
  }
}
EOF
)"

RESPONSE="$(curl -sS -X POST "$ESIGNET_URL/client-mgmt/client" -H 'Content-Type: application/json' -d "$BODY")" \
  || fail "eSignet is not reachable at $ESIGNET_URL (is the esignet profile up?)"
echo "Create client: $RESPONSE"

if grep -q 'duplicate_client_id' <<<"$RESPONSE"; then
  echo "The client already exists; this script leaves its key unchanged. To re-register it with a new"
  echo "keystore, delete the client and run this script again:"
  echo "  docker compose exec -T database psql -U postgres -d mosip_esignet -c \"DELETE FROM esignet.client_detail WHERE id='$CLIENT_ID';\""
elif ! grep -q "\"clientId\":\"$CLIENT_ID\"" <<<"$RESPONSE"; then
  fail "registration failed (see the response above)"
fi

echo "Stored client: $(curl -sS "$ESIGNET_URL/client-mgmt/client/$CLIENT_ID")"
