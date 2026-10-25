# playground-ui

Everything the user sees for mandatory tasks 2, 3/4, 5 and 7:

| Route | Contents |
| --- | --- |
| `/welcome` | Landing page: what the playground does (issuer → wallet → verifier, OpenID4VCI / OpenID4VP), what a run shows, links to the New run page, photo credits. Linked as **Welcome** in the sidebar |
| `/` | Issuer / Wallet / Verifier selector built from `catalog/*.yaml` (three columns, Issuer → Wallet → Verifier, on screens 1280 px and wider; stacked rows that scroll sideways below that), run settings (format, credential, flow, expected result), compatibility hint, Run button |
| `/history` | Saved runs with filters (module versions, format, outcome, mode, tamper, date; kept in the URL) and the **Matrix** tab: latest result per issuer × wallet × verifier × format, exportable as Markdown. In mock mode it starts with runs marked **sample** (`src/mocks/samples.ts`). Linked as **History** in the sidebar |
| `/runs/:id` | Live phase stepper, QR / link delivery, "I can see the credential" confirmation, Valid / Invalid / Valid-but-Expired banner. A side menu switches between the credential card, the protocol inspector (raw / decoded / headers, secrets masked) and the pass/fail report with Markdown and JSON downloads; `?view=credential\|inspector\|report` picks one, otherwise it shows the inspector while the run is live and the report once it has finished |

## Themes

Two themes, switched at the bottom of the sidebar (or the menu on phones) and remembered per browser: **Noble** (light, the default, after the Noble Finance Figma template) and **Dashdark** (dark, after the Dashdark X admin kit). Colours and fonts are tokens in `src/index.css`; the few shape differences use the `dashdark:` Tailwind variant. `src/theme.ts` switches `data-theme` on `<html>`, and a small script in `index.html` applies the saved theme before first paint.

## Landing page images

The landing page uses free Unsplash photos (Unsplash License; no Unsplash+, Getty, iStock, Adobe Stock or Alamy) and illustrations and icons supplied by the team whose source and licence are **not yet confirmed**: confirm or replace those before publishing the page. The list, with photographer, source and licence for each, is in `src/features/landing/photos.ts` and `public/landing/CREDITS.md`. The files go in `public/landing/`:

```sh
pnpm photos:fetch            # download any missing Unsplash photos (add --force to re-download)
```

Behind an HTTPS proxy, prefix it with `NODE_USE_ENV_PROXY=1`. Until a file is there, the page shows a theme-coloured placeholder in its place.

## Mock mode vs. real BFF

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_USE_MOCKS` | `true` in `pnpm dev`, `false` in builds | `true`: MSW serves the REST API from `src/mocks/` and runs are simulated in the browser |
| `VITE_BFF_URL` | empty (same origin) | BFF origin when mocks are off |

With mocks off (the Docker Compose build), the UI calls the BFF REST endpoints from plan §11.2 and joins the socket.io room per run (`run.subscribe` / `run.unsubscribe`, events from plan §11.3). Every response and event is validated against the schemas in `packages/shared`.

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
PLAYGROUND_LIVE_URL=http://localhost:8100 pnpm e2e   # e2e/live.spec.ts against the running Compose stack (real BFF, Certify, Verify, mock wallet)
```
