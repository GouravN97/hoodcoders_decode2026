# Reports

| File | What it is |
| --- | --- |
| [`interop-suite.md`](interop-suite.md) | The nightly interop suite ([`matrices/nightly.yaml`](../matrices/nightly.yaml)), run with `make up-mdoc && make interop` against the pinned local stack on 26 October 2026: 30 lanes (six against MOSIP Collab's Inji Verify), 27 pass, 3 known gaps |
| [`interop-matrix.md`](interop-matrix.md) | The interoperability matrix of every saved run on that stack (`make matrix`), including the Inji Wallet emulator runs, the Hovi and Animo issue-only runs and the MOSIP Collab runs |

The run links point at the local playground (`http://localhost:8100`), where the runs are saved. The nightly workflow publishes fresh copies of both files to the [`interop-reports`](../../../tree/interop-reports) branch.
