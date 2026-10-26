# FRAME API

Stage 1.2 NestJS Express skeleton. `src/main.ts` creates the application and bootstraps the listener; `AppModule` imports only `HealthModule`. Runtime configuration and sanitized errors remain local to this application. No persistence, authentication or provider integration exists.

From the repository root:

```sh
npm run api:dev
npm run api:build
npm run api:start
npm run api:test
npm run api:typecheck
npm run api:lint
```

Default listener: `127.0.0.1:3001`; web remains `127.0.0.1:3000`. Environment is inherited from the launching shell; API `.env.example` is documentation, not an automatically loaded file. Set `HOST`, `PORT`, and `NODE_ENV` in the shell when needed. `PORT` must be an integer 1–65535; `HOST` must be an IP literal or localhost; `NODE_ENV` must be development, test or production. Production also defaults to loopback; an external interface requires explicit operator configuration.

`GET /api/v1/health` returns HTTP 200 JSON `{"status":"ok","service":"frame-api"}` with `Cache-Control: no-store`. It is process liveness only. Unknown routes return 404 JSON; unexpected errors return 500 JSON without exception messages, URLs or stack traces. Errors use the frozen `{ error: { code, message, requestId } }` envelope, with a server-generated request ID also returned in `X-Request-Id`. No incoming request ID is trusted.

Proxy trust is explicitly false. Forwarded headers do not establish identity, protocol or trusted hostname. Host is accepted for health checks but never used for URL generation or upstream selection. CORS is disabled; Origin is neither authentication nor a health-check requirement. API responses set nosniff, frame denial, restrictive CSP and no-referrer headers; Express identification is disabled. No HSTS assumption is made for local HTTP. Deployment ingress, TLS, forwarded-header sanitization, CSRF and session security remain future gates.

Nest runs lifecycle hooks for SIGINT/SIGTERM and app.close(). Signal shutdown has a five-second hard failure deadline; forced connection closure prevents lingering sockets. Windows signal-handler tests use child-process event emission because Windows does not deliver POSIX signals. Repeat real signal-delivery checks on POSIX before deployment. New resource providers in Stage 1.3 must implement lifecycle cleanup; no database readiness is claimed here.
