#!/usr/bin/env bash
# tunnel-up.sh — expose the local stack to a phone or emulator through two Cloudflare quick tunnels.
#
# Starts one tunnel for Certify and one for Verify (both to the HTTPS gateway on :8443), writes the
# new hostnames into .env, recreates the containers that use them, points Certify's credential
# configurations at the new issuer DID, and checks the issuer metadata through the tunnel.
#
# Usage (from injistack/):
#   ./scripts/tunnel-up.sh          # start (replaces any tunnels this script started before)
#   ./scripts/tunnel-up.sh stop     # stop the tunnels
#
# Profiles to bring up default to "wallet"; override with PROFILES="wallet esignet".
# Requires: cloudflared, docker, curl.
set -euo pipefail

cd "$(dirname "$0")/.."

STATE_DIR="$HOME/.injistack-tunnels"
PID_FILE="$STATE_DIR/pids"
PROFILES="${PROFILES:-wallet}"

fail() { echo "error: $*" >&2; exit 1; }
info() { echo "▶ $*"; }

stop_tunnels() {
  if [[ -f "$PID_FILE" ]]; then
    # shellcheck disable=SC2046
    kill $(cat "$PID_FILE") 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  # Tunnels started by older versions of this script, or by hand with the same command.
  pkill -f 'cloudflared tunnel --url https\?://localhost:8443' 2>/dev/null || true
}

if [[ "${1:-}" == "stop" ]]; then
  stop_tunnels
  info "Tunnels stopped."
  exit 0
fi

command -v cloudflared >/dev/null || fail "cloudflared not found. Install: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared && chmod +x ~/.local/bin/cloudflared"
command -v docker >/dev/null || fail "docker not found"
command -v curl   >/dev/null || fail "curl not found"
[[ -f .env ]] || touch .env

mkdir -p "$STATE_DIR"
stop_tunnels

# ── start both tunnels ────────────────────────────────────────────────────────
# The gateway's :8443 listener is HTTPS with a certificate from the local CA, so the tunnel must
# speak HTTPS to it and skip verification. nginx routes on the Host header, which cloudflared keeps.
start_tunnel() {
  local name="$1"
  nohup cloudflared tunnel --url https://localhost:8443 --no-tls-verify --no-autoupdate \
    > "$STATE_DIR/$name.log" 2>&1 &
  echo $! >> "$PID_FILE"
}
info "Starting tunnels …"
start_tunnel certify
start_tunnel verify

wait_hostname() {
  local log="$1" host="" i
  for (( i=0; i<60; i++ )); do
    host="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1 | sed 's|https://||')"
    [[ -n "$host" ]] && { echo "$host"; return 0; }
    sleep 0.5
  done
  return 1
}
CERTIFY_HOST="$(wait_hostname "$STATE_DIR/certify.log")" || { cat "$STATE_DIR/certify.log" >&2; stop_tunnels; fail "no hostname from the certify tunnel"; }
VERIFY_HOST="$(wait_hostname "$STATE_DIR/verify.log")"   || { cat "$STATE_DIR/verify.log"  >&2; stop_tunnels; fail "no hostname from the verify tunnel"; }
[[ "$CERTIFY_HOST" != "$VERIFY_HOST" ]] || { stop_tunnels; fail "both tunnels got the same hostname; run the script again"; }

info "Certify tunnel: https://$CERTIFY_HOST"
info "Verify  tunnel: https://$VERIFY_HOST"

# ── .env ──────────────────────────────────────────────────────────────────────
set_env_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}
set_env_var CERTIFY_PUBLIC_HOST "$CERTIFY_HOST"
set_env_var VERIFY_PUBLIC_HOST  "$VERIFY_HOST"
set_env_var VERIFY_PUBLIC_URL   "https://${VERIFY_HOST}:8443"
set_env_var VERIFY_DID          "did:web:${VERIFY_HOST}%3A8443:v1:verify"
info ".env updated."

# ── recreate containers ──────────────────────────────────────────────────────
# 'restart' keeps the old environment and network aliases; 'up -d' recreates every service whose
# configuration changed (certs reissues the gateway certificate for the new hostnames).
profile_args=()
for p in $PROFILES; do profile_args+=(--profile "$p"); done
info "Recreating containers that use the hostnames (profiles: $PROFILES) …"
docker compose "${profile_args[@]}" up -d

# ── issuer DID in the database ────────────────────────────────────────────────
# Same value as db/04-certify-public-host.sh, which only runs when the volume is first created.
NEW_DID="did:web:${CERTIFY_HOST}%3A8443"
info "Waiting for the database …"
for (( i=0; i<60; i++ )); do
  docker compose exec -T database psql -U postgres -d inji_certify -tAc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 2
done
rows="$(docker compose exec -T database psql -U postgres -d inji_certify -tAc \
  "UPDATE certify.credential_config SET did_url='${NEW_DID}' RETURNING 1;" | grep -c 1 || true)"
info "Issuer DID set to $NEW_DID ($rows credential configurations)."

# ── check through the tunnel ─────────────────────────────────────────────────
# Certify takes a minute or two to start; new quick-tunnel names can also take a moment to resolve.
info "Waiting for the issuer metadata through the tunnel (up to 4 min) …"
META_URL="https://${CERTIFY_HOST}/.well-known/openid-credential-issuer"
ok=""
for (( i=0; i<48; i++ )); do
  body="$(curl -s --max-time 5 "$META_URL" || true)"
  if grep -q "\"credential_issuer\"" <<<"$body"; then ok=1; break; fi
  sleep 5
done
if [[ -n "$ok" ]]; then
  issuer="$(grep -oE '"credential_issuer" *: *"[^"]*"' <<<"$body" | head -1)"
  info "Certify reachable through the tunnel: $issuer"
else
  echo "warning: no issuer metadata at $META_URL yet. Check 'docker compose logs --tail=50 certify certify-nginx'" >&2
  echo "         and the tunnel log in $STATE_DIR/certify.log." >&2
fi

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Certify : https://$CERTIFY_HOST
  Verify  : https://$VERIFY_HOST
  Tunnels run in the background (logs in $STATE_DIR/).
  Stop them with:  ./scripts/tunnel-up.sh stop

  Send a link to the emulator:
    adb shell "am start -W -a android.intent.action.VIEW -d '<openid-credential-offer://… or openid4vp://…>'"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
