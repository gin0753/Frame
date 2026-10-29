# ADR-003 — Catalog single-flight and retention gate

**Date:** 28 October 2026. **Status:** Request coordination implemented; provider-content retention enablement BLOCKED pending rights verification.

## Context

Stage 2.2 is committed at 12227ea1e11b717244589816e466da91a2b46a8e. Catalog reads already normalize and validate provider data, run independent movie/configuration reads concurrently, and propagate direct HTTP cancellation under a 2200 ms API budget inside 3000 ms consumer/proxy limits. Repeated concurrent requests still duplicate provider reads. No persistent catalog or distributed cache is warranted.

## Decision

Use a DI-owned catalog-only coordinator for normalized responses, with a nested configuration resource shared across distinct movie operations. Flights own their signals and deadlines, count active consumers, reject abandoned-flight reuse, and abort upstream when the last consumer leaves. Callers retain individual deadlines. Join only flights with at least 1800 ms remaining; older flights or exhausted lifetime subscription allocations require a new bounded operation or a safe capacity rejection. Defaults cap operations at 32, active subscriptions at 128 and lifetime subscriptions per flight at 32. Abandoned slots remain accounted for until adapter settlement; noncooperating work cannot trigger unbounded replacement work. Module shutdown aborts work and rejects new requests.

The optional retention mechanics use monotonic TTLs, defensive copies, lazy expiry, LRU eviction and count/JSON-byte limits (128 entries / 4 MiB by default). Expired values are not served; no per-entry timers, failures, negative results, stale fallback or disk writes are used. Cache identity includes resource, fixed provider/contract/image-policy namespace, language and canonical response parameters. Configuration is validated, never invented; policy changes restart/invalidate the instance. These are engineering mechanics, not a licensing determination.

## Rights decision

The [official TMDB FAQ](https://developer.themoviedb.org/docs/faq), reviewed 28 October 2026, sets attribution/noncommercial and commercial-license context but does not establish applicable response/configuration retention rights for this project. Retrieval of [the full API agreement](https://www.themoviedb.org/api-terms-of-use) was blocked by robots.txt. A speculative developer-docs terms path returned 404. Neither indexed fragments nor third-party claims are sufficient. No assumption is made about the operator's commercial/noncommercial classification or agreement.

Production retention is therefore disabled and cannot be enabled merely by an environment flag: CATALOG_CACHE_ENABLED=true fails startup until a separately reviewed rights decision changes the gate. All TTL defaults are zero. Tests exercise mechanics using synthetic data and test-owned DI. Sequential production reads continue fetching configuration when retention is disabled; concurrent reads can share in-flight configuration. Permission for normalized metadata and configuration retention, actual TTLs and physical residency/sweep requirements must be resolved before enablement.

## Failure and operational boundary

Keep 2200/3000 ms budgets, no retries (including long Retry-After), no negative caching and no stale responses. Public contracts/routes and safe error envelopes remain unchanged. Numeric in-process diagnostics expose no keys or provider bodies and introduce no external telemetry/public endpoint. Direct Nest cancellation is tested; forwarding across deployment/proxy hops remains open. Provider resource-safety hardening, live authorization, Trending multi-page verification, PostgreSQL regression and existing security/performance/browser/deployment debt are not closed.

The API README documents bounds, identity, policy variables, failure mapping and test commands. Stage 2.4 image/attribution/fixture parity and Stage 3 live composition remain separate gates. The four frozen documents remain unchanged.
