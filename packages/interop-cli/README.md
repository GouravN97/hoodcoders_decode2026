# interop-cli

Runs the playground as a test suite (bonus B1). A matrix file under [`matrices/`](../../matrices) lists issuer → wallet → verifier × format lanes. Each lane becomes a normal playground run through the BFF's REST API, so it is recorded with its protocol messages, shown in **History** and counted in the matrix like a run started from the UI. Runs started by the suite are tagged `cli` or `nightly`.

```sh
make up                      # the stack (make up-mdoc for the mDoc lanes)
make interop                 # matrices/nightly.yaml → out/interop/
make interop MATRIX=matrices/demo.yaml

# or directly
pnpm --filter @playground/interop-cli start list --matrix ../../matrices/nightly.yaml
pnpm --filter @playground/interop-cli start run  --matrix ../../matrices/nightly.yaml \
  --bff http://localhost:8101 --out ../../out/interop --headless-only [--only ldp_vc] [--trigger nightly]
```

It writes three files to `--out`:

| File | Contents |
| --- | --- |
| `summary.md` | One row per lane (versions, proof type, expected and observed result, verdict, link to the run's inspector), then failures, known gaps and skipped lanes |
| `junit.xml` | One test case per lane, for CI test reporting. Known gaps and skipped lanes are `<skipped>` |
| `results.json` | Every lane with its full run report |

## Matrix files

The format is the one in plan §14.3: `defaults`, an optional `axes` cross product, `exclude` (drops generated lanes) and `include` (adds lanes). A lane sets the same fields as a run config. When it has no `credentialConfigurationId`, the suite uses the issuer's first configuration of the lane's format, never an expired copy (`T-EXPIRED` picks those itself).

```yaml
include:
  - { issuer: inji-certify, wallet: mock-wallet, verifier: inji-verify, format: ldp_vc,
      tamper: { id: T-WRONG-TYPE }, expectedOutcome: INVALID,
      knownGap: "gap 1: Inji Verify accepts a wrong credential type" }
```

`knownGap` marks a lane that fails because of a documented gap (see the [README](../../README.md#interoperability-gaps-found)). Its failure is reported but does not fail the suite. If it passes, it is reported as **gap fixed?** so the gap can be checked and the lane updated.

## Lane results

| Result | Meaning | Fails the suite |
| --- | --- | --- |
| pass | The run's verdict is Pass (or Pass with warnings) | no |
| fail | The verifier answered something other than expected, or a step failed | **yes** |
| known gap | Failed, and the lane names that gap | no |
| gap fixed? | A known-gap lane passed | no |
| skipped | An implementation is not in the catalog or is down (e.g. the mDoc issuer without `make up-mdoc`), the issuer has no configuration of that format, or `--headless-only` and the wallet needs a person | no |
| error | The BFF refused the run, or it had no result within `--lane-timeout` (the run is then cancelled) | **yes** |

Lanes run one at a time, in file order: the mock wallet is shared, and a `T-NONCE-REPLAY` lane replays an earlier lane's presentation.

## Nightly

[`.github/workflows/nightly-interop.yml`](../../.github/workflows/nightly-interop.yml) runs `make up PROFILES=mdoc` and then `make interop TRIGGER=nightly` every night at 02:00 IST, and on demand. It posts `summary.md` as the job summary and uploads the three files with the matrix and the stack logs. On `main` it also pushes the summary and matrix to the `interop-reports` branch. The suite runs against the pinned local stack. To run it against another deployment of the playground, for example one wired to the MOSIP Collab environment, pass that BFF with `--bff`.
