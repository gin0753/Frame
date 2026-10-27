# FRAME

A cinematic movie discovery interface built with Next.js, React and TypeScript. The Homepage uses six licensed Blender films, responsive movie rails and genre filtering. The Homepage runs entirely on local fixtures. A NestJS health API is available; authentication, live rankings and TMDB integration remain unimplemented.

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

The Homepage needs no environment file or API. Copy `apps/web/.env.example` to `apps/web/.env.local` and explicitly enable `FRAME_LOCAL_API_PROXY=true`. The Next rewrite preserves `/api/v1/*` when forwarding to the trusted loopback `FRAME_API_ORIGIN`. Restart development or rebuild a production preview after configuration changes. Start the API in another terminal with `pnpm run api:dev`. It defaults to `127.0.0.1:3001`; web defaults to port 3000.

`FRAME_API_ORIGIN` is server-only; never expose it through `NEXT_PUBLIC_*` or `next.config.env`. Future deployment ingress owns same-origin API routing; leave the local proxy disabled in deployment builds. Actual forwarding, proxy trust, cookies and cache isolation require integration verification; see the ADR and quality gates.

## Design and interaction conventions

Tokens are centralized in `apps/web/src/app/globals.css`: canvas `#101113`, surface `#1C1E22`, text `#F4F2EE` / `#A7A8AC` and accent `#D99C67`. Bundled Inter handles interface typography; Instrument Serif is reserved for editorial accents. Reuse `container-shell` and `section-space` for responsive rhythm.

Preserve the cinematic Homepage, responsive crops, 48px action controls, visible focus, native disclosure semantics, Radix focus restoration, Embla swipe behavior and genre scroll-reset correction. Feedback is restrained CSS with reduced-motion fallbacks. Film imagery is bundled locally with responsive Next image optimization and footer attribution. Poster-format artwork is disclosed still cropping, not official theatrical posters. Search and Account remain unavailable with accessible explanations; film links lead to official project pages.

## Documentation policy

Keep public documentation lean: product, design, architecture, contracts, essential ADRs, licensing and concise operational guidance. Maintain current risks in one place. Internal execution reports, raw traces, collector scripts, large JSON bundles and duplicate screenshots remain local archival material rather than public documentation. Do not rewrite historical results or delete evidence to clean the repository. The evidence entry point explains local restoration and its accepted single-disk risk.

## API verification

See [API operations](apps/api/README.md) for runtime variables, security boundaries, shutdown and the health contract. API scripts: `api:dev`, `api:build`, `api:start`, `api:test`, `api:typecheck`, `api:lint`. Existing web scripts retain their purposes.

`pnpm run test:transport` runs real HTTP, Chromium through the Next rewrite, a temporary Next server-only consumer, failure cases and isolated shutdown checks. Install Chromium with `pnpm exec playwright install chromium` or set `FRAME_CHROMIUM_EXECUTABLE`. Do not run another Next process during this test. The temporary consumer is removed before the production preview build. Production server-side transport and POSIX signal delivery require separate verification; see [ADR-001](docs/decisions/adr-001-repository-and-transport.md).

Stage 1.3 provides local PostgreSQL, Prisma migrations and a DI-managed database client. `/api/v1/health` remains process liveness; `/api/v1/ready` checks real database connectivity. See [API operations](apps/api/README.md#local-postgresql-and-migrations) for `db:init`, `db:up`, `db:migrate`, `db:test` and `db:down`. The Homepage still uses fixtures; accounts and movie APIs remain unimplemented.

## Package manager and delivery tooling

Use pnpm exclusively for installs and project scripts. `pnpm-workspace.yaml` includes `apps/web`, `apps/api` and `packages/contracts`; the root `pnpm-lock.yaml` is canonical. Native dependency install scripts are limited to the existing esbuild, fsevents and unrs-resolver tooling. Keep the default isolated workspace dependency layout; do not enable shameful hoisting to resolve missing declarations.

CI and deployment jobs should enable the pinned pnpm version, run `pnpm install --frozen-lockfile` from the repository root, then invoke the same web/API build commands listed above. Do not run a workspace-only install without the root lockfile. Web production preview uses `pnpm --filter @frame/web run start`; API production startup uses `pnpm run api:start` after `pnpm run api:build`. No CI workflow, deployment provider configuration or production infrastructure is currently checked in, so hosted installation/deployment remains unverified. Environment files, loopback defaults, rewrite opt-in and ingress responsibilities are unchanged.

Run `pnpm run contracts:test`, `pnpm run contracts:lint` and `pnpm run openapi:check` alongside application checks. `pnpm run openapi:generate` creates validated, deterministic OpenAPI 3.1 JSON under ignored `tmp/openapi/`; no documentation route or Swagger UI is exposed. App build/dev/typecheck scripts build the shared package first. See [contract ownership and boundaries](packages/contracts/README.md).
