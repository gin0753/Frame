# FRAME

A cinematic movie discovery interface built with Next.js, React and TypeScript. The Homepage displays weekly TMDB Trending, Popular movies and genre filtering over its loaded selection through the server-only NestJS Catalog. The Spring collection and verified Blender recognition selection remain static editorial content. Six licensed Blender fixtures are preserved for deterministic regression tests. Authentication remains unimplemented.

## Run locally

Use Node 22.13+ (validated with 24.16.0) and pnpm 10.34.9, pinned in `packageManager`. Enable pnpm through Corepack if needed (`corepack enable pnpm`), then install from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open http://127.0.0.1:3000. For a production preview, run `pnpm run build` followed by `pnpm --filter @frame/web run start`.

```sh
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
pnpm run format:check
```

## Architecture and scope

`apps/web`, `apps/api` and `packages/contracts` are active pnpm workspaces. Shared runtime HTTP schemas live in [contracts](packages/contracts/README.md). The web app uses App Router server rendering, small client regions for Radix navigation, Embla rails and genre filtering, and a provider-independent movie presentation model. No task orchestrator or global state library is needed.

- [Product specification](docs/product-specification.md)
- [Architecture](docs/architecture.md)
- [Data and API design](docs/data-and-api-design.md)
- [Roadmap](docs/master-roadmap.md)
- [Repository and transport ADR](docs/decisions/adr-001-repository-and-transport.md)
- [Image licensing and provenance](docs/movie-assets.md)
- [Quality debt and integration gates](docs/engineering-debt.md)
- [Representative visuals and verification context](docs/evidence/README.md)

The four architecture-baseline documents are frozen design decisions. Their dated status observations are historical; current implementation limitations and integration gates live in the maintained quality-debt document.

## Local API routing

For live Homepage data, configure server-only `FRAME_API_ORIGIN` in `apps/web/.env.local` using `apps/web/.env.example`, and start the API with private TMDB configuration described below. Missing configuration or provider outages leave honest unavailable live sections while editorial content remains usable. Server Homepage reads go directly to Nest and do not need the local browser proxy. Enable `FRAME_LOCAL_API_PROXY=true` only for same-origin browser API verification: the rewrite preserves `/api/v1/*` to the trusted loopback origin. Restart development or rebuild a production preview after configuration changes. The API defaults to `127.0.0.1:3001`; web defaults to port 3000.

`FRAME_API_ORIGIN` is server-only; never expose it through `NEXT_PUBLIC_*` or `next.config.env`. Future deployment ingress owns same-origin API routing; leave the local proxy disabled in deployment builds. Actual forwarding, proxy trust, cookies and cache isolation require integration verification; see the ADR and quality gates.

## Design and interaction conventions

Tokens are centralized in `apps/web/src/app/globals.css`: canvas `#101113`, surface `#1C1E22`, text `#F4F2EE` / `#A7A8AC` and accent `#D99C67`. Bundled Inter handles interface typography; Instrument Serif is reserved for editorial accents. Reuse `container-shell` and `section-space` for responsive rhythm.

Preserve the cinematic Homepage, responsive crops, 48px action controls, visible focus, native disclosure semantics, Radix focus restoration, Embla swipe behavior and genre scroll-reset correction. Feedback is restrained CSS with reduced-motion fallbacks. Blender imagery remains bundled locally with responsive Next image optimization and attribution; its poster-format artwork is disclosed still cropping, not official theatrical posters. TMDB artwork uses validated provider URLs without the retaining Next image optimizer. Search and Account remain unavailable with accessible explanations; live film links lead to TMDB until Stage 5, while fixtures retain official project destinations.

## Documentation policy

Keep public documentation lean: product, design, architecture, contracts, essential ADRs, licensing and concise operational guidance. Maintain current risks in one place. Internal execution reports, raw traces, collector scripts, large JSON bundles and duplicate screenshots remain local archival material rather than public documentation. Do not rewrite historical results or delete evidence to clean the repository. The evidence entry point explains local restoration and its accepted single-disk risk.

## API verification

See [API operations](apps/api/README.md) for runtime variables, security boundaries, shutdown and the health contract. API scripts: `api:dev`, `api:build`, `api:start`, `api:test`, `api:typecheck`, `api:lint`. Existing web scripts retain their purposes.

`pnpm run test:transport` runs real HTTP, Chromium through the Next rewrite, a temporary Next server-only consumer, failure cases and isolated shutdown checks. Install Chromium with `pnpm exec playwright install chromium` or set `FRAME_CHROMIUM_EXECUTABLE`. Do not run another Next process during this test. The temporary consumer is removed before the production preview build. Production server-side transport and POSIX signal delivery require separate verification; see [ADR-001](docs/decisions/adr-001-repository-and-transport.md).

Stage 1.3 provides local PostgreSQL, Prisma migrations and a DI-managed database client. `/api/v1/health` remains process liveness; `/api/v1/ready` checks real database connectivity. See [API operations](apps/api/README.md#local-postgresql-and-migrations) for `db:init`, `db:up`, `db:migrate`, `db:test` and `db:down`. Public Catalog reads and the live Homepage are implemented; accounts remain unimplemented.

## Package manager and delivery tooling

The TMDB adapter is disabled by default; Stage 2.2 adds normalized Trending, Popular, genre and movie-detail reads. For private configuration and the explicitly invoked live verification command, see [API provider instructions](apps/api/README.md#internal-tmdb-provider-stage-21). Frontend/contract checks require no TMDB credential. Trending provisionally accepts only omitted page/page=1 (default week); multi-page support remains UNVERIFIED. Popular supports pages 1–500. See the API README for normalized semantics, real HTTP tests and limitations. Stage 2.3 coalesces concurrent catalog/configuration reads with bounded shared ownership. Retained provider caching remains disabled and enablement is BLOCKED pending rights verification; see ADR-003 and the API README for policy/diagnostics/tests. Stage 2.4 prepares neutral missing/failed artwork and verifies fixture/presentation compatibility; Stage 3.2 connects the Homepage to live Catalog reads with independent section boundaries. The TMDB notice and linked official logo are present in Footer Credits; full applicable terms and provider rights remain unresolved. See [image and attribution preparation](apps/api/README.md#stage-24-image-and-attribution-preparation).

Use pnpm exclusively for installs and project scripts. `pnpm-workspace.yaml` includes `apps/web`, `apps/api` and `packages/contracts`; the root `pnpm-lock.yaml` is canonical. Native dependency install scripts are limited to the existing esbuild, fsevents and unrs-resolver tooling. Keep the default isolated workspace dependency layout; do not enable shameful hoisting to resolve missing declarations.

CI and deployment jobs should enable the pinned pnpm version, run `pnpm install --frozen-lockfile` from the repository root, then invoke the same web/API build commands listed above. Do not run a workspace-only install without the root lockfile. Web production preview uses `pnpm --filter @frame/web run start`; API production startup uses `pnpm run api:start` after `pnpm run api:build`. No CI workflow, deployment provider configuration or production infrastructure is currently checked in, so hosted installation/deployment remains unverified. Environment files, loopback defaults, rewrite opt-in and ingress responsibilities are unchanged.

Run `pnpm run contracts:test`, `pnpm run contracts:lint` and `pnpm run openapi:check` alongside application checks. `pnpm run openapi:generate` creates validated, deterministic OpenAPI 3.1 JSON under ignored `tmp/openapi/`; no documentation route or Swagger UI is exposed. App build/dev/typecheck scripts build the shared package first. See [contract ownership and boundaries](packages/contracts/README.md).
