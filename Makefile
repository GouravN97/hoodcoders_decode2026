# One-command entry points for the playground (plan §15.5). The stack itself is
# injistack/docker-compose.yml; these targets only wrap it, so `docker compose` from injistack/
# still works the same way.
#
#   make up         Inji Certify, Inji Verify, the playground, mock wallet and mock verifier
#   make up-phone   the same, plus Cloudflare tunnels so Inji Wallet on a phone or emulator can reach it
#   make matrix     save the interoperability matrix of every saved run to reports/
#   make help       every target

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

STACK_DIR := injistack
COMPOSE   := docker compose --project-directory $(STACK_DIR) -f $(STACK_DIR)/docker-compose.yml
# Extra Compose profiles for `make up`, e.g. PROFILES="mdoc wallet".
PROFILES  ?=
PROFILE_ARGS := $(foreach p,$(PROFILES),--profile $(p))

BFF_URL   ?= http://localhost:8101
UI_URL    ?= http://localhost:8100
# Seconds `make up` waits for the BFF's health report to show every required service up.
WAIT_SECS ?= 420

.PHONY: help
help: ## List targets
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

# ── Workspace ────────────────────────────────────────────────────────────────
.PHONY: install dev test lint typecheck e2e check
install: ## pnpm install
	pnpm install

dev: ## UI against in-browser mocks (no Docker)
	pnpm dev

test: ## Unit tests (Vitest)
	pnpm test

lint: ## ESLint
	pnpm lint

typecheck: ## TypeScript
	pnpm typecheck

e2e: ## Playwright against the mocks; E2E_LIVE=1 runs it against the running stack
	$(if $(E2E_LIVE),PLAYGROUND_LIVE_URL=$(UI_URL) ,)pnpm e2e

check: typecheck lint test ## typecheck + lint + test, as CI runs them

# ── Stack ────────────────────────────────────────────────────────────────────
.PHONY: up up-mdoc up-web up-phone down tunnel-down ps logs health wait
up: ## Start the stack (PROFILES="mdoc wallet esignet" for the optional parts) and wait until healthy
	$(COMPOSE) $(PROFILE_ARGS) up -d --build
	@$(MAKE) --no-print-directory wait
	@echo "Playground: $(UI_URL)"

up-mdoc: ## make up with Certify's mock mDoc issuer
	@$(MAKE) --no-print-directory up PROFILES="mdoc $(PROFILES)"

up-web: ## make up with Mimoto, eSignet and Inji Web
	@$(MAKE) --no-print-directory up PROFILES="wallet esignet $(PROFILES)"

up-phone: ## make up behind Cloudflare quick tunnels, for Inji Wallet on a phone or emulator
	$(COMPOSE) $(PROFILE_ARGS) up -d --build
	PROFILES="$(or $(PROFILES),wallet)" $(STACK_DIR)/scripts/tunnel-up.sh
	@$(MAKE) --no-print-directory wait
	@grep -E '^(CERTIFY|VERIFY)_PUBLIC_URL=' $(STACK_DIR)/.env || true

tunnel-down: ## Stop the tunnels and switch the stack back to localhost hostnames and DIDs
	PROFILES="$(PROFILES)" $(STACK_DIR)/scripts/tunnel-up.sh reset

down: ## Stop the stack (keeps volumes, so saved runs survive)
	$(COMPOSE) --profile mdoc --profile wallet --profile esignet down

ps: ## Container status
	$(COMPOSE) ps

logs: ## Follow logs; S=certify for one service
	$(COMPOSE) logs -f --tail=100 $(S)

health: ## The BFF's health report
	@curl -fsS $(BFF_URL)/api/health | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s);console.log(`overall: $${h.status}`);for(const x of h.services)console.log(`  $${x.status.padEnd(11)} $${x.name}$${x.optional?" (optional)":""}$${x.error?"  "+x.error:""}`)})'

wait: ## Wait until the BFF reports every required service up
	@echo "Waiting for the stack to be healthy (up to $(WAIT_SECS)s; Certify and Verify take a minute or two) …"
	@deadline=$$(( $$(date +%s) + $(WAIT_SECS) )); \
	until curl -fsS $(BFF_URL)/api/health 2>/dev/null | grep -q '^{"status":"up"'; do \
	  if (( $$(date +%s) > deadline )); then echo "Not healthy after $(WAIT_SECS)s:"; $(MAKE) --no-print-directory health || true; exit 1; fi; \
	  sleep 5; \
	done; echo "Stack is up."

# ── Reports ──────────────────────────────────────────────────────────────────
.PHONY: matrix
matrix: ## Save the interoperability matrix of every saved run to reports/interop-matrix.md
	@mkdir -p reports
	curl -fsS "$(BFF_URL)/api/matrix.md" -o reports/interop-matrix.md
	@echo "Wrote reports/interop-matrix.md"
