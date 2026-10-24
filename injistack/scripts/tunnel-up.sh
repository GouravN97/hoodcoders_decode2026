#!/usr/bin/env bash
# tunnel-up.sh — Start two cloudflared quick tunnels, update .env with the new hostnames,
# update the DID in the database, and restart the affected containers.
#
# Usage (from injistack/):
#   ./scripts/tunnel-up.sh
#
# Requires: cloudflared, docker, curl, python3
# Reads: .env (for OIDC_P12_PASSWORD etc — not modified beyond the four tunnel vars)
# Writes: .env (CERTIFY_PUBLIC_HOST, VERIFY_PUBLIC_HOST, VERIFY_PUBLIC_URL, VERIFY_DID)
set -euo pipefail

cd "$(dirname "$0")/.."

# ── helpers ──────────────────────────────────────────────────────────────────
fail()    { echo "error: $*" >&2; exit 1; }
info()    { echo "▶ $*"; }
cleanup() {
  info "Shutting down tunnels (PIDs: $CERTIFY_PID $VERIFY_PID) …"
  kill "$CERTIFY_PID" "$VERIFY_PID" 2>/dev/null || true
}

command -v cloudflared >/dev/null || fail "cloudflared not found. Install with: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
command -v docker      >/dev/null || fail "docker not found"
command -v python3     >/dev/null || fail "python3 not found"

LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

# ── start both tunnels ────────────────────────────────────────────────────────
info "Starting certify tunnel on port 8443 …"
cloudflared tunnel --url http://localhost:8443 --no-autoupdate \
  > "$LOGDIR/certify.log" 2>&1 &
CERTIFY_PID=$!

info "Starting verify tunnel on port 8443 …"
cloudflared tunnel --url http://localhost:8443 --no-autoupdate \
  > "$LOGDIR/verify.log" 2>&1 &
VERIFY_PID=$!

# We'll kill these if we can't get hostnames, but once .env is updated the
# user keeps them running in background — so we DON'T register a kill trap yet.

# ── wait for both hostnames ───────────────────────────────────────────────────
info "Waiting for tunnel hostnames (up to 30 s each) …"

wait_hostname() {
  local log="$1" label="$2" host="" i
  for (( i=0; i<60; i++ )); do
    host="$(grep -oP '(?<=https://)[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1)"
    [[ -n "$host" ]] && { echo "$host"; return; }
    sleep 0.5
  done
  echo "" >&2
  echo "error: timed out waiting for $label tunnel hostname. Log:" >&2
  cat "$log" >&2
  kill "$CERTIFY_PID" "$VERIFY_PID" 2>/dev/null || true
  exit 1
}

CERTIFY_HOST="$(wait_hostname "$LOGDIR/certify.log" "certify")"
VERIFY_HOST="$(wait_hostname "$LOGDIR/verify.log"  "verify")"

# Sanity: they must be different (cloudflare gives each process a unique name)
if [[ "$CERTIFY_HOST" == "$VERIFY_HOST" ]]; then
  fail "Both tunnels got the same hostname ($CERTIFY_HOST). Re-run the script."
fi

info "Certify tunnel: https://$CERTIFY_HOST"
info "Verify  tunnel: https://$VERIFY_HOST"

# ── update .env ───────────────────────────────────────────────────────────────
info "Updating .env …"

set_env_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    # Replace in-place (works on Linux)
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

[[ -f .env ]] || touch .env

set_env_var "CERTIFY_PUBLIC_HOST" "$CERTIFY_HOST"
set_env_var "VERIFY_PUBLIC_HOST"  "$VERIFY_HOST"
set_env_var "VERIFY_PUBLIC_URL"   "https://${VERIFY_HOST}:8443"
set_env_var "VERIFY_DID"          "did:web:${VERIFY_HOST}%3A8443:v1:verify"

info ".env updated."

# ── update the DID in the database ───────────────────────────────────────────
info "Updating credential_config DID in database …"

# Find all credential config IDs and update them
DB_CMD=(docker compose exec -T database psql -U postgres -d inji_certify)

# List configs so we know what we're updating
CONFIGS="$("${DB_CMD[@]}" -tAc "SELECT id FROM certify.credential_config;" 2>/dev/null || true)"
if [[ -z "$CONFIGS" ]]; then
  info "  (no credential_config rows yet — skipping DID update)"
else
  NEW_DID="did:web:${CERTIFY_HOST}%3A8443:v1:certify"
  "${DB_CMD[@]}" -c "UPDATE certify.credential_config SET did_url='${NEW_DID}';" 2>/dev/null
  info "  DID updated to: $NEW_DID (rows: $(echo "$CONFIGS" | wc -l | tr -d ' '))"
fi

# ── restart affected containers ───────────────────────────────────────────────
info "Restarting certify-service and certify-nginx (picks up new hostname) …"
docker compose restart certify certify-nginx

# ── wait for nginx to be healthy ─────────────────────────────────────────────
info "Waiting for nginx health check …"
for (( i=0; i<30; i++ )); do
  code="$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:8443/.well-known/openid-credential-issuer" 2>/dev/null || true)"
  if [[ "$code" == "200" ]]; then
    info "Certify is responding (HTTP 200)."
    break
  fi
  sleep 2
done

# ── detach the tunnels into background ────────────────────────────────────────
# Move log tails to a permanent location so the user can check them
TUNNEL_LOGS="$HOME/.injistack-tunnels"
mkdir -p "$TUNNEL_LOGS"
cp "$LOGDIR/certify.log" "$TUNNEL_LOGS/certify.log"
cp "$LOGDIR/verify.log"  "$TUNNEL_LOGS/verify.log"

# Disown the processes — they keep running after this script exits
disown "$CERTIFY_PID" 2>/dev/null || true
disown "$VERIFY_PID"  2>/dev/null || true

# ── summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Certify : https://$CERTIFY_HOST"
echo "  Verify  : https://$VERIFY_HOST"
echo ""
echo "  Tunnels are running in the background (PIDs $CERTIFY_PID / $VERIFY_PID)."
echo "  Logs: $TUNNEL_LOGS/"
echo ""
echo "  To stop tunnels:"
echo "    kill $CERTIFY_PID $VERIFY_PID"
echo ""
echo "  Credential offer adb command:"
echo "    adb shell \"am start -W -a android.intent.action.VIEW -d '<openid-credential-offer://...>'\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
