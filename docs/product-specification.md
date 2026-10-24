# FRAME — Product Specification (V1)

**Status:** Stage 0.3 architecture baseline · **Date:** 2026-10-23 · **Scope:** V1 only

## 1. Product promise

FRAME is a premium cinematic **movie discovery and personal movie journal**. A visitor can discover a film, understand what it is, save it, record a rating/review after watching, and receive relevant movie suggestions. FRAME **does not stream films** and is not a social network.

**Four pillars:** (1) discovery and movie information; (2) personal movie management; (3) ratings and reviews; (4) bounded, explainable personalization.

**Primary product differentiator:** visual and interaction quality, backed by a real functional full-stack loop. Engineering decisions should reinforce a front-end-first, full-stack portfolio rather than maximising backend complexity.

## 2. Users and jobs

| Persona            | Job                                                    | V1 proof                                             |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------- |
| Anonymous explorer | Find a compelling movie and understand why to watch it | Home → browse/search → detail                        |
| Registered viewer  | Keep track of interesting and watched movies           | Sign in → Watchlist/Favorites → mark watched         |
| Reflective viewer  | Remember impressions                                   | Film detail/library → rate and write/edit own review |
| Returning viewer   | Discover another suitable film                         | Personalized suggestions → detail → save             |

## 3. Main flows and acceptance

1. **Discover:** home, curated sections, genre exploration, search/filter/sort, pagination, empty/loading/error states. Film cards open canonical film detail pages.
2. **Understand:** film overview, year/release date, runtime, countries/languages where supplied, genres, cast/director, trailer link where supplied, artwork, external data attribution and a clear external source link. Budget/revenue and media score information appear **only when available and licensed/attributable**; never synthesize missing figures or present TMDB user vote as critic rating.
3. **Keep:** authenticated user adds/removes Watchlist or Favorites, can mark a film Watched, and can view their own lists. Anonymous actions prompt sign-in and return to the original context.
4. **Reflect:** logged-in user records one personal rating per film (**integer 1–10**, no half-steps in V1), and at most one editable review per film. Delete/edit own content; privacy default **private to account** in V1. Rating can exist without written review. Watched is an independent boolean; an optional user-editable viewing date is not required to mark a film watched. Rating/review does not automatically mark watched; offer an explicit separate confirmation.
5. **Recommend:** a returning user sees a modest ranked selection derived from favorite genres, saved/watched/rated movies and liked films; each item has a transparent reason (e.g. “Because you liked sci-fi”). Generic trending/genre suggestions are used for cold start; exclude already-watched titles from the primary recommendation rail.

## 4. V1 feature inventory

| Capability      | Must ship                                                                                         | Explicit limit                                          |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Cinematic UI    | Responsive home, rails, immersive detail, polished navigation, reduced-motion support             | Performance/accessibility above decorative animation    |
| Catalog         | TMDB-backed trending/popular/genre/search/details/people preview                                  | Third-party catalog metadata is read-only               |
| Search          | Query, genre, release-year range, sort, pagination, deep-linkable URL state                       | No advanced semantic search or full custom search index |
| Movie profiles  | Description, directors/cast, release dates, runtime, art, TMDB votes, optional finance/media info | No unverified third-party critic-score aggregation      |
| Account         | Register/login/logout, secure session, account deletion capability                                | No OAuth provider required at V1 baseline               |
| Library         | Watchlist, Favorites, Watched and personal rating/review                                          | No social follows, public feed or multiple lists        |
| Recommendations | Explainable rules/content signals, fallback for sparse data                                       | No ML pipeline, collaborative filtering or embeddings   |
| Quality         | Tests, keyboard accessibility, resilient states, deployments, observability basics                | No distributed microservices                            |

## 5. Explicitly out of scope

Streaming/playback; public reviews, comments, likes or social graph; follower notifications; paid subscriptions; mobile native apps; moderation console; multi-provider watch availability guarantees; scraping critic sites; AI chatbot; ML recommendations; rich-text review editor; editable movie metadata; multi-language content localization. Reconsider only through a separately approved change request; **V1 is frozen after Stage 15**.

## 6. UX and visual baseline

**Decision:** the existing repository through Stage 0.2B.3 is authoritative, including `apps/web/src/app/globals.css`: canvas `#101113`, surface `#1C1E22`, primary text `#F4F2EE`, secondary text `#A7A8AC`, accent `#D99C67`; Instrument Serif for editorial/display and Inter for UI/body. Preserve the fluid 90rem container, existing clamp-based gutters/section spacing, breakpoints, carousel peeking and mobile refinements. Do not impose a new column grid or replace typography. Stage 0.4 adds bounded interaction/motion to this baseline; it does not redesign the Homepage.

Preserve the existing Hero, rails/cards, editorial banner, Genre Browser, header/footer, server/client boundaries, Radix focus management and Embla behavior. Maintain visible focus, comfortable touch targets, truthful unavailable controls, mobile header without SOON labels, readable Hero content, native vertical scrolling and reduced-motion support. A reviewed browser screenshot/interaction baseline is mandatory **before any motion changes**; see the roadmap gate.

## 7. Information architecture

- `/` cinematic discovery home
- `/discover` browse/filter/sort; `/search?q=...` search results
- `/movies/[tmdbId]` detail (canonical numeric TMDB movie ID)
- `/people/[tmdbId]` optional limited V1 cast/crew profile, only if scoped in Stage 6
- `/login`, `/register`
- `/me/watchlist`, `/me/favorites`, `/me/watched`, `/me/reviews`, `/me/settings`
- `/for-you` recommendations (sign-in preferred; generic fallback)

**Navigation transition decision:** Stage 3 live cards/Hero link to the verified public TMDB movie page until `/movies/[tmdbId]` is implemented and tested in Stage 5. Retained Blender fixtures keep their official destinations. Stage 5 switches live destinations to internal routes atomically with route availability; never emit dead internal links. Accessible names identify the actual destination (TMDB, Blender Studio, or FRAME details), rather than hardcoding Blender Studio. Fixture slugs are not TMDB identities; mapping requires verification against provider records. Canonical internal navigation is a V1 exit requirement, not a claim about Stage 3.

## 8. Success definition

**Functional exit test:** From a clean account, browse a real TMDB result → open its detail → authenticate → add to Watchlist → mark Watched → rate and write/edit/delete a review → see a personalized recommendation with explanation → save another film. Refresh, sign out/in, and verify persistence and ownership isolation.

**Usability exit:** fully responsive at representative desktop/tablet/mobile sizes; keyboard-only key journeys; reduced-motion; loading, empty, permission, third-party outage, and retry affordances.

**Engineering exit:** backend boundaries enforced, reproducible local setup, automated tests for core contracts/ownership, production deployment and monitoring, written architecture and release notes.

## 9. Scope control and decision policy

Must-have means required for the four-pillar loop. Could-have does not enter V1 without replacing equal effort. For every stage: define acceptance and non-goals, implement only the stage, run validation, document outcomes, receive review before advancing. External metadata richness is **best-effort**; absence must never break detail rendering. Potential privacy/publication decisions require explicit approval; reviews remain private by default.

## 10. Open decisions for Stage 0.4 / implementation

- Choose deployment vendors and verify ingress, server connectivity, cookie/security and image behavior in implementation. Same-origin routing, integer ratings, independent watched state, optional viewing date and image policy are settled designs in the companion documents; no vendor is mandated.
- Decide whether person profile pages are Stage 6 V1 must-have or a limited inline cast/director presentation is enough.

These are **tracked decisions**, not permission to start implementing extra capabilities.
