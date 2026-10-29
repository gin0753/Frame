# FRAME API

NestJS Express API with the PostgreSQL foundation. `src/main.ts` creates the application and bootstraps the listener; `AppModule` imports `HealthModule`, `DatabaseModule` and `CatalogModule` (which imports the internal `TmdbModule`). Runtime configuration and sanitized errors remain local to this application. Authentication remains unimplemented; Stage 2.2 catalog reads are documented below.

## Internal TMDB provider (Stage 2.1)

`src/catalog/tmdb` exports a Nest-owned `TmdbAdapter`, with no controller. It supports daily/weekly movie trending, popular movies (page 1–500), movie genres and detail by positive int32 TMDB movie ID. Language is an explicit ISO two-letter language with optional uppercase country, default `en-US`. Popular forwards page; trending currently forwards language only, matching the parameters documented in the current trending reference. Expanded trending pagination must be verified before the Stage 2.2 public paginated contract. No search/discover, MoviePreview adaptation, public DTO or OpenAPI change is added. Internal schemas deliberately project only movie identity/title, page counts and genre identity/name; other provider fields are discarded. They are not complete FRAME movie DTOs.

Configuration follows the API's explicit inherited-environment convention; no automatic dotenv loading is added:

- `TMDB_ENABLED`: absent/`false` disables provider calls and requires no token. Exactly `true` enables the adapter and validates credentials during Nest startup. Any other value fails safely.
- `TMDB_READ_ACCESS_TOKEN`: private TMDB **API Read Access Token**, required when enabled. Header-safe bearer syntax is checked; authenticity requires an authorized provider request. Never use `NEXT_PUBLIC_*`, a query credential, an actual token in a shell command/history, or a tracked file. A token supplied while disabled is ignored.

An operator may supply these variables through their private environment or an ignored root `.env.tmdb.local`. The example contains placeholders only. If using that ignored file, run `pnpm run api:build`, then from the repository root:

```sh
node --env-file=.env.tmdb.local apps/api/dist/main.js
node --env-file=.env.tmdb.local apps/api/scripts/tmdb-smoke.cjs
```

Node gives inherited variables precedence; inspect their names/target privately before launch. For an already-configured environment, `pnpm --filter @frame/api run tmdb:smoke` builds then runs the same smoke script. Smoke explicitly enables the adapter without changing application defaults. Missing credentials prints `REAL TMDB HTTP: NOT RUN — credentials unavailable` and exits 2. A configured Stage 2.2 smoke run makes five sequential requests (weekly trending, popular page 1, genres, English movie 11/Star Wars with credits/videos, image configuration); it validates provider structures, normalized public outputs and the known detail identity, and logs only aggregate pass/fail. No real bodies, artwork or credentials are saved. Failure exits 1 with generic diagnostics. Do not mistake deterministic synthetic tests for live TMDB proof.

The adapter uses native Node fetch to fixed HTTPS `api.themoviedb.org/3` paths with `Authorization: Bearer`, URLSearchParams, no cookies, no-store and rejected redirects. There is no configurable base URL or public proxy. A caller AbortSignal supports cancellation; a three-second deadline covers headers and body. A two-MiB body ceiling limits parsing input. Internal errors distinguish configuration, invalid request, network, timeout, cancellation, authentication, rate limiting, upstream server failure, missing resource and unexpected response. They contain fixed categories only, without upstream causes, bodies, URLs or values; the existing global HTTP filter remains unchanged. No retries, cache, scheduling or full public failure mapping is introduced before Stage 2.3.

Provider tests use synthetic injected fetch and a local synthetic real HTTP server for streaming/deadline/redirect behavior. Production transport always uses the fixed HTTPS host. These tests do not contact TMDB. Ordinary API tests, contract builds and frontend checks need no credential.

Official documentation reviewed 27 October 2026:

