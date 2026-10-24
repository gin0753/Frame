# FRAME — Technical Architecture (V1)

**Status:** Stage 0.3 baseline · **Date:** 2026-10-23

## 1. Design goals

Independent, maintainable backend; high-end front-end; typed API boundaries; explicit TMDB dependency; secure account-scoped data; clear SSR/cache choices; affordable and understandable deployment. Avoid premature distribution, complexity and vendor lock-in.

## 2. Logical architecture

```text
Browser
  └─ Next.js / React web app (SSR/RSC where helpful; client islands for interactions)
       ├─ UI/design system/motion
       ├─ URL search/filter/pagination state
       ├─ client query/mutation + optimistic feedback
       └─ typed FRAME API client
                │ HTTPS, credentials where applicable
                ▼
         NestJS API (modular monolith)
           ├─ Auth / Sessions
           ├─ Catalog / TMDB adapter ─────► TMDB API
           ├─ Library (watchlist/favorites/watched)
           ├─ Ratings / Reviews
           ├─ Recommendations (explainable rules)
           └─ Health / Observability
                │
         Prisma data access
                │
         PostgreSQL (FRAME-owned user data + operational records)
```

**Principle:** The browser must not directly use a private TMDB token. Movie metadata comes from TMDB via a backend adapter; user data belongs to FRAME. Avoid persisting a parallel full movie catalog unless a demonstrated product need arises.

## 3. Repository and module boundaries

Target monorepo layout (adapt current repository rather than replacing the existing visual prototype):

```text
apps/web/            # Next.js frontend
apps/api/            # NestJS REST API
packages/contracts/  # versioned DTO schemas and API types, no ORM leakage
packages/ui/         # only if genuine cross-app reuse; otherwise apps/web
infra/               # deploy/env templates
docs/                # four Stage 0.3 documents; future decision records
```

NestJS modules: `auth`, `users`, `catalog`, `library`, `ratings-reviews`, `recommendations`, `health`. Modules communicate through application services/interfaces, not by reaching into another module's internal Prisma tables. Controllers validate inputs and map response DTOs; services enforce business rules; repositories/adapters contain persistence/external calls.

**Current state:** only `apps/web` is an initialized workspace; `apps/api` and `packages/contracts` are reserved README boundaries. No API, database, auth, Discover or detail route exists yet. Keep existing npm workspaces, owned shadcn/Radix primitives, Embla, Motion and frontend organization. Do not create `packages/ui`, a global store, query-client layer, CMS or extra service without concrete reuse/interaction need. `infra` and decision records are future artifacts, not current implementations.

## 4. Rendering, state and performance

- Use Next.js server rendering for discoverable public pages and metadata when feasible. Limit client components to genuinely interactive controls, carousels, user actions, and forms.
- **URL state:** `q`, genres, years, sort, page; support refresh/back/share.
- **Server state:** catalog results and private library/reviews via a query cache where client interactivity warrants it. Ensure authenticated keys are user/session-scoped and purge private caches after sign-out or account switch.
- **Local UI state:** drawers, dialogs, hover/motion controls. Avoid a global store without demonstrated need.
- **Forms:** local form state with shared runtime validation for submitted API input.
- Images: responsive sizing, lazy load below fold, correctly configured allowed sources, fallbacks; no uncontrolled request fan-out.
- Performance: measure LCP/INP/CLS, hydration cost, JS bundles and animation smoothness; accommodate reduced motion.

## 5. API and trust boundaries

The browser calls FRAME REST endpoints under `/api/v1`. Backend authenticates/authorizes independently of the UI, validates all input at runtime and never trusts client-supplied ownership IDs. TMDB adapter handles key storage, request timeouts, upstream failures, response normalization, image URL policies, attribution and constrained retries. Client does not depend on raw TMDB response shapes.

**Security baseline:** HTTPS, CSRF protection for cookie-authenticated mutations, HttpOnly/Secure/SameSite session cookies, throttled auth endpoints, password hashing by established library, session revocation/logout, access-control checks on every personal resource, redaction of tokens and private content in logs, safe error payloads. The same-origin cookie topology below is settled; record environment-specific ingress and session-security details before the relevant implementation gates. Restrict CORS to explicitly required trusted origins; V1 browser access uses same origin.

### Settled routing design; deployment behavior requires verification

