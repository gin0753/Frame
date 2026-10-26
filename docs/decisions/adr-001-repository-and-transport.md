# ADR-001 — Preserve the npm workspace and establish local API routing

**Date:** 2026-10-24. **Status:** Implemented for Stage 1.1 local configuration; API integration and deployment verification remain open. This records an implementation choice within the frozen Stage 0.3 architecture, not a change to it.

## Context

`apps/web` is the sole initialized npm workspace. `apps/api` and `packages/contracts` contain reservation READMEs only. The existing Homepage, tokens, six Blender fixtures, source credits, D1 snap/reset correction and approved Stage 0.4 feedback must survive full-stack integration. There is no API process or health endpoint yet.

The frozen design requires browser requests under same-origin `/api/v1`, a separate trusted server-only `FRAME_API_ORIGIN`, Nest ownership of API validation/business logic and future deployment ingress routing. Stage 1.1 must establish a feasible local mechanism without creating a mock backend or implementing Stage 1.2.

## Decision

Keep existing npm workspaces, root scripts, package versions/lockfile and web TypeScript settings. Do not initialize empty packages, add a task orchestrator, install a proxy dependency or introduce shared UI/global state infrastructure. Add `apps/api` to the workspace list when Stage 1.2 initializes it, and contracts when Stage 1.4 initializes them.

Use the installed Next.js external rewrite facility for **opt-in local development and local production previews**:

```text
Browser -> Next at http://127.0.0.1:3000
           /api/v1/:path* -> http://127.0.0.1:3001/api/v1/:path*
           all other paths -> existing Next routing

Future Server Component -> trusted FRAME_API_ORIGIN + /api/v1
                          (no browser round-trip through the local proxy)
```

`apps/web/next.config.ts` calls the small typed `config/local-api-rewrites.ts` helper. It returns a single `beforeFiles` rewrite so `/api/v1` belongs to the API before page/static resolution. No Next API route, business logic or request handler is introduced. The wildcard is reused in the destination; the prefix is not stripped. Default Next trailing-slash normalization remains intact.

`FRAME_LOCAL_API_PROXY` must be explicitly `true`; unset/`false` means no local rewrite, and ambiguous values fail configuration. When enabled, `FRAME_API_ORIGIN` is required and must be an HTTP(S) loopback origin (`127.0.0.1`, `localhost` or `[::1]`) without credentials, path, query or fragment. Errors do not echo supplied values. Use distinct web/API ports and a matching bind address; prefer the explicit IPv4 example to avoid localhost IPv4/IPv6 resolution differences.

`apps/web/.env.example` contains only non-secret local values and is opt-in by default. Copy it to `apps/web/.env.local`; Next loads that application directory, not the repository root. The fixture Homepage requires neither file nor API. Restart `next dev` after changing settings. Rewrites are baked into production builds: rebuild local previews when changing them, and use consistent settings at build/start. Do not promote a local-proxy-enabled artifact to deployment.

### Server-only origin and browser isolation

`FRAME_API_ORIGIN` is read only by server configuration today. It is never placed under `NEXT_PUBLIC_*`, `next.config.env`, HTML, props or public diagnostic endpoints. Browser calls use relative `/api/v1/...`; request headers, query parameters and body cannot choose the upstream. No generic fetch/client abstraction is added before it has a consumer. Later Server Component/API-client implementation must retain server-only module enforcement, validate its trusted deployment origin and never import origin configuration into client code.

The installed Next build-manifest implementation omits external rewrite destinations from browser manifests. Verify generated client assets/HTML and browser requests for this actual build; do not assume all future Next versions behave identically. The destination necessarily exists in server build/config artifacts and may appear in local server proxy-error logs. Those are private operational artifacts, not browser assets. Credentials must never be embedded in an origin.

## Deployment responsibilities and security gates

**Settled topology:** deployment ingress routes `/api/v1/*` directly to Nest, preserving the prefix; all other paths go to Next. Disable the local proxy for the deployment build. Set a trusted server-only API origin per service for direct server reads. No vendor, production ingress implementation or deployment is selected/created here.

The local Next rewrite is a routing convenience, **not a hardened production ingress or authentication/CSRF boundary**. Source inspection of installed Next 16.4.2 shows `changeOrigin: true` and `x-forwarded-host` derived from the incoming Host. Other forwarding behavior depends on the request/server path; some forwarded values use existing headers when supplied. Do not trust arbitrary client `Forwarded`/`X-Forwarded-*` headers or derive the API origin, ownership, CSRF origin or secure-cookie decisions from them.

Stage 1.2 must inspect actual Nest-observed Host/protocol/address/prefix/query/method/body and spoofed forwarded headers with the real health path. Keep API loopback-bound locally and configure proxy trust narrowly for the actual immediate peers/topology, not blanket `trust proxy=true`. Deployment ingress must sanitize/replace untrusted forwarding headers, restrict direct API exposure as appropriate, preserve browser Origin for CSRF validation, and verify TLS/proxy trust against its real hop chain. Vendor behavior remains a Stage 14 production-equivalent verification gate.

