# FRAME — Master Roadmap, Stages 0–15

**Baseline:** 2026-10-23 · **Status:** Stage 0.3 documentation-frozen; approved 2026-10-23 · **Release:** One bounded V1, then freeze

## 1. Governance

Each stage must have a defined scope, substage exit criteria, named dependencies and recorded review. Codex receives only the current stage brief and relevant architecture/contracts; it must not implement later stages opportunistically. Implementation is finished only after human UI review, automated checks, regression check and documentation updates. Do not silently redesign the approved architecture.

**Workflow:** brief → inspect existing code → implement narrow scope → lint/typecheck/tests/build → visual/manual QA → document deviations/ADR → approve gate → next substage. Do not rewrite Stage 0.2A/0.2B prototype from scratch. Maintain `docs/decisions/` ADRs and a running stage changelog.

**Stage naming decision:** older references to “Stage 0.2C” mean the interaction/motion work now named **Stage 0.4**. It is one stage, not two; earlier reports remain historical. Stage 0.2B.3 is the current responsive implementation baseline, not proof of final browser QA. Stage 0.3 reconciles these four documents only. Decision records/changelog infrastructure is created in later authorized work, not required as extra files in this documentation task.

## 2. Dependency spine

```text
Stage 0 (specifications and visual validation)
   |
Stage 1 (full-stack foundation)
   |
Stage 2 (TMDB integration) --> Stages 3–6 (public discovery)
                                   |
Stage 7 (identity) ----------------+
   |
Stages 8–10 (personal library, watched, reviews)
   |
Stage 11 (explainable recommendations)
   |
Stages 12–15 (integration, quality, deployment, freeze)
```

The linear order is a release planning default, not a ban on independent work; entry gates determine readiness.

## 3. Stage definitions

