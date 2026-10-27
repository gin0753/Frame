# FRAME contracts

`src/index.ts` is the runtime schema authority for implemented health/readiness successes and sanitized API errors. Types are inferred from Zod **4.6.7**. Import only `@frame/contracts`; private source paths are not exported. This workspace depends at runtime only on Zod, with no Nest, Next, Prisma, database or Node server imports. MoviePreview and future provider payloads remain outside it.

All current response objects are strict, including nested errors: unknown fields fail validation rather than being silently stripped. Health is `{ status: 'ok', service: 'frame-api' }`; readiness is `{ status: 'ready', service: 'frame-api' }`. Errors retain `{ error: { code, message, requestId } }`, without details or internal fields. Request IDs match the current server-generated `req_` plus UUID v4. Readiness 503 retains generic `HTTP_ERROR`, not the future catalog-specific code from the frozen design. No runtime status, message or envelope was changed. The frozen example's `req_example` and optional details are illustrative future design, not current wire values.

The package emits CommonJS JavaScript and declarations to ignored `dist/`, using Node16 TypeScript resolution with no `type: module`. The public export works with compiled Nest CommonJS, native Node ESM and Next App Router. Both applications declare `workspace:*` and build this package before development/build/typecheck; no consumer imports private TypeScript paths. `pnpm install` does not implicitly build it. After editing contracts during a running dev session, run `pnpm run contracts:build` and restart the app if necessary; no watch orchestrator is introduced.

From the repository root:

```sh
pnpm run contracts:build
pnpm run contracts:typecheck
pnpm run contracts:lint
pnpm run contracts:test
pnpm run openapi:generate
pnpm run openapi:check
```

`@asteasolutions/zod-to-openapi` **9.1.0** generates OpenAPI **3.1.0** from these exact schemas plus transport route metadata. `@apidevtools/swagger-parser` **13.1.0** validates the document and local references with external resolution disabled. Both are development tooling, absent from the public runtime export. The generator extends Zod before loading schemas, solely in its CLI/test process. No duplicate DTO classes or handwritten property schemas are maintained.

`openapi:generate` validates and writes reproducible JSON to ignored `tmp/openapi/frame-api.json`. No specification is checked in or served; `openapi:check` regenerates in memory, validates and checks determinism. Tests assert exact paths, statuses, references, literals, required fields and unknown-field semantics. Documented paths are GET `/api/v1/health` (200/500) and GET `/api/v1/ready` (200/503/500). A reusable 404 response describes unmatched URLs without inventing a route. Success/error responses are no-store; only errors carry server-generated X-Request-Id. No Swagger UI or JSON documentation endpoint is registered.

`api:test` verifies real HTTP payloads, request ID/error handling, absent diagnostics and a test-only body/query/param controller using the explicit Zod pipe. A query transformation in that fixture proves parsed output handling; production schemas currently perform no transformations. `db:test` verifies readiness 200/503 against real PostgreSQL. `test:transport` verifies actual Next server execution, rewrites and real malformed/upstream failure cases. Web unit doubles are labeled and do not substitute for transport checks.

OpenAPI is documentation, not runtime validation. Future refinements/transforms may not translate into equivalent JSON Schema constraints: add behavioral tests and document limitations before use. Stage 2 must add only approved catalog contracts, normalize/validate upstream data in the API and validate unknown JSON in consumers, preserving the Homepage presentation model. Auth, business endpoints and database migrations are outside this change. Explicit checks above are suitable for future CI; hosted execution/deployment is not inferred from local success.
