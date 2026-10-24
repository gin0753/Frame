# FRAME — Data and API Design (V1)

**Status:** Reconciled logical contract baseline, not implemented/generated code · **Date:** 2026-10-23

## 1. Identity and ownership

Use `tmdbMovieId` (positive integer) as the external film identity across URLs, API, library and reviews. Model provider identity explicitly (`source = 'tmdb'`) in adapters so future providers can be added without assuming numeric IDs are globally unique. FRAME user identity is an internal UUID, never TMDB account identity. Person records use independent `tmdbPersonId`. Database relationships **do not need** a local `Movie` row for every TMDB title; user entries reference a TMDB ID and may retain limited legal/attributed display snapshots only if necessary for resilience.

## 2. Logical relational model

| Entity         | Fields / constraints                                                                                                                                                                                                  | Relationship                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `User`         | `id UUID PK`, `email unique normalized`, `passwordHash`, `displayName`, timestamps, `deletedAt?`                                                                                                                      | has many sessions and movie actions |
| `Session`      | `id UUID PK`, `userId FK`, `tokenHash` (or opaque session secret digest), `expiresAt`, `revokedAt?`, timestamps                                                                                                       | user 1:N sessions                   |
| `LibraryEntry` | `id UUID PK`, `userId FK`, `tmdbMovieId positive int`, `inWatchlist bool default false`, `isFavorite bool default false`, `isWatched bool default false`, `viewedOn date?`, timestamps, `unique(userId, tmdbMovieId)` | user 1:N movie entry                |
| `Rating`       | `id UUID PK`, `userId FK`, `tmdbMovieId`, `score int CHECK 1..10`, timestamps, `unique(userId, tmdbMovieId)`                                                                                                          | one personal rating per user/film   |
| `Review`       | `id UUID PK`, `userId FK`, `tmdbMovieId`, `body` bounded plain text, timestamps, `unique(userId, tmdbMovieId)`                                                                                                        | one private review per user/film    |

**Decision:** use the separate logical Rating and Review records above; no parallel MovieJournal aggregate. `isWatched` is authoritative, independent of optional user-editable `viewedOn` (ISO calendar date, not a UTC event timestamp). A watched film may have no known viewing date. Unmarking watched clears `viewedOn`; setting a non-null date requires the resulting `isWatched` to be true. Reject future viewing dates using the request's UTC calendar date as the V1 validation boundary. Rating/review does not automatically change watched state; offer explicit confirmation as a separate library mutation. A LibraryEntry may be removed when all three flags are false and `viewedOn` is null, independently of ratings/reviews.

**Deletion:** deleting an account must revoke sessions and remove/anonymize user-owned personal records under a documented retention policy. Timestamp precision, index design, cascade decisions and actual SQL belong to data implementation stage.

## 3. API conventions

Base path `/api/v1`. UTF-8 JSON, HTTPS in deployment, stable lowerCamelCase keys, ISO-8601 UTC timestamps (calendar dates use `YYYY-MM-DD`), numeric TMDB IDs, bounded pagination. External TMDB objects are normalized to FRAME DTOs. The contracts below are settled design decisions, not claims that endpoints currently exist.

**Authoritative workflow:** Stage 1.4 introduces Zod runtime request/response schemas in `packages/contracts`, with inferred TypeScript types and OpenAPI generated from those same schemas using a compatible generator selected at that stage. Nest boundary pipes parse inputs with these schemas; validate normalized responses in contract tests and the typed web API client. Do not hand-maintain parallel class-validator DTOs, handwritten OpenAPI or duplicate frontend transport interfaces. Upstream TMDB validation stays in the API adapter; the frontend MoviePreview remains a separate presentation model. CI validates examples, rejects unknown mutation fields, checks generated OpenAPI drift and exercises error/nullability contracts. No dependencies are installed during Stage 0.3; generator/version compatibility is implementation verification, not a second schema authority.

### Public catalog

| Verb | Route                                                                      | Notes                                                                                                                          |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET  | `/movies/trending?timeWindow=week&page=1`                                  | curated/trending list                                                                                                          |
| GET  | `/movies/popular?page=1`                                                   | popular listing                                                                                                                |
| GET  | `/movies/search?q=...&genreId=...&yearFrom=...&yearTo=...&sort=...&page=1` | validate supported provider filter combinations; backend may implement discovery separately if TMDB search limitations require |
| GET  | `/movies/discover?genreId=...&yearFrom=...&yearTo=...&sort=...&page=1`     | genre/year/sort discovery                                                                                                      |
| GET  | `/movies/:tmdbMovieId`                                                     | film detail, cast/crew subset, videos/attribution when available                                                               |
| GET  | `/genres`                                                                  | film genres                                                                                                                    |
| GET  | `/people/:tmdbPersonId`                                                    | optional limited person detail if product scope confirms                                                                       |

