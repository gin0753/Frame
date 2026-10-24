# Visual reference and verification context

The public repository retains two representative production Homepage screenshots, not the execution history:

| Viewport    | Reference                                                            | SHA-256                                                            |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 393 x 852   | [Mobile Homepage](screenshots/stage-1.1/homepage/393-homepage.png)   | `0f902aeab89348cb434294d9e05abb66e89edad6aba4444a35ce7ac10ee9be58` |
| 1440 x 1000 | [Desktop Homepage](screenshots/stage-1.1/homepage/1440-homepage.png) | `1260848fb71294475b472eb601f28a63443ca032cf6e12ac5e400c5520c6a9d4` |

These are exact-byte copies from the corresponding `docs/baselines/stage-1.1/homepage/` paths. They show the existing fixture-based design, not future live API behavior.

## Verification context

The retained local production smoke record used Headless Chromium 151.0.7922.34, DPR 1, touch enabled, mobile emulation below 768px, with no CPU/network throttle, build `H7jK4oq80-zAnxrcrcECM`. The seven widths were 320, 375, 393, 430, 768, 1024 and 1440px. Its browser summary recorded 201 passing checks; supplemental fixture/control/swipe/attribution checks were separately retained. This is historical functional evidence, not a new browser run, a performance PASS or portable certification.

See [maintained quality debt](../engineering-debt.md) for the explicit input-performance FAIL, desktop LCP debt, deferred menu motion, coverage limits and integration gates. [Asset provenance](../movie-assets.md) records licensing and adaptations.

## Local historical evidence

Raw screenshots, traces, all passing/failing/pilot measurements, corrected collectors, detailed reports and the former 172-copy evidence inventory remain locally available but excluded from Git. No originals or archives were deleted. The former public catalog/manifest/verification JSON files remain local lookup aids; they describe the earlier selection and are not the current public inventory.

The private sibling `Frame-evidence-archive` contains bundle `snapshot-20261024T001556028Z-378056`: ten stage/source/scratch TARs, `file-manifest.json`, `archive-catalog.json`, `SHA256SUMS` and `RESTORE.md`. It is not publicly hosted. The checksum-file SHA-256 is `9ae481b041c8995b92adcabedba83588e394e39885e7406d88b1542b3fc410de`. Source snapshot and historical stage archives cover the frozen inventory; later hygiene reports remain local and must not be assumed present in that older snapshot.

For retrieval, obtain the private bundle from its owner. Look up an original repository-relative path in `file-manifest.json` for its archive/member, size and SHA-256. Verify the checksum file and all listed hashes, then follow the bundle's restoration instructions into a new empty directory outside the checkout. Reject unsafe, duplicate or unexpected members; validate every extracted size/hash. Do not overwrite the live checkout or execute archived collectors/mutators during restoration. The source snapshot contains the older ignore policy.

Historical Markdown links to excluded evidence do not resolve in a Git-only checkout. In particular, the frozen roadmap's dated browser-baseline report link is intentionally archival; its target remains unchanged locally. Use the private original-path lookup and restoration rather than interpreting missing historical links as a current status record. All current README, ADR and maintained-document links use retained files.

**Independent backup and off-machine retrieval: NOT PERFORMED, RISK ACCEPTED for initial-commit progression.** All full evidence copies remain on the local C: drive. Disk loss can destroy originals, archives and verified extraction together; they are not disaster-resistant backups. No upload or independent copy is claimed.
