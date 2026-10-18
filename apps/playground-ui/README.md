# playground-ui

Everything the user sees for mandatory tasks 2, 3/4, 5 and 7:

| Route | Contents |
| --- | --- |
| `/` | Issuer / Wallet / Verifier selector built from `catalog/*.yaml`, run settings (format, credential, flow, expected result), compatibility hint, Run button |
| `/runs/:id` | Live phase stepper, QR / link delivery, "I can see the credential" confirmation, credential card, Valid / Invalid / Valid-but-Expired banner, protocol inspector (raw / decoded / headers, secrets masked), pass/fail report with Markdown and JSON downloads |

## Mock mode vs. real BFF

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_USE_MOCKS` | `true` in `pnpm dev`, `false` in builds | `true`: MSW serves the REST API from `src/mocks/` and runs are simulated in the browser |
| `VITE_BFF_URL` | empty (same origin) | BFF origin when mocks are off |

With mocks off, the UI calls the BFF REST endpoints from plan §11.2 and joins the socket.io room per run (`run.subscribe` / `run.unsubscribe`, events from plan §11.3). Every response and event is validated against the schemas in `packages/shared`.

Contract additions the BFF needs to match (not in the plan):

- `run.artifact` WebSocket event, so the credential card appears without a refetch.
- `GET /api/runs/:id/exchanges` returns full exchanges (bodies included) with an optional `decoded`.
- `Exchange.artifactKinds` (from `ArtifactExtractor`) labels the five named messages in the inspector. Without it, the UI infers them from the protocol step.
- `RunDetail.delivery`, `RunDetail.result` and `RunDetail.artifacts`, so a page refresh restores the live view.

## Mock scenarios

The expected result picks the scenario. Valid → valid credential. Invalid → credential altered after signing. Valid but expired → validity window already closed.

Add `?scenario=fail-at-token`, `?scenario=timeout` or `?scenario=expired` to `/` to force a failure path. Add `?simSpeed=4` to speed runs up. Mock JWTs are really signed with throwaway ES256 keys, and SD-JWT digests are real; all identity data is fake. Mock runs live in memory, so they are gone after a page reload.

⚠️ Inji Certify / Inji Verify endpoint paths and payload shapes in `src/mocks/fixtures.ts` follow public docs and must be checked against the pinned image tags.

## Tests

```sh
pnpm test        # Vitest: decoders, redaction, run reducer over every scenario, selector rules, report renderer
pnpm e2e         # Playwright against a mock build: full runs per format and verdict, inspector, downloads, mobile layout
```