| Stage  | Title                                    | Substages                                                                                                                                                                            | Depends on                                 | Exit / acceptance                                                                                                                                                                                                                 |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | Product, visual & technical foundation   | 0.1 Vision; 0.2A design baseline; 0.2B clickable visual prototype and polish; **0.3 product/architecture/data/API/roadmap**; 0.4 interaction/motion prototype + architecture handoff | —                                          | Signed-off four docs, visual direction, reduced-motion principles; no backend/auth/live API in Stage 0                                                                                                                            |
| **1**  | Full-stack foundation                    | 1.1 preserve web/workspace and verify routing design; 1.2 NestJS skeleton/config; 1.3 PostgreSQL/Prisma/migrations; 1.4 authoritative Zod contracts, generated OpenAPI and CI        | 0.3, 0.4 baseline review                   | Web/API boot independently; ingress prefix and server-only origin verified; fixed rating/watched schema; runtime contracts/examples and CI green                                                                                  |
| **2**  | TMDB catalog integration                 | 2.1 provider adapter/credentials; 2.2 normalized DTOs and MoviePreview adaptation; 2.3 caching/timeouts/failure mapping; 2.4 fixture parity and image/attribution verification       | 1                                          | Real trending/popular/genres/detail; null/identity/runtime mapping tests; no browser secrets; provider caps, image/cache/snapshot rights verified or snapshots disabled with ID fallback                                          |
| **3**  | Homepage Production Integration & Polish | 3.1 audit/reuse Stage 0.2B.3 components; 3.2 server composition/live adaptation; 3.3 independent skeleton/error/empty fallbacks; 3.4 responsive/visual regression                    | 2, reviewed 0.4 baseline                   | Existing design/components preserved; bounded Hero enrichment; truthful section sources and genre counts; per-section outages; working external destinations/labels until Stage 5; attribution and screenshot comparison reviewed |
| **4**  | Explore & search                         | 4.1 search route; 4.2 discover/filter/sort; 4.3 URL state and pagination; 4.4 accessibility/perf QA                                                                                  | 2–3                                        | Deep links/back/refresh work, invalid filters handled, responsive usable results                                                                                                                                                  |
| **5**  | Movie detail & metadata                  | 5.1 detail page and credits; 5.2 trailers/links and optional facts; 5.3 loading/missing fields and SEO; 5.4 canonical navigation transition                                          | 2, 4                                       | Details reflect actual data; missing fields/404 and attribution verified; switch verified live movie links from TMDB to tested internal routes with destination-aware labels; no dead links                                       |
| **6**  | Discovery polish & people context        | 6.1 related movies and navigation; 6.2 cast/director presentation; 6.3 keyboard/mobile polish; 6.4 performance checkpoint                                                            | 3–5                                        | Public discovery → film comprehension journey polished; limited person page only if approved                                                                                                                                      |
| **7**  | Identity & sessions                      | 7.1 auth schema/security ADR; 7.2 register/login/logout; 7.3 access control and session lifecycle; 7.4 account UI/tests                                                              | 1, 5                                       | Secure sign-in, persisted session, logout/revocation, owner route protection, CSRF defense as needed                                                                                                                              |
| **8**  | Watchlist & Favorites                    | 8.1 library PATCH API; 8.2 detail/card actions; 8.3 list pages and snapshot enrichment; 8.4 optimistic/concurrency/outage/ownership QA                                               | 7, 5, Stage 2 provider-policy verification | Save/remove persists; unrelated flag updates survive concurrency; bounded enrichment; library works without catalogue; private isolation/cache exclusions                                                                         |
| **9**  | Watched tracking & journal shell         | 9.1 independent watched boolean/optional viewedOn; 9.2 watched library; 9.3 unified personal status UX; 9.4 invariant tests                                                          | 8                                          | Mark watched without a date; edit/clear date; unmark clears date; no implicit rating/review side effect; atomic state/date consistency                                                                                            |
| **10** | Ratings & private reviews                | 10.1 score and review API using settled schemas; 10.2 integer rating UI; 10.3 plain-text editor; 10.4 edit/delete/ownership tests                                                    | 7–9                                        | One integer 1–10 rating and one editable private review per film; persistence/ownership; no review version-history feature                                                                                                        |
| **11** | Personalization V1                       | 11.1 signals and eligibility; 11.2 deterministic rank + reason codes; 11.3 cold start and exclusions; 11.4 For You UI and tests                                                      | 8–10, 2                                    | Suggestions differ by signals, show explainable reasons, exclude watched, cold start works                                                                                                                                        |
| **12** | End-to-end UX integration                | 12.1 cohesive navigation and account journey; 12.2 edge/error/loading states; 12.3 responsive/keyboard/reduced-motion audit; 12.4 design consistency                                 | 3–11                                       | Four-pillar journey complete, no orphan screens, visual language coherent                                                                                                                                                         |
| **13** | Testing, security & performance          | 13.1 contract and API tests; 13.2 full browser journeys; 13.3 security/privacy review; 13.4 CWV/image/bundle QA                                                                      | 1–12                                       | Ownership/CSRF/session tests, critical E2E green, measurable perf/accessibility budget                                                                                                                                            |
| **14** | Deployment & release readiness           | 14.1 infrastructure/secrets/migrations; 14.2 staging smoke; 14.3 observability/backups; 14.4 production release checklist                                                            | 13                                         | Repeatable deployments, healthy telemetry, documented recovery, real production smoke                                                                                                                                             |
| **15** | V1 acceptance & freeze                   | 15.1 requirements audit; 15.2 bug/perf stabilization; 15.3 portfolio documentation/demo; 15.4 V1 tag/freeze                                                                          | 14                                         | Demonstrated golden flow, stage signoffs, final docs, released/tagged V1; no V2 expansion                                                                                                                                         |

## 4. Stage 0 precise boundary

**Completed or previously in progress:** 0.1 product direction, 0.2A design foundation, 0.2B film-focused visual prototype/polish. Do not claim the 0.2B final QA is complete without a review record. **Stage 0.3 documentation-frozen:** the user reviewed and approved the four reconciled documents as the V1 design baseline on **2026-10-23**. **Current 0.4.0:** Browser Preservation Baseline only, before motion changes. Subsequent 0.4 work validates motion/interaction and architecture handoff, _not_ production backend implementation.

