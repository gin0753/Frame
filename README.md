# FRAME

A cinematic movie discovery interface built with Next.js, React and TypeScript. The Homepage uses six licensed Blender films, responsive movie rails and genre filtering. The Homepage runs entirely on local fixtures. A NestJS health API is available; authentication, live rankings and TMDB integration remain unimplemented.

## Run locally

Use Node 22.13+ and npm 11. Install the locked dependencies and start the web workspace:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. For a production preview, run `npm run build` followed by `npm run start -w @frame/web`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

## Architecture and scope

`apps/web` and `apps/api` are active npm workspaces. `packages/contracts` remains reserved for Stage 1.4. The web app uses App Router server rendering, small client regions for Radix navigation, Embla rails and genre filtering, and a provider-independent movie presentation model. No task orchestrator or global state library is needed.

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

The Homepage needs no environment file or API. Copy `apps/web/.env.example` to `apps/web/.env.local` and explicitly enable `FRAME_LOCAL_API_PROXY=true`. The Next rewrite preserves `/api/v1/*` when forwarding to the trusted loopback `FRAME_API_ORIGIN`. Restart development or rebuild a production preview after configuration changes. Start the API in another terminal with `npm run api:dev`. It defaults to `127.0.0.1:3001`; web defaults to port 3000.

`FRAME_API_ORIGIN` is server-only; never expose it through `NEXT_PUBLIC_*` or `next.config.env`. Future deployment ingress owns same-origin API routing; leave the local proxy disabled in deployment builds. Actual forwarding, proxy trust, cookies and cache isolation require integration verification; see the ADR and quality gates.

## Design and interaction conventions

Tokens are centralized in `apps/web/src/app/globals.css`: canvas `#101113`, surface `#1C1E22`, text `#F4F2EE` / `#A7A8AC` and accent `#D99C67`. Bundled Inter handles interface typography; Instrument Serif is reserved for editorial accents. Reuse `container-shell` and `section-space` for responsive rhythm.

Preserve the cinematic Homepage, responsive crops, 48px action controls, visible focus, native disclosure semantics, Radix focus restoration, Embla swipe behavior and genre scroll-reset correction. Feedback is restrained CSS with reduced-motion fallbacks. Film imagery is bundled locally with responsive Next image optimization and footer attribution. Poster-format artwork is disclosed still cropping, not official theatrical posters. Search and Account remain unavailable with accessible explanations; film links lead to official project pages.

## Documentation policy

Keep public documentation lean: product, design, architecture, contracts, essential ADRs, licensing and concise operational guidance. Maintain current risks in one place. Internal execution reports, raw traces, collector scripts, large JSON bundles and duplicate screenshots remain local archival material rather than public documentation. Do not rewrite historical results or delete evidence to clean the repository. The evidence entry point explains local restoration and its accepted single-disk risk.

## API verification

See [API operations](apps/api/README.md) for runtime variables, security boundaries, shutdown and the health contract. API scripts: `api:dev`, `api:build`, `api:start`, `api:test`, `api:typecheck`, `api:lint`. Existing web scripts retain their purposes.

`npm run test:transport` runs real HTTP, Chromium through the Next rewrite, a temporary Next server-only consumer, failure cases and isolated shutdown checks. Install Chromium with `npx playwright install chromium` or set `FRAME_CHROMIUM_EXECUTABLE`. Do not run another Next process during this test. The temporary consumer is removed before the production preview build. Production server-side transport and POSIX signal delivery require separate verification; see [ADR-001](docs/decisions/adr-001-repository-and-transport.md).

Stage 1.3 will add persistence separately. No database health, schemas, migrations, accounts or movie API are present.