- [Application authentication](https://developer.themoviedb.org/docs/authentication-application): v3 accepts the private read token in the Authorization header.
- [Trending](https://developer.themoviedb.org/reference/trending-movies), [popular](https://developer.themoviedb.org/reference/movie-popular-list), [genres](https://developer.themoviedb.org/reference/genre-movie-list), [details](https://developer.themoviedb.org/reference/movie-details) and [errors](https://developer.themoviedb.org/docs/errors): fixed operations and supported parameters; the error reference bounds pages at 500. No search/discover calls are implemented.
- [Rate limits](https://developer.themoviedb.org/docs/rate-limiting): the old 40-per-10-seconds quota is retired. Current approximate upper limits around 40 requests/second can change; respect 429. This is not a fixed entitlement or a configured application quota.
- [Image configuration](https://developer.themoviedb.org/docs/image-basics): construct image URLs from configuration base/size plus a provider path. This stage fetches no images and changes no image policy or existing Blender attribution.
- [FAQ, attribution and licensing](https://developer.themoviedb.org/docs/faq): noncommercial API use requires attribution; commercial use needs licensing review. Future public TMDB presentation must use an approved, subordinate TMDB logo and the required notice in About/Credits, without implying endorsement. TMDB does not claim ownership of all images/data. This review does not establish caching/snapshot retention or redistribution rights. Persistent snapshots/bulk ingestion remain disabled; verify rights before any later retention policy.
- [API Terms of Use](https://www.themoviedb.org/api-terms-of-use): the official search-index excerpt prohibits caching beyond six months and excessive bandwidth use. Direct retrieval was blocked by robots.txt during this review, so that indexed excerpt is not confirmation of the full current agreement or permission for snapshots/redistribution. Recheck the operator's current agreement before Stage 2.3 retention decisions. No cached provider data is persisted here.

Stage 2.2 establishes complete provider validation, normalized public DTOs, MoviePreview adaptation and generated contracts without exposing raw provider objects. Stage 2.3 owns cache/retry/timeout/failure policies. Stage 2.4 owns fixture parity and image/attribution verification; Homepage live composition remains Stage 3. Existing security, performance, deployment and route-metadata drift conditions remain open.

Stage 1.4 uses `@frame/contracts` for strict health/readiness response parsing and the sanitized error envelope. Shared types are inferred from Zod; no Prisma model is exported as an HTTP DTO. `ZodValidationPipe` is an explicit per-body/query/parameter boundary for future controllers: it returns parsed output and maps failures to generic HTTP 400 `VALIDATION_ERROR` through the existing filter, without Zod issues, submitted values or field paths. Current production GET routes gain no input restrictions or global serialization. Test-only validation controllers are not registered in AppModule. See [contracts](../../packages/contracts/README.md) for OpenAPI generation/checks and the public import/build strategy. No documentation endpoint is served.

From the repository root:

```sh
pnpm run api:dev
pnpm run api:build
pnpm run api:start
pnpm run api:test
pnpm run api:typecheck
pnpm run api:lint
```

Default listener: `127.0.0.1:3001`; web remains `127.0.0.1:3000`. Environment is inherited from the launching shell; API `.env.example` is documentation, not an automatically loaded file. Set `HOST`, `PORT`, and `NODE_ENV` in the shell when needed. `PORT` must be an integer 1–65535; `HOST` must be an IP literal or localhost; `NODE_ENV` must be development, test or production. Production also defaults to loopback; an external interface requires explicit operator configuration.

`GET /api/v1/health` returns HTTP 200 JSON `{"status":"ok","service":"frame-api"}` with `Cache-Control: no-store`. It is process liveness only. Unknown routes return 404 JSON; unexpected errors return 500 JSON without exception messages, URLs or stack traces. Errors use the frozen `{ error: { code, message, requestId } }` envelope, with a server-generated request ID also returned in `X-Request-Id`. No incoming request ID is trusted.

Proxy trust is explicitly false. Forwarded headers do not establish identity, protocol or trusted hostname. Host is accepted for health checks but never used for URL generation or upstream selection. CORS is disabled; Origin is neither authentication nor a health-check requirement. API responses set nosniff, frame denial, restrictive CSP and no-referrer headers; Express identification is disabled. No HSTS assumption is made for local HTTP. Deployment ingress, TLS, forwarded-header sanitization, CSRF and session security remain future gates.

Nest runs lifecycle hooks for SIGINT/SIGTERM and app.close(). Signal shutdown has a five-second hard failure deadline; forced connection closure prevents lingering sockets. Windows signal-handler tests use child-process event emission because Windows does not deliver POSIX signals. Repeat real signal-delivery checks on POSIX before deployment.

## Local PostgreSQL and migrations

Use Docker Desktop with Linux containers. From the repository root:

```sh
pnpm run db:init
pnpm run db:up
pnpm run db:status
pnpm run prisma:validate
pnpm run prisma:generate
pnpm run db:migrate
pnpm run db:migrate:status
pnpm run db:diff
pnpm run db:test
pnpm run db:down
```

`db:init` creates `.env.database.local` with random, distinct local passwords and refuses to overwrite it. This file is ignored; do not share it. Keep it while retaining the development volume: changing the file does not rotate a PostgreSQL volume's password. Docker Compose uses PostgreSQL **17.11-alpine**, bound only to `127.0.0.1`: development `frame_dev` on port 5433, test `frame_test` on 5434. Edit the ports and corresponding URLs together in the ignored file if necessary. Development uses a persistent named volume. Tests use a separate server, role, database and tmpfs; stopping it discards its data. `db:down` preserves the development volume. Do not add `--volumes` unless deliberately discarding development data.

Local database commands explicitly validate/load this file and override inherited database variables, preventing an unrelated shell URL from redirecting migrations/tests. The API itself still loads no environment file. For local development, launch it with the documented local environment explicitly, for example from `apps/api`:

```sh
node --env-file=../../.env.database.local --import tsx src/main.ts
```

Run `pnpm run prisma:generate` first and unset any inherited `DATABASE_URL` before using `--env-file`: Node gives inherited variables precedence. For watch mode, load the local `DATABASE_URL` into the launching shell and use `pnpm run api:dev`. Never expose `DATABASE_URL` or `TEST_DATABASE_URL` through `NEXT_PUBLIC_*`, web configuration or responses. Production uses operator-provided server environment; no production database is provisioned here. The low-level Prisma CLI inherits the shell, so inspect its target before manually running migration commands outside these guarded local wrappers.

Prisma CLI, Client and `@prisma/adapter-pg` are pinned to **7.10.1**, the stable 7.x release available during implementation; the registry's latest tag pointed to an 8.0 release candidate. Prisma 7 supports the current Node 24.16.0 / TypeScript 5.9.3 toolchain. Its `prisma-client` generator explicitly uses `moduleFormat = "cjs"`; generated TypeScript compiles with the existing CommonJS Nest build. `prisma.config.ts` owns the CLI datasource URL; the schema contains only the PostgreSQL provider. The runtime uses the required PostgreSQL driver adapter. Build/dev/typecheck generate the client explicitly; generated source and dist are ignored. No ESM conversion, hoisting or new dependency install-script permissions are required.

The initial migration implements settled User, LibraryEntry and Rating records from the frozen design, satisfying the Stage 1 fixed rating/watched foundation. SQL enforces normalized unique email, positive movie IDs, integer score 1–10, owner/movie uniqueness, foreign keys, and `viewedOn` requiring watched state. UUIDs are generated by Prisma; timestamps use millisecond UTC precision and viewedOn uses PostgreSQL DATE. Hard deletion cascades these owned records; soft deletion changes nothing automatically. Account deletion policy, Session expiry/revocation, Review's proposed length bound, request-date validation and business mutations remain future gates. In particular, future viewing dates must be rejected at the later API request boundary; no time-dependent database CHECK is installed. No local Movie table, auth/session service, seed or business endpoint is added.

Schema changes belong in `prisma/schema.prisma` plus a reviewed new SQL migration. Never rewrite an applied migration, automatically reset a database, or substitute `db push`. Apply migrations separately from API startup. `db:diff` compares the migrated development schema against the Prisma model; Prisma does not model SQL CHECK constraints, which require separate integration assertions/review. Use `pnpm --filter @frame/api exec prisma format --check` for schema formatting; Prettier does not support Prisma syntax and excludes that file plus generated client source.

## Readiness and database lifecycle

`GET /api/v1/ready` executes `SELECT 1`: HTTP 200 `{"status":"ready","service":"frame-api"}` only on success; missing/unavailable database yields sanitized HTTP 503 in the existing error envelope. Both responses are no-store. Concurrent in-flight probes share one query, but completed successes are never cached. A two-second response deadline bounds a probe; driver connection, query and statement limits are one second and the pool has at most five connections. Cold initialization or recovery may briefly return 503. Readiness verifies connectivity, not migration currency; migration status is a separate operational gate.

Startup policy is liveness-only when the database is absent/unavailable. A configured malformed URL fails initialization with a generic error. One DI-owned DatabaseService creates at most one lazy Prisma Client per Nest application. Nest's existing shutdown hooks call its idempotent disconnection hook; no second signal handler or Prisma process-exit hook is introduced. There are no per-request clients or retry loops.

`pnpm run api:test` retains database-free native CommonJS tests. `pnpm run db:test` explicitly requires the guarded local test target, creates a unique test schema, applies migrations twice, checks history/model drift/SQL checks, exercises real writes/constraints across clients, tests readiness through a real test-server outage, and checks connection release. It restores the test service and removes only its owned schema in cleanup; development data is never mutated. Run it without another consumer of the disposable test service. Database prerequisites failing are failures of this explicit command, never simulated passes. Existing real transport/lifecycle tests remain `pnpm run test:transport`.

## Stage 2.2 normalized catalog

The API now serves `GET /api/v1/movies/trending`, `/movies/popular`, `/genres` and `/movies/:tmdbMovieId` under the same prefix. Configuration remains server-only and opt-in as above; disabled catalog reads return sanitized 503 `CATALOG_UNAVAILABLE`, without fixture fallback. Health/readiness behavior is unchanged. The Homepage still uses all six original Blender fixtures.

Trending defaults to `timeWindow=week`; `day` and `week` are supported. By explicit provisional approval, omitted page and `page=1` are accepted, and all other page values are rejected as 400 `VALIDATION_ERROR` before any upstream call. No page parameter is forwarded to Trending. **Trending multi-page support is UNVERIFIED**, not known to be unsupported. Valid upstream totals are preserved and describe provider results, not additional pages currently requestable through FRAME. Real-provider verification is required before lifting this restriction. Popular accepts pages 1–500 and caps totals at 500 pages / 10000 results. Unsupported query fields are rejected on every catalog route.

`@frame/contracts` owns strict MovieSummary, MovieDetail, Genre and page schemas, inferred types and route metadata. Lists use `{ items, page, pageSize: 20, totalPages, totalResults }`; genres use `{ items: [{ id, name }] }`; detail is a singleton. Summary includes nullable overview, release date, images and vote average, nonnegative vote count, provider identity, public TMDB destination and attribution. Votes are TMDB user votes, never FRAME ratings or critic scores. Missing vote count/genre arrays are rejected rather than fabricated. Empty optional text/date/image values become null; malformed nonempty dates/paths fail closed. Detail returns positive runtime or null, directors, up to ten cast in provider billing order, country codes/names, language codes/nullable English names, and the first official YouTube trailer with a safe 11-character key. Missing enrichment yields empty arrays/null. Financial amounts remain null pending rights verification, including when the provider reports amounts.

Pure normalizers never fetch or mutate inputs. Movie reads make at most two concurrent provider calls: the movie operation (detail appends exactly `credits,videos`) and `/configuration`. Both share a 2200 ms CatalogService deadline; the adapter retains its standalone 3000 ms headers/body safeguard but the shared signal caps catalog calls earlier. The unchanged web consumer and local proxy budgets are 3000 ms, reserving 800 ms for routing, normalization and delivery. A failure cancels and drains its sibling request. Direct Nest client disconnects propagate an abort signal from the controller to the adapter; proxy/deployment disconnect forwarding is not independently certified. There is no cache or retry. Image URLs use only the fixed HTTPS TMDB image base and configuration-validated `w500` poster / `w1280` backdrop sizes plus validated raster paths. No images are downloaded or persisted. Failure to validate configuration fails the read safely; configuration caching belongs to Stage 2.3. Inconsistent provider totals, page mismatch or incomplete result counts fail as 502 rather than being repaired with invented metadata. Out-of-range positive Popular pages return empty items with actual capped totals when the provider supplies a consistent empty page.

Public failures use the existing global filter: invalid input 400 `VALIDATION_ERROR`; absent detail 404 `NOT_FOUND`; rate limit 429 `RATE_LIMITED`; disabled/configuration/authentication/deadline/cancellation 503 `CATALOG_UNAVAILABLE`; network/server/unexpected upstream 502 `CATALOG_UNAVAILABLE`; unexpected implementation exceptions 500 `INTERNAL_ERROR`. Readiness 503 retains `HTTP_ERROR`. Bodies contain generic messages and server-generated request IDs; no upstream bodies or credentials. All catalog success/error responses are no-store. Internal provider categories remain distinct; expanded resilience policy belongs to Stage 2.3.

`pnpm run api:test` includes production Nest listeners over real loopback HTTP with only the external provider boundary replaced by synthetic data. It verifies success contracts, provisional pagination, no ignored filters, headers, output safety and failure mapping. `pnpm run contracts:test` and `pnpm run openapi:check` validate generated OpenAPI and request restrictions. No live provider payloads are test fixtures. **REAL TMDB HTTP: NOT RUN — credentials unavailable**. The smoke command remains available but is not evidence of a pass.

The frontend adds unused-by-Homepage server-only typed catalog reads and a pure DTO-to-MoviePreview adapter. Numeric identity and genre IDs are retained alongside the presentation model; unknown years are null, unknown genres omitted, runtime comes only from matching detail, and absent overview is empty. TMDB destinations have truthful accessible labels. Verified local neutral fallback assets must be supplied by future composition; no unrelated fixture artwork is substituted. Remote-image allowlisting, actual failed-image handling, crop/attribution/logo/notice verification and fixture parity remain Stage 2.4 gates before live presentation. Stage 3 owns live Homepage composition. Provider agreement, retention/redistribution rights and licensed financial display remain unverified; no storage/snapshots are enabled.

## Stage 2.3 catalog coordination

The catalog now uses one Nest-owned, catalog-only in-process coordinator. Concurrent identical normalized reads share work; distinct movie reads may share a validated TMDB configuration request. The adapter still owns credentials, fixed HTTPS calls, response bounds and runtime provider validation. Public schemas, paths, no-store headers, Trending page-1 policy and the fixture Homepage are unchanged. No Redis, persistence, snapshots, retries or stale responses are introduced.

### Rights gate and cache enablement

**Provider-content retention enablement: BLOCKED pending rights verification.** `CATALOG_CACHE_ENABLED` defaults to `false`. Setting it to `true` currently fails startup with a fixed, non-sensitive explanation; an environment flag cannot attest licensing. Cache mechanics are exercised only with synthetic responses through test-owned dependency injection. There is no synthetic-data mode in production API routes, and no operator bypass to this gate. Completed responses/configuration are not retained by the default application. In-flight coalescing discards values after consumers finish.

Authoritative sources rechecked 28 October 2026: [TMDB FAQ](https://developer.themoviedb.org/docs/faq) describes developer/noncommercial use with attribution, separate commercial licensing and branding obligations. It does not establish the project's requested metadata/configuration retention permissions or confirm the applicable agreement for its actual use. [Full API terms](https://www.themoviedb.org/api-terms-of-use) could not be retrieved because robots.txt blocks access. The developer docs terms path returned 404. Neither the earlier indexed six-month excerpt nor third-party implementations establish permission. Rights for normalized metadata, configuration and any future retention window remain unverified. Verify the operator's applicable agreement and record a separately reviewed decision before changing the gate. TTL candidates (15 min Trending, 30 min Popular, 24 h genres/configuration, 12 h details, 30 s negative results) are not authorized operational defaults.

### Bounds, keys and cancellation

Configuration is inherited at startup, with no implicit dotenv loader. Policy changes require restarting the application, which creates a fresh coordinator; `clear()` invalidates retained data and aborts in-flight work. Shutdown rejects new coordination and clears/aborts existing work. No credential or private account data enters a key or stored result.

| Setting                                                                    | Default | Allowed range / meaning                                                                              |
| -------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `CATALOG_MAX_INFLIGHT`                                                     | 32      | 2–128 active operations, including nested configuration work and abandoned operations until settled  |
| `CATALOG_MAX_CONSUMERS`                                                    | 128     | 2–512 active subscriptions, including internal configuration consumers                               |
| Lifetime subscriptions per operation                                       | 32      | Fixed bound, including consumers that have already cancelled                                         |
| `CATALOG_CACHE_MAX_ENTRIES`                                                | 128     | 1–1024 retained successes, subject to rights gate                                                    |
| `CATALOG_CACHE_MAX_BYTES`                                                  | 4194304 | 1024–16777216 UTF-8 JSON value plus key weight; heap overhead is additionally bounded by entry count |
| `CATALOG_CACHE_{TRENDING,POPULAR,GENRES,DETAIL,CONFIGURATION}_TTL_SECONDS` | 0 each  | 0–86400; zero means no retention even in synthetic enabled tests                                     |

TTL lookup uses a monotonic clock. Expiry is lazy on coordinator access/insertion; expired values are never served, but may remain resident until the next sweep, clear or shutdown. LRU eviction applies to entry/aggregate-weight pressure; oversized entries are returned without retention. No per-entry timers exist. Only validated normalized movie/genre DTOs and validated image configuration are eligible for synthetic retention; raw movie payloads and all failures are excluded. Defensive copies isolate loader results, subscribers and cached values. Configuration is the only additional internal retained representation needed for image construction, not a duplicate movie cache.

Keys encode TMDB v3, FRAME contract/image-policy version, resource, language and response-affecting arguments: Trending day/week and fixed page 1, Popular page, detail ID and credits/videos subset, genres language, or configuration identity. Current public routes authorize only en-US; no new language query is accepted. Configuration/parser/image policy changes require invalidating the instance or advancing the namespace. No token, arbitrary URL or unvalidated public filter is included.

Each caller retains the 2200 ms catalog deadline inside the existing 3000 ms consumer/proxy limits. A shared operation owns its own controller and at-most-2200 ms lifetime; it never inherits the first caller's signal. New consumers join only with at least 1800 ms left on that operation (at most 400 ms old). A later arrival, or a full lifetime subscription allocation, starts separate bounded work if capacity permits; otherwise it fails as 503 CATALOG_UNAVAILABLE. This admission policy defines the minimum acceptable shared completion window, not a guarantee of provider success. No caller's deadline is extended.

One disconnect/deadline detaches only its caller. The shared operation is aborted when the final consumer leaves. Abandoned operations cannot accept new consumers and remain capacity-accounted until the supported abort-aware adapter settles. Independent callers can keep shared configuration alive when another movie fails. Parallel movie/configuration subscriptions are cancelled and settled on failure. Direct Nest disconnect propagation is tested; proxy/deployment disconnect forwarding remains uncertified. The adapter's three-second standalone guard and two-MiB streaming bound remain intact.

### Failures, diagnostics and verification

Failure mapping preserves Stage 2.2 semantics: validation 400, absent movie 404, provider rate limit 429, configuration/authentication/deadline/cancellation or capacity unavailability 503, and network/server/malformed/configuration-resource failures 502. Configuration 404 does not establish movie absence. No retry is attempted, including when a provider sends Retry-After longer than the remaining budget: fail promptly rather than sleeping, retrying or extending the deadline. No negative failures or stale values are served as successes.

`CatalogService.diagnostics()` exposes a process-local aggregate snapshot for an operator/debugger or test harness: request count/duration/failures, cache hit/miss/expiry/eviction/oversize, coalescing/operation/capacity/cancellation/timeout counts, active registry/subscription sizes, retained byte weight and adapter upstream request/failure-category counts. Disabled-retention accesses still count as misses. Adapter counters cover configured transport reads; disabled configuration failures are reflected by catalog request failures. Snapshots contain no keys, URLs, payloads, bearer tokens or environment values. There is no HTTP diagnostics endpoint, periodic log exporter, external telemetry service or claim of hosted monitoring. Counters reset with the process; cancelled operations may remain counted until transport settlement.

Run `pnpm run api:test` for synthetic coordinator and real Nest HTTP regressions; focused commands after build are `node --test apps/api/test/catalog-coordinator.test.cjs` and `node --test apps/api/test/catalog-resilience.test.cjs`. Tests inject synthetic cache enablement/clock only in their owned Nest module, never via production environment configuration. Existing Stage 2.2 timing, validation, error, schema and transport checks remain applicable. Live TMDB smoke still requires separately supplied private credentials and never stores provider bodies. Stage 2.4 owns image fallback/crops, attribution presentation and fixture parity; Stage 3 owns Homepage integration.

## Stage 2.4 image and attribution preparation

Verified 29 October 2026 against [TMDB image basics](https://developer.themoviedb.org/docs/image-basics): image URLs combine configuration base, an available size and the media path. Existing normalization already enforces the fixed HTTPS image origin, configured w500 posters / w1280 backdrops, safe raster paths and null missing paths. Unsafe paths, origins and unavailable required sizes fail closed; no provider calls or public fields were added. Focused synthetic image tests cover these cases.

The web adapter can use FRAME-owned neutral poster/backdrop SVGs. Hero and MovieCard share a small image failure boundary, preserving geometry and accessible movie links without retrying failed sources. Local Blender imagery remains optimized; TMDB images bypass the Next optimizer to avoid introducing server-side provider image retention. The Next optimizer's remote allowlist remains closed. This does not control the provider's HTTP/browser caching policy or authorize redistribution.

The presentation adapter additionally restricts usable artwork to the exact approved HTTPS TMDB raster path and resource-specific size; syntactically valid but unapproved URLs fall back neutrally without discarding the movie. No public schema changes are needed. TMDB vote values stay in the public DTO; MoviePreview does not display invented scores. Fixture recognition, curated descriptions/order and Blender links remain editorial fixture content, never metadata copied to unrelated TMDB IDs.

Run `node --test tests/visual/catalog-images.test.cjs` with installed Chromium (or `FRAME_CHROMIUM_EXECUTABLE`) and no competing Next process. It creates and removes a test-owned synthetic route, captures ignored screenshots under `tmp/stage-2.4-visual`, verifies all seven fixture widths, and checks narrow/wide synthetic missing/failed artwork without contacting TMDB. Refresh with `pnpm run typecheck` after browser tooling regenerates Next route types. Real transport remains `pnpm run test:transport`.

The [official FAQ](https://developer.themoviedb.org/docs/faq), rechecked 29 October 2026, requires an approved logo, the non-endorsement notice and About/Credits attribution, with unaltered approved branding subordinate to FRAME. It distinguishes noncommercial attributed use from commercial licensing; this is not a determination of this project's applicable agreement. The Footer now displays the required notice and official TMDB link outside the existing collapsed Blender Credits. Blender attribution and assets are preserved.

**TMDB ATTRIBUTION ACCEPTANCE: BLOCKED — approved logo asset unverified.** The [official logo page](https://www.themoviedb.org/about/logos-attribution) and [full API terms](https://www.themoviedb.org/api-terms-of-use) were blocked by robots.txt during verification. No logo was downloaded, drawn, substituted or represented by a visual placeholder. The exact integration point is the TMDB credits div in `apps/web/src/components/layout/footer.tsx`, immediately after the Blender Credits disclosure. Remaining work: obtain and verify an official approved asset and its permitted use, insert it there with original proportions/colors/orientation and a TMDB homepage link, keep it less prominent than FRAME, and review notice/logo placement at mobile and desktop widths. Text/link preparation and tests do not establish full legal compliance.

**PROVIDER CONTENT RETENTION: BLOCKED.** The Stage 2.3 gate remains unchanged; cache enablement still fails startup. Snapshot/redistribution rights and the applicable agreement remain unresolved. **REAL TMDB HTTP: NOT RUN — credentials unavailable.** Trending multi-page remains UNVERIFIED. Stage 3 must separately implement live server composition, source-truthful section/editorial labels, bounded detail enrichment, independent section states, real-film crop/link/attribution review and screenshot comparison. None is implemented here.
