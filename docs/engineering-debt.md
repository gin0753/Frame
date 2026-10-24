# Engineering debt and integration gates

Updated 24 October 2026. This is the maintained current-status companion to the frozen product, architecture, API and roadmap documents. Conditional progression is not performance certification or a release waiver.

## Open quality risks

- **Input responsiveness: FAIL.** Stage 0.4.2 retains the unchanged lab targets p95 <=100ms and maximum <=200ms. C1/B1/L1 functional changes were conditionally accepted; G1 disclosure feedback was accepted with conditions. N1 mobile menu entrance remains deferred because menu responsiveness is over budget. Stage 13 must investigate and revalidate without weakening thresholds.
- **Desktop LCP exceeds the 2.5s goal.** Historical median samples were 2660/2664ms. This debt remains separate from input responsiveness; no Hero redesign is authorized by acceptance of existing work.
- **Measurement limits.** Corrected Event Timing collection requires explicit action boundaries, nonzero interaction-ID grouping, visible settling between actions, a complete final drain and uncensored late entries. Keep traced diagnostics separate from untraced acceptance runs. Historical 728-872ms entries had overlap/presentation-reporting limitations; focused investigation established neither a safe production optimization nor causation attributable to Stage 0.4.2. Retain all runs, including failures.
- **Coverage limits.** Firefox, WebKit, physical devices, hybrid input, comprehensive screen-reader testing, forced colors, zoom and field Core Web Vitals remain unverified. Chromium smoke results are not a cross-browser or release certification.

The approved Homepage, six fixtures, attribution, reduced motion, Radix focus behavior and Genre Browser D1 correction must survive future integration. Before changing visual behavior, establish a comparable production browser baseline; preserve the existing design rather than rebuild it around API data.

## Integration gates

- Repository: only web is initialized; add API/contracts workspaces when implemented. Nest, database, auth and TMDB are not present.
- Real API transport: verify successful direct and same-origin health requests, preserved prefix/query/method/body, errors/timeouts, Host/protocol/address and spoofed forwarded headers. Use narrow proxy trust; a failed upstream connection is not end-to-end success.
- Contracts/data: implement the frozen authoritative runtime-schema workflow and DTO-to-presentation mapping before replacing fixtures. Preserve verified provider identity and destination-aware navigation.
- Sessions/cache: verify selective server cookie forwarding, session/CSRF behavior, private no-store exclusions, redirects and Set-Cookie handling with a real API.
- Deployment: verify ingress prefix preservation, TLS, forwarding-header sanitization, server-only origin isolation and cache behavior in the selected topology. No deployment vendor or production infrastructure is selected here.

See [ADR-001](decisions/adr-001-repository-and-transport.md) and the [frozen API design](data-and-api-design.md) for decisions; these gates describe verification still required, not new architecture.

## Evidence retention

Historical failures and collector corrections remain in unchanged local evidence and verified TAR archives. [Evidence access](evidence/README.md) describes retrieval. Independent backup and off-machine retrieval are **NOT PERFORMED, RISK ACCEPTED** for initial-commit progression. Same-disk archives are not disaster-resistant backups.