Stage 0.3 deliverables: `product-specification.md`, `architecture.md`, `data-and-api-design.md`, `master-roadmap.md`. Acceptance: aligned four pillars; realistic V1 in/out boundaries; data ownership and TMDB IDs clear; tested-by-design API semantics; 16 numbered main stages 0–15; every stage has substages, dependencies, acceptance; unresolved decisions listed instead of disguised assumptions.

### Mandatory Stage 0.4 entry gate: browser preservation baseline

Before changing motion, capture and review the existing Stage 0.2B.3 Homepage at **320, 375, 393, 430, 768, 1024 and 1440px**. Record browser/version, viewport, fixture data and baseline revision, screenshots of every section, keyboard focus, menu Escape/focus restoration, reduced motion, carousel swipe/drag-click suppression/bounds/buttons and Genre Browser disclosure/filter behavior. Check document scrollWidth/clientWidth **and** individual card/metadata/control clipping; intentional next-card peeking is expected, page-level horizontal scrolling is not. Verify long titles, Hero crop/readability and preserved imagery credits. Record any accepted defect explicitly; do not silently freeze a defect as a desired design.

The prior mobile report leaves browser checks unverified, so this gate is pending. If browser automation is unavailable, manual browser evidence/review is required; lack of tooling does not waive the gate. Stage 0.4 uses existing Motion/Embla/CSS primitives and preserves tokens/layout, SSR/client boundaries, native vertical scrolling and reduced motion. Its exit compares against the reviewed baseline. Stage 3 repeats the same matrix with live/empty/missing-image/section-error states and separate fixture comparisons to distinguish new content from layout regressions. Mocked Embla component tests do not substitute for real browser geometry/swipe checks.

**Stage 0.4.0 evidence recorded 2026-10-23:** [Browser Preservation Baseline report](stage-0.4.0-browser-baseline-report.md) captures the seven-width Chromium matrix and screenshots. Assessment: **PASS WITH CONDITIONS**; Genre Browser reset-position defect D1 remains unfixed/unaccepted, and screenshot review is pending. The motion-entry gate is not yet unconditionally cleared. This evidence supplements the prior unverified report; it does not waive any implementation-verification gate or authorize motion work.

## 5. Non-negotiable cross-cutting standards

- Prioritize front-end craft: consistent icons/sizes/spacing, clear controls, cinematic restraint, meaningful animation, responsive layouts.
- Accessibility: keyboard access, focus visibility, readable contrast and reduced motion from the beginning.
- Privacy: user's watchlists, ratings and reviews are private in V1 unless explicitly authorized otherwise; never show one user's records to another.
- Security: credentials and TMDB token server-only; validate inputs, enforce ownership server-side, protect sessions.
- Reliability: empty/loading/errors/failures are first-class UX; no fabricated movie/score data.
- Quality: stage-by-stage testing, traceable scope changes and reproducible build/deploy.
- No streaming, public social graph, ML recommendation engine, scraping, or unnecessary infrastructure.

## 6. Quality gates and handoff template

For every substage, Codex must report: (1) exact implemented scope; (2) changed files; (3) architecture decisions; (4) commands/results for lint, typecheck, unit/e2e/build as applicable; (5) screenshots or visual review notes for UI work; (6) known limitations; (7) explicit non-goals; (8) confirmation no future stage was implemented. Fail a gate if critical checks are skipped without explanation.

**Release test:** clean-account public discovery → movie details → auth → Watchlist → Watched → rating/review → explainable For You → save another movie → sign out/in and verify state. Simulate missing TMDB metadata, upstream outage and private-resource access from another account.

## 7. Risk register