Deployment ingress routes same-origin browser `/api/v1/*` requests to NestJS, preserving the prefix, and all other web requests to Next.js. NestJS owns validation and business logic; do not duplicate it in Next route handlers. Local integration must provide equivalent routing before browser API work. CORS is not a substitute for this design and need not enable arbitrary origins.

Server Components use a **server-only `FRAME_API_ORIGIN`** plus `/api/v1`; never expose that origin or TMDB credentials through `NEXT_PUBLIC_*`. Use a fixed trusted origin, not a request-controlled URL. Public catalogue fetches forward no session cookies. Owner-scoped server fetches forward only the FRAME session cookie to that trusted API, use `cache: 'no-store'`, and do not enter shared Next caches. Session issuance/logout occurs through browser same-origin endpoints; do not rely on an RSC fetch to relay `Set-Cookie` to the browser.

Use an opaque session cookie with HttpOnly/Secure and SameSite=Lax in deployment, host-only, Path=/; enforce Origin/CSRF checks for unsafe browser methods. Stage 7 specifies expiry, rotation and revocation details before auth code. Stage 1 must verify ingress prefix/headers, server connectivity, trusted proxy handling, local parity and secret isolation; Stage 7 verifies cookie forwarding, issuance/deletion and CSRF end-to-end; Stage 14 repeats against the chosen deployment. These are verification requirements, not assertions of working infrastructure.

## 6. Data and caching ownership

| Data                        | System of record                       | Cache strategy                                                                                |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Movie metadata/images       | TMDB                                   | Backend bounded TTL/stale policy, provider-aware; frontend server/client cache where suitable |
| User/account/session        | FRAME PostgreSQL                       | Never public-cache credentials or session resources                                           |
| Watchlist/Favorites/Watched | FRAME PostgreSQL                       | Private query cache, invalidate after mutation                                                |
| Ratings/private reviews     | FRAME PostgreSQL                       | Private query cache, owner authorization                                                      |
| Recommendations             | Derived from TMDB + FRAME user signals | Short, private cache; invalidate when user signals change                                     |

Suggested initial catalog TTLs are configuration, not invariants: discovery lists 15–60 minutes; film details 6–24 hours; negative cache short. Control requests, document staleness and honour TMDB's then-current license/attribution/cache rules. Never blindly share personalized cache responses.

The backend bounded cache is the public catalogue freshness authority. Begin public Next server fetches with `cache: 'no-store'` to avoid stacked TTLs; add Next revalidation only with an explicit combined staleness budget. Anonymous catalogue responses alone may be shared. All `/auth`, `/me` and personalized responses send `Cache-Control: private, no-store`; ingress/CDN must bypass them and responses carrying session cookies. Do not persist private data in shared RSC caches, browser storage or a public service-worker cache. An in-memory client cache is optional, user/session-scoped and cleared on logout/account switch. Invalidate affected private views after mutations; never add Redis or three cache layers by default.

### Homepage composition and progressive failure

**Decision:** keep `apps/web/src/app/page.tsx` as server composition with existing Hero/MovieRail/MovieCard and narrow interactive islands. Add a small server-side composition function beside the existing movie data boundary; it calls typed FRAME endpoints and adapts DTOs to presentation models. It is not a generic content engine and needs no CMS or Homepage microservice.

| Existing section | Source and fallback                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero             | First eligible trending candidate with usable title/artwork; fetch one detail for overview/runtime. Try at most one alternate if absent. Partial detail failure uses summary/omitted optional metadata; if no eligible movie exists, preserve the region with an honest unavailable/retry state. |
| Trending Now     | Weekly trending endpoint, de-duplicated within the rail; permitted stale backend data before section error state.                                                                                                                                                                                |
| Popular Films    | Popular endpoint, independent of trending; do not reorder trending and call it popularity.                                                                                                                                                                                                       |
| Editorial banner | Retain the existing local Spring artwork, copy and genre anchor with Blender provenance; no automatic conversion to a different film.                                                                                                                                                            |
| Recognition rail | Small source-controlled, verified editorial selection using existing recognition evidence; retained fixtures are allowed and clearly described. New TMDB associations require verified IDs. Never infer awards/critics from votes.                                                               |
| Genre Browser    | Genre names/IDs from the genre dictionary and a bounded, labeled Homepage preview pool from successful rails. Counts mean loaded preview matches, not catalogue totals. Preserve filtering/disclosure; full remote discovery belongs to Stage 4.                                                 |

