#!/bin/sh
# Points the seeded credential configurations at the issuer DID for CERTIFY_PUBLIC_HOST (portless, as
# CERTIFY_DID in docker-compose.yml).
# Runs once, when the database volume is first created (docker-entrypoint-initdb.d).
set -eu
did="did:web:${CERTIFY_PUBLIC_HOST:-certify.localhost}"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d inji_certify -v did="$did" <<'SQL'
UPDATE certify.credential_config SET did_url = :'did';
SQL
echo "Certify credential configurations use $did"
