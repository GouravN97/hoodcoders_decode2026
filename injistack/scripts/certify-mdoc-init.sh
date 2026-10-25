#!/bin/sh
# One-shot for certify-mdoc, the second Certify that issues Certify's own mock mDoc (mDL):
#   /mdoc-key/mosip.certify.mock.mdoc.issuer-key-cert   "<base64 PKCS#8 key>||<base64 PEM certificate>",
#                                                       read by certify-mdoc as a Spring config tree
#   /mdoc-key/issuer.crt                                the issuer certificate, trusted by the mock verifier
#   database inji_certify_mock                          Certify's schema plus one mso_mdoc configuration
# Both are created once and kept. The key is a throwaway P-256 key made here, never committed.
# Runs in the postgres image, which ships psql and openssl.
set -eu

KEY_DIR=/mdoc-key
SECRET="$KEY_DIR/mosip.certify.mock.mdoc.issuer-key-cert"
if [ -s "$SECRET" ] && [ -s "$KEY_DIR/issuer.crt" ]; then
  echo "mDoc issuer key exists"
else
  echo "Creating the mDoc issuer key and certificate"
  tmp=$(mktemp -d)
  openssl ecparam -name prime256v1 -genkey -noout -out "$tmp/key.pem"
  openssl pkcs8 -topk8 -inform PEM -outform DER -nocrypt -in "$tmp/key.pem" -out "$tmp/key.der"
  openssl req -new -x509 -days 3650 -sha256 -key "$tmp/key.pem" -out "$KEY_DIR/issuer.crt" \
    -subj "/C=IN/O=Inji Interop Playground (mock)/CN=Playground mock mDoc issuer"
  printf '%s||%s' "$(base64 -w0 "$tmp/key.der")" "$(base64 -w0 "$KEY_DIR/issuer.crt")" > "$SECRET"
  chmod 644 "$SECRET" "$KEY_DIR/issuer.crt"
  rm -rf "$tmp"
fi

export PGPASSWORD=postgres
psql_() { psql -h database -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
if [ "$(psql_ -tAc "SELECT 1 FROM pg_database WHERE datname='inji_certify_mock'")" = "1" ]; then
  echo "Database inji_certify_mock exists"
else
  echo "Creating database inji_certify_mock"
  sed 's/inji_certify\b/inji_certify_mock/g' /db/certify_init.sql | psql_
  psql_ -d inji_certify_mock -f /db/certify-mdoc-config.sql
fi