Fetch independent sources concurrently with bounded timeouts, catching failures per section; avoid a single rejecting `Promise.all` or card-by-card detail requests. Give each async section a Suspense/loading boundary with stable artwork geometry and its own typed empty/error/retry state. Keep route-level loading as a coarse fallback. Header, footer, editorial content and healthy sections remain usable during an outage. Retry only the failed section where feasible. Hero delay does not block rails; maintain heading semantics when a section is unavailable. No invented fixture-as-live ranking or fabricated metadata.

### Image and attribution policy

Allow HTTPS `image.tmdb.org` only for provider image URLs, with explicit supported size/path patterns in Next image configuration and backend URL construction; retain local `/images/films/*` assets. No arbitrary upstream hosts/SVGs or hotlinked third-party posters. Select bounded poster/backdrop sizes, reserve 2:3 and 16:9 geometry, provide responsive `sizes`, preload only the Hero, and lazy-load below fold. Missing/failed artwork uses a designed local neutral fallback at the same dimensions, never unrelated film artwork. Preserve existing object-fit/crop conventions and optional editorial focal positions; verify Hero crops at mobile widths rather than inventing provider focal points.

Keep Blender source/license credits for every retained local asset, including Spring and recognition fixtures. Add TMDB metadata/image attribution and source links separately; do not replace existing credits or imply endorsement. Stage 2 verifies then-current provider image, cache and attribution terms and the exact required presentation before live use; host permission is not a licensing determination.

## 7. Recommendation subsystem

V1 is deterministic, inspectable ranking, not ML. Candidate set: eligible TMDB films from genres/trending/popular/related surfaces; features: genre overlap, weighted liked-rated/favorited signals, optionally recency/popularity; exclude watched, de-duplicate, return reason codes. Cold start = trending/genre browsing. Filter unavailable/inappropriate metadata gracefully. Define deterministic tests and inspect recommendation diversity; never claim probabilistic personalization more advanced than implemented.

## 8. Failure modes and resilience

- TMDB slow/down → controlled timeout; cached catalog when policy permits, readable retry/temporary unavailable states; personal library remains accessible from stored TMDB IDs and any permitted minimal cached display fields.
- Movie image missing → designed artwork fallback.
- API request fails → typed error, accessible feedback, optional retry; no optimistic state left permanently incorrect.
- Expired session → clear private cache, gate mutations, preserve safe post-login return path.
- Missing movie → stable 404; another user's private resource → non-enumerating 404; invalid query → 400.
- Database fails → health checks reflect degraded readiness, no fictitious success response.

## 9. Testing strategy

Unit: domain policies, normalization, rank rules. Integration: Prisma uniqueness/transactions and TMDB adapter (mock upstream). API e2e: auth, authorization/ownership, validation, pagination, error contracts. Frontend component/interaction: forms, inaccessible controls, URL state. Browser e2e: four-pillar golden flow including sign-out/in; keyboard and responsive smoke. CI gates: lint/typecheck/unit/integration/e2e smoke/build, with secrets excluded.

## 10. Deployment and observability

Deploy web + API + managed PostgreSQL as separable services; keep secrets and environment config per service; migrations in controlled deployment step; preview/staging production separation when feasible. Structured logging (request/correlation ID, route, latency, upstream error category), metrics for response latency/error rate/TMDB failures, uptime health endpoints, and alerts for material failures. No requirement for Kubernetes, queues, Redis or microservices in V1. Introduce extra infrastructure only after observed need.

## 11. Decisions to record before implementation

ADR-001: repo integration with existing Stage 0.2B code. ADR-002: cookie/session and same-site deployment. ADR-003: cache mechanism/TTLs and provider policies. ADR-004: schema migrations and deployment platform. ADR-005: external score/financial fields and attribution. Each ADR records rationale, alternatives and trade-offs.

The decisions above are the Stage 0.3 design baseline. Stage 1 records repository preservation, ingress/server-origin and contract-workflow decisions before implementation; Stage 2 records provider policy verification; Stage 7 completes session security; Stage 14 records vendor-specific deployment validation. Do not reopen settled visual or API semantics as untracked assumptions. Browser regression baseline requirements and stage-name reconciliation are in `master-roadmap.md`.

## 12. Architectural acceptance

One testable public read path, one owner-scoped write path, one deterministic recommendation path, clear error mappings, cache/privacy separation, CI and deployment diagram. Stage 0.3 **documents** these designs; implementation happens in later stages.