An endpoint must not silently ignore an unsupported filter. Either implement its meaning via a documented compatible flow or reject clearly with `VALIDATION_ERROR`.

### Accounts and owner-scoped resources

| Verb   | Route                               | Notes                                                                                                      |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`                    | email/password/display name; create account/session                                                        |
| POST   | `/auth/login`                       | establish session                                                                                          |
| POST   | `/auth/logout`                      | revoke current session                                                                                     |
| GET    | `/me`                               | current authenticated user                                                                                 |
| DELETE | `/me`                               | explicitly authenticated deletion flow with re-auth confirmation                                           |
| GET    | `/me/library?list=watchlist&page=1` | own lists only; list accepts watchlist, favorites or watched                                               |
| PATCH  | `/me/library/:tmdbMovieId`          | non-empty partial object of `inWatchlist`, `isFavorite`, `isWatched`, `viewedOn`; omitted fields unchanged |
| DELETE | `/me/library/:tmdbMovieId`          | clear library flags/watched state; separate ratings/reviews unaffected                                     |
| GET    | `/me/ratings?page=1`                | own rating history                                                                                         |
| PUT    | `/me/ratings/:tmdbMovieId`          | create/replace own score                                                                                   |
| DELETE | `/me/ratings/:tmdbMovieId`          | delete own rating                                                                                          |
| GET    | `/me/reviews?page=1`                | own reviews                                                                                                |
| PUT    | `/me/reviews/:tmdbMovieId`          | create/replace own plain text review                                                                       |
| DELETE | `/me/reviews/:tmdbMovieId`          | delete own review                                                                                          |
| GET    | `/me/recommendations?limit=12`      | own ranked titles + reason codes                                                                           |

All `/me` routes require authentication. Do not accept `userId` from clients to choose whose data is read or changed. `/auth` endpoints need rate limits and CSRF/cookie controls as chosen in the authentication ADR.

## 4. DTO samples

**MovieSummary:**

```json
{
  "id": 550,
  "source": "tmdb",
  "title": "Example Film",
  "releaseDate": "2000-01-01",
  "posterUrl": null,
  "backdropUrl": null,
  "genreIds": [18],
  "voteAverage": 7.5,
  "voteCount": 1200,
  "overview": null,
  "externalUrl": "https://www.themoviedb.org/movie/550",
  "attribution": {
    "provider": "tmdb",
    "sourceUrl": "https://www.themoviedb.org/movie/550"
  }
}
```

The example title and dates are illustrative, not factual metadata for ID 550.

**MovieSummary schema decision:** `overview: string | null`, `externalUrl: string` (verified public TMDB movie URL) and `attribution: { provider: 'tmdb', sourceUrl: string }` accompany the sample's core fields. `id` is a positive integer; title is non-empty; `releaseDate`, `posterUrl`, `backdropUrl` and `voteAverage` are nullable, `voteCount` is a non-negative integer, `genreIds` is an array (empty allowed). All documented fields are present; unavailable scalar values are `null`, not inconsistently omitted. The example demonstrates the schema, not a verified fixture-to-TMDB mapping.

**MovieDetail** extends summary with `runtimeMinutes: number | null` (positive integer when known), `directors[]`, `cast[]`, `countries[]`, `languages[]`, `budgetUsd: number | null`, `revenueUsd: number | null`, `trailerUrl: string | null`, and `externalLinks[]`. Arrays are empty when unavailable; unknown scalar values are null. Provider zero/unknown budget, revenue or runtime is normalized to null rather than shown as a fact. Do not label `voteAverage` as a professional critic score.

### DTO to MoviePreview adaptation (Stage 2 contract tests; Stage 3 integration)

Keep `apps/web/src/features/movies/model.ts` provider-independent and adapt in the frontend movie data boundary beside `data/movie-source.ts`. The existing fixture `listPreviews()` remains usable; add only the typed reads/composition required by the live Homepage, not a generic repository framework.

| API input                        | Presentation rule                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source: 'tmdb'`, numeric `id`   | Stable string `id = 'tmdb:' + id`; retain the numeric identity in adapter/composition metadata for routes/actions, not by guessing fixture slugs. Never persist the display ID as a numeric provider ID.                                                                                                                           |
| `title`, `releaseDate`           | Use verified title; derive year only from a valid date. Permit the narrow future model change `year: number                                                                                                                                                                                                                        | null` and omit unknown year in the existing markup; never use 0/current year as invented data. |
| `genreIds`, `/genres` dictionary | Resolve display names in provider order, omit unknown IDs; dictionary failure means no genre labels rather than raw numeric labels. Keep genre IDs alongside the composition data for remote filtering, not inferred back from translated labels.                                                                                  |
| `overview`                       | `synopsis` is supplied text or empty string; suppress empty description without removing the Hero region.                                                                                                                                                                                                                          |
| `runtimeMinutes`                 | Detail enrichment only: positive minutes × 60 → `runtimeSeconds`; absent/failed enrichment → null. Retained fixtures keep their verified second precision. No detail fetch per card.                                                                                                                                               |
| nullable artwork URLs            | Construct MovieImage with approved size-variant dimensions; source-image dimensions are not assumed known. Select known 2:3 poster / 16:9 backdrop variants and responsive sizes; use a local same-ratio neutral fallback for missing/failing images. Preserve optional verified focal position, otherwise existing centered crop. |
| destination                      | Until Stage 5 use verified TMDB public URL; after route acceptance use `/movies/{id}`. Retained fixtures keep official links. Add a narrow destination/source label field or helper so Hero/Card accessible names describe the actual target.                                                                                      |
| recognition                      | Only verified editorial evidence with source URL; absent otherwise. Never derive from voteAverage.                                                                                                                                                                                                                                 |

