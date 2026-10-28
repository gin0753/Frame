# FRAME API

NestJS Express API with the PostgreSQL foundation. `src/main.ts` creates the application and bootstraps the listener; `AppModule` imports `HealthModule`, `DatabaseModule` and the internal `TmdbModule`. Runtime configuration and sanitized errors remain local to this application. Authentication and public movie endpoints remain unimplemented.

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

Node gives inherited variables precedence; inspect their names/target privately before launch. For an already-configured environment, `pnpm --filter @frame/api run tmdb:smoke` builds then runs the same smoke script. Smoke explicitly enables the adapter without changing application defaults. Missing credentials prints `REAL TMDB HTTP: NOT RUN — credentials unavailable` and exits 2. A configured smoke run makes four sequential requests (weekly trending, popular page 1, genres, English movie 11/Star Wars); it validates minimal structures and the known detail identity, and logs only aggregate pass/fail. No real bodies, artwork or credentials are saved. Failure exits 1 with generic diagnostics. Do not mistake deterministic synthetic tests for live TMDB proof.

The adapter uses native Node fetch to fixed HTTPS `api.themoviedb.org/3` paths with `Authorization: Bearer`, URLSearchParams, no cookies, no-store and rejected redirects. There is no configurable base URL or public proxy. A caller AbortSignal supports cancellation; a three-second deadline covers headers and body. A two-MiB body ceiling limits parsing input. Internal errors distinguish configuration, invalid request, network, timeout, cancellation, authentication, rate limiting, upstream server failure, missing resource and unexpected response. They contain fixed categories only, without upstream causes, bodies, URLs or values; the existing global HTTP filter remains unchanged. No retries, cache, scheduling or full public failure mapping is introduced before Stage 2.3.

Provider tests use synthetic injected fetch and a local synthetic real HTTP server for streaming/deadline/redirect behavior. Production transport always uses the fixed HTTPS host. These tests do not contact TMDB. Ordinary API tests, contract builds and frontend checks need no credential.

Official documentation reviewed 27 October 2026:

- [Application authentication](https://developer.themoviedb.org/docs/authentication-application): v3 accepts the private read token in the Authorization header.
- [Trending](https://developer.themoviedb.org/reference/trending-movies), [popular](https://developer.themoviedb.org/reference/movie-popular-list), [genres](https://developer.themoviedb.org/reference/genre-movie-list), [details](https://developer.themoviedb.org/reference/movie-details) and [errors](https://developer.themoviedb.org/docs/errors): fixed operations and supported parameters; the error reference bounds pages at 500. No search/discover calls are implemented.
- [Rate limits](https://developer.themoviedb.org/docs/rate-limiting): the old 40-per-10-seconds quota is retired. Current approximate upper limits around 40 requests/second can change; respect 429. This is not a fixed entitlement or a configured application quota.
- [Image configuration](https://developer.themoviedb.org/docs/image-basics): construct image URLs from configuration base/size plus a provider path. This stage fetches no images and changes no image policy or existing Blender attribution.
- [FAQ, attribution and licensing](https://developer.themoviedb.org/docs/faq): noncommercial API use requires attribution; commercial use needs licensing review. Future public TMDB presentation must use an approved, subordinate TMDB logo and the required notice in About/Credits, without implying endorsement. TMDB does not claim ownership of all images/data. This review does not establish caching/snapshot retention or redistribution rights. Persistent snapshots/bulk ingestion remain disabled; verify rights before any later retention policy.
- [API Terms of Use](https://www.themoviedb.org/api-terms-of-use): the official search-index excerpt prohibits caching beyond six months and excessive bandwidth use. Direct retrieval was blocked by robots.txt during this review, so that indexed excerpt is not confirmation of the full current agreement or permission for snapshots/redistribution. Recheck the operator's current agreement before Stage 2.3 retention decisions. No cached provider data is persisted here.

Stage 2.2 must establish complete provider validation, normalized public DTOs, MoviePreview adaptation and generated contracts without exposing raw provider objects. Stage 2.3 owns cache/retry/timeout/failure policies. Stage 2.4 owns fixture parity and image/attribution verification; Homepage live composition remains Stage 3. Existing security, performance, deployment and route-metadata drift conditions remain open.

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