| Risk                                                    | Mitigation                                                                                                          | Stage to resolve |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------- |
| UI polish cannibalizes product completion               | Time-box interactions; acceptance based on four-pillar loop                                                         | 0.4 / 12         |
| TMDB data gaps, attribution or caching policy           | Provider adapter, optional fields, documented attribution and licensed-use review                                   | 2 / 5            |
| Authentication security or topology drift               | Same-origin ingress/server-origin verification before live integration; cookie/CSRF threat-driven tests before auth | 1 / 7 / 13 / 14  |
| Recommendation scope balloons                           | Explainable deterministic rules with small inputs, no ML                                                            | 11               |
| Review content becomes public social/moderation problem | Personal/private review only                                                                                        | 10               |
| Deployment complexity                                   | Simple web/API/managed DB, no queues or microservices by default                                                    | 14               |

## 8. Change control

Any request that affects V1's four pillars, persistence models, identity, auth transport, data rights or stage ordering requires a short written change proposal: why, options, trade-offs, docs affected, migration/testing impact, approval. Cosmetic tweaks inside accepted design tokens need local review, not broad rearchitecture.

**Definition of V1 complete:** the four pillars form one usable production loop, not commercial-platform feature parity. After Stage 15, freeze V1; improvements are separately scoped rather than automatically extending this roadmap.

## 9. Stage 0.3 reconciliation log and verification handoff

| Audit findings | Documentation correction                                                                                                | Required implementation verification                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| H1, M6         | Repository tokens, Instrument Serif/Inter and Stage 0.2B.3 are authoritative; mandatory pre-motion browser baseline     | 0.4 entry and Stage 3 comparison across all seven widths                                                               |
| H2             | Explicit DTO→MoviePreview mapping, nullability, genre dictionary, runtime/images and bounded Hero enrichment            | Stage 2 contract/adapter tests; Stage 3 component integration                                                          |
| H3, M1         | Simple server composition, truthful section sourcing and independent failure/loading boundaries; no CMS                 | Stage 3 per-source outage/empty/retry tests; healthy sections remain usable                                            |
| H4             | Verified TMDB external destinations until Stage 5, then tested canonical internal routes; destination-aware names       | Stage 3/5 link/accessibility tests; no unverified fixture identity mapping                                             |
| H5             | Same-origin ingress, trusted server-only origin, cookie forwarding and explicit cache exclusions                        | Stage 1 local/deployment routing proof; Stage 7 session/CSRF/private cache tests; Stage 14 production-equivalent smoke |
| H6             | PATCH supplied fields only, atomic updates, deterministic state/date rules and concurrency tests                        | Stage 8 unrelated flags and same-field races; no whole-object stale overwrite                                          |
| M2, M5         | Approved image host/crops/fallbacks, retained Blender plus TMDB credits, private minimal snapshots and bounded batching | Stage 2 current provider rights/retention; Stage 8 outage/expiry/404/batching tests                                    |
| M3, M4         | Integer ratings, independent watched boolean/date; one runtime schema authority, explicit page and recommendation types | Stage 1 schemas/generated OpenAPI/examples; Stage 8–10 invariants                                                      |
| L1, L2         | 0.2C is superseded by 0.4; retain current architecture and defer unnecessary packages/cache/infrastructure              | Stage entry scope review; no duplicate stage or speculative framework                                                  |

**Unresolved choices:** deployment vendors/ingress implementation, compatible OpenAPI generator versions, session expiry/rotation and account-deletion retention details, exact provider page caps and permitted snapshot retention, and whether a limited person page earns Stage 6 scope. These do not reopen the settled routing, contract authority, navigation, visual or domain decisions. Resolve each before its relevant implementation gate; never treat policy-dependent assumptions as verified facts.

**Stage 0.3: DOCUMENTATION-FROZEN — approved by the user on 2026-10-23.** Product, technical, API and scope decisions are unchanged. Approval does not certify runtime behavior, complete the browser baseline, waive any implementation-verification gate above or authorize a commit/deployment. Subsequent stages must satisfy those gates.