Hero receives one bounded detail enrichment request (at most one alternate candidate), then uses the same adapted MoviePreview as existing components. Missing runtime/overview cannot fail the page. Verified TMDB identity mapping for an existing Blender film requires checking the provider detail identity against title/release/official evidence and recording that mapping; absent verification it remains a separate local fixture. Adapter tests cover missing dates, unknown genres, null/failed images, runtime conversion, source identity and destination labels. Retain fixture-only integrity tests rather than rewriting them as TMDB tests.

**Library update:**

```json
{ "inWatchlist": true }
```

`PATCH /me/library/:id` accepts only supplied fields; omitted fields are unchanged. Boolean nulls, unknown keys and empty objects are 400. `viewedOn: null` explicitly clears the date. `isWatched: false` also clears the date; a simultaneously supplied non-null date is invalid. `viewedOn` alone may change only an already-watched entry; a new entry with a date must also supply `isWatched: true`. Omitted fields on a newly created entry take the defaults above.

Perform a single atomic field-level database update/upsert keyed by authenticated user/movie; do not read a whole object and write stale flags back. Validate date/state invariants within a transaction or equivalent conditional update, protected by database constraints where possible. Concurrent changes to different flags must survive; same-field changes use last committed write. Requests set values, never toggle, so retries are idempotent in effect. Return the complete resulting LibraryEntry. Clients merge/refresh that response and roll back only their failed optimistic fields. Ratings/reviews remain untouched. Test concurrent favorite/watchlist updates and watched/date races before Stage 8 acceptance.

**Rating update:** `{"score": 8}`. **Review update:** `{"body": "Memorable performances and pacing."}` (plain text, enforce length and sanitization on output).

**Recommendation:**

```json
{ "items": [], "limit": 12, "strategy": "content_rules_v1" }
```

## 5. Page envelope and errors

**Response types:** paginated movie, library, rating and review lists use `Page<T> = { items: T[], page, pageSize, totalPages, totalResults }`, all counts non-negative integers, page/pageSize positive. Empty result is `{"items": [], "page": 1, "pageSize": 20, "totalPages": 0, "totalResults": 0}`; out-of-range positive pages return empty items with actual totals. Movie lists use `Page<MovieSummary>`; library lists use `Page<LibraryItem>` below. `/genres` returns `{ items: Genre[] }` with `{ id, name }`; singleton detail/auth responses are not pages.

Recommendations use the distinct `RecommendationResponse = { items: RecommendationItem[], limit: number, strategy: 'content_rules_v1' | 'cold_start_v1' }`, not Page and no invented total. Each item has **complete MovieSummary**, never a partial lookalike, plus discriminated `reason`: `{ code: 'GENRE_AFFINITY', genreIds: number[] }`, `{ code: 'BECAUSE_YOU_LIKED', tmdbMovieId: number }`, or `{ code: 'TRENDING' }`. Return at most requested limit, no duplicates; empty items is valid. The sample above is a valid empty response.