No cookies or caching policies are implemented by this rewrite. Frozen requirements still apply: initial public server catalogue reads use `no-store` and forward no cookies; private reads forward only the FRAME session cookie to the trusted API with `no-store`. Backend `/auth`, `/me`, personalized and session-cookie responses bypass shared caches with private/no-store behavior. Stage 7 verifies browser cookie issuance/deletion, host-only Path=/ HttpOnly/Secure/SameSite behavior, CSRF, selective server cookie forwarding and cache isolation end to end. Do not assume proxy defaults prove any of this. API redirects/Set-Cookie/header handling must not expose internal origins or rewrite cookies into an incorrect domain; those are future integration tests, not present certifications.

## Verification boundary

Stage 1.1 validates configuration guards, exact generated rewrite patterns, server-only destination placement, unchanged public routes, local failed-upstream behavior and Homepage preservation. There is deliberately no mock listener or manufactured successful `/health` response. An upstream refusal is evidence of an attempted proxy connection, not API availability or complete transport verification.

**Open for Stage 1.2:** successful direct and same-origin health responses; real path/query/method/body/header observation; trusted proxy setup; bounded errors/timeouts and API outage handling. **Open for Stage 7:** session/CSRF/private-cache behavior. **Open for Stage 14:** deployment ingress, HTTPS and production-equivalent secret/cache/header checks. Current integration gates are maintained in [engineering debt](../engineering-debt.md); detailed historical measurements remain in local archives.

## Alternatives and consequences

- A separate local reverse proxy would more closely resemble some deployment vendors but adds an unnecessary process/package/configuration before an API exists. Revisit only if real integration exposes a limitation of the current local mechanism.
- A Next route-handler proxy would introduce custom forwarding/security code and risk duplicating Nest responsibilities; rejected for this scope.
- Browser cross-origin API URLs/CORS would contradict the frozen same-origin design; rejected.

This approach adds no dependency or Homepage hydration cost. Local API absence produces a failed API request while the fixture Homepage remains usable. It does not solve the accepted performance debt: Stage 0.4.2 input responsiveness remains **FAIL** at unchanged p95 ≤100ms / max ≤200ms targets, desktop LCP remains above its 2.5s goal, N1 stays deferred, and browser/device/accessibility limitations remain as documented in the [maintained quality-debt record](../engineering-debt.md).

## Sources inspected

Installed version-specific Next documentation: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md` and `01-app/02-guides/environment-variables.md`. Installed implementation: `dist/server/lib/router-utils/proxy-request.js`, `dist/server/base-server.js`, and `dist/build/webpack/plugins/build-manifest-plugin-utils.js`. These describe this installation; deployment behavior still requires its own proof. No frozen document has been edited.

## Stage 1.2 implementation (26 October 2026)

`apps/api` is now a root npm workspace using NestJS 11 with the Express adapter. The root lockfile remains authoritative. Only health, runtime validation, sanitized errors, HTTP headers and bounded lifecycle shutdown are implemented. The four frozen design documents remain unchanged.

The Stage 1.1 opt-in rewrite remains the sole browser proxy. Next's installed `experimental.proxyTimeout` bounds upstream inactivity at three seconds. Its failure response is generic HTTP 500 plain text; successful Nest responses and Nest error responses are JSON. Disabled rewrites fall through to Next's 404 page. The local proxy remains unsuitable as a hardened production ingress.

The server-only `src/lib/server/health.ts` consumer validates the fixed origin, uses `/api/v1/health` once, sends no cookies, disables caching and redirects, and bounds fetch/body parsing at three seconds. Invalid HTTP status, non-JSON content and invalid health payloads fail with a generic error. `FRAME_API_ORIGIN`, if supplied, is also validated while loading Next configuration, even when rewrites are disabled. The rewrite retains its stricter loopback requirement. Internal deployment origins may be HTTP(S), without credentials, path, query or fragment.

On this Node 24 installation, Next's legacy compiled-config loader failed to resolve relative helpers. Web dev/build/start commands therefore select the installed native TypeScript config loader and use explicit `.ts` configuration imports. Older supported Node 22 installations may need `NODE_OPTIONS=--experimental-transform-types`, as described by the installed Next TypeScript guide.

`npm run test:transport` starts real test-only Nest and Next processes and Chromium, with readiness polling and cleanup. A temporary server-only Next route exercises the direct server fetch; it always denies production and is removed before the production build. Failure/observation controllers exist only in the test fixture. Neither is shipped as an application diagnostic endpoint. The harness must run exclusively against the web build directory; do not run it alongside another Next dev/build process. Browser installation: `npx playwright install chromium`, or set `FRAME_CHROMIUM_EXECUTABLE` to an existing compatible Chromium binary.

Verified development paths are browser → same-origin rewrite → Nest, and Next server execution → validated origin → Nest. Production browser transport is tested separately; production server-side consumption is not claimed because the temporary probe is excluded. Deployment ingress and session behavior remain unverified.
