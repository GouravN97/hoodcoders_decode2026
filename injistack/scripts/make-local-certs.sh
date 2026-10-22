#!/bin/sh
# Creates the local HTTPS material for the public Certify hostname, once per hostname:
#   /certs/ca.crt, ca.key          local certificate authority
#   /certs/certify.crt, .key       server certificate for $CERTIFY_PUBLIC_HOST and $VERIFY_PUBLIC_HOST (served by certify-nginx)
#   /certs/truststore.p12          the JDK's default CAs plus the local CA, for the Java services
#   /export/local-ca.crt           copy of the CA for the host, to trust in a browser or with curl --cacert
# Runs in the inji-verify-service image because it already ships openssl and keytool.
set -eu

HOST="${CERTIFY_PUBLIC_HOST:?CERTIFY_PUBLIC_HOST is not set}"
VERIFY_HOST="${VERIFY_PUBLIC_HOST:?VERIFY_PUBLIC_HOST is not set}"
NAMES="$HOST $VERIFY_HOST"
OUT=/certs
cd "$OUT"

if [ -f certify.crt ] && [ -f truststore.p12 ] && [ "$(cat hostname 2>/dev/null)" = "$NAMES" ]; then
  echo "Local certificates for $NAMES already exist"
else
  echo "Creating local certificates for $NAMES"
  rm -f ca.* certify.* truststore.p12 hostname
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -sha256 \
    -subj "/CN=Inji playground local CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout ca.key -out ca.crt
  openssl req -newkey rsa:2048 -nodes -sha256 -subj "/CN=$HOST" -keyout certify.key -out certify.csr
  printf 'subjectAltName=DNS:%s,DNS:%s,DNS:localhost\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n' "$HOST" "$VERIFY_HOST" > certify.ext
  openssl x509 -req -in certify.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -sha256 \
    -extfile certify.ext -out certify.crt
  rm -f certify.csr certify.ext ca.srl

  cp "$JAVA_HOME/lib/security/cacerts" truststore.p12
  keytool -importcert -noprompt -trustcacerts -alias inji-playground-local-ca -file ca.crt \
    -keystore truststore.p12 -storetype PKCS12 -storepass changeit
  chmod 644 ca.crt certify.crt truststore.p12
  chmod 600 ca.key certify.key
  echo "$NAMES" > hostname
fi

if [ -d /export ]; then
  cp ca.crt /export/local-ca.crt
fi