Catalogue pageSize is fixed at 20; provider totals are capped to the supported accessible page range and documented as such, not exhaustive catalogue size. Owner lists use pageSize 20 and deterministic updatedAt/id ordering; recommendations default to 12, max 24. Runtime schemas bound page to supported provider limits, sort, genre and year ranges; reject unsupported filter combinations. Exact provider cap is verified in Stage 2 and recorded in the generated contract, not silently guessed.

Common error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [{ "field": "page", "reason": "Must be a positive integer" }],
    "requestId": "req_example"
  }
}
```

| HTTP    | Code                  | Meaning                                                 |
| ------- | --------------------- | ------------------------------------------------------- |
| 400     | `VALIDATION_ERROR`    | malformed or unsupported input                          |
| 401     | `UNAUTHENTICATED`     | missing/expired session                                 |
| 403     | `FORBIDDEN`           | operation disallowed without revealing unnecessary data |
| 404     | `NOT_FOUND`           | movie absent or owner-scoped object absent/not owned    |
| 409     | `CONFLICT`            | unique/identity business conflict                       |
| 429     | `RATE_LIMITED`        | rate limit                                              |
| 502/503 | `CATALOG_UNAVAILABLE` | upstream catalog unavailable                            |
| 500     | `INTERNAL_ERROR`      | unexpected server failure, no internal details          |

Never surface TMDB tokens, Prisma errors or private ownership details. API should include a traceable request ID.

## 6. Data correctness and security invariants

- Unique `(userId, tmdbMovieId)` for each personal movie-domain aggregate; backend enforces atomic upsert and delete semantics.
- A rating score must be valid; review plain-text size is bounded (proposed 1–5,000 characters after trimming) and output is escaped.
- Owner-scoped queries always filter by authenticated `userId`; another user's item is not distinguishable from missing via a direct item route.
- `tmdbMovieId` must be positive/in range and validated before upstream call; nonexistent ID returns a normalized 404.
- Auth secrets are hashed, session cookies are protected, CSRF policy is documented; no client-visible password hash or session digest.
- Aggregated public critic ratings are absent from V1 contract without an explicit licensed source agreement.

## 7. Indexes and migration outline

`User(email) UNIQUE`; unique session token digest lookup and `Session(userId, expiresAt)`; `LibraryEntry(userId, tmdbMovieId) UNIQUE`, candidate list indexes `(userId, inWatchlist)`, `(userId, isFavorite)`, `(userId, isWatched)`; `Rating(userId, tmdbMovieId) UNIQUE`; `Review(userId, tmdbMovieId) UNIQUE`. Check real query plans before adding list indexes. Implement versioned migrations and rollback/backup practice when schema work begins; do not infer watched state from a date.

### Minimal library snapshots and catalogue outages

**Decision:** preserve user-owned entries without a live catalogue dependency. A nullable minimal display snapshot attached to the LibraryEntry contains `title`, `releaseDate`, `posterUrl`, `sourceUrl`, provider attribution and `fetchedAt`; it is not a Movie table or an authoritative metadata record. Store only server-validated provider metadata, never arbitrary client snapshot content. Stage 2 must verify retention rights and configure an explicit retention limit before enabling snapshot persistence. Until that verification, persist no display snapshot and use the ID-only fallback; this still keeps library state accessible.

`LibraryItem = { entry: LibraryEntryDto, movie: MovieSummary | null, snapshot: MovieDisplaySnapshot | null, catalogStatus: 'live' | 'stale' | 'unavailable' | 'removed' }`. Entry DTO includes movie ID, flags, nullable viewedOn and timestamps, no foreign owner's data. Prefer valid cached/live summaries; otherwise return a still-permitted snapshot marked stale, or null display metadata with a readable “Movie #ID — details unavailable” fallback, local artwork fallback and existing user actions. Upstream 404 marks removed without deleting user data. Rating/review list items use the same display projection alongside their own record.

Paginate user-owned records in the database first; batch/deduplicate catalogue enrichment for that page through one application service, use the backend cache, and bound upstream concurrency (initial maximum four). No unbounded per-card requests or invented TMDB batch endpoint. Catalogue failures return HTTP 200 with accurate entries/statuses, not a failed library page. Refresh snapshots only after successful reads, enforce retention expiry independently of traffic and never overwrite good snapshots with null failures. Snapshots are private, deleted with their owning records/account, and carry required source attribution; expired snapshots become null. Provider rights, retention configuration and outage/rate-limit behavior require Stage 2/8 verification.

## 8. Contract acceptance

Draft schemas validate every example, all mutations specify idempotency/ownership, pagination and errors are consistent, optional external fields do not break clients, and fixture-to-live migration maps established Stage 0.2B provider-independent film fields without redesigning cards.
