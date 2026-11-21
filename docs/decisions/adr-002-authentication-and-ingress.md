# ADR-002: Authentication and ingress (A1 design)

Status: A1 schema and contracts only. Authentication endpoints, cookie issuance, CSRF and throttling are not implemented.

Production browser requests use HTTPS on the web origin. Deployment ingress routes `/api/v1/*` to NestJS, preserving the prefix, and other paths to Next.js. Nest remains the authentication authority. Prevent direct API bypass or apply equivalent protections there. The ingress provider and configuration remain unselected and unverified.

Local development uses the existing opt-in loopback Next rewrite with an explicitly configured local web origin (normally `http://localhost:3000`) and loopback API origin. Local HTTP uses a non-Secure development cookie; production must require Secure and HTTPS. Do not conflate localhost and 127.0.0.1 cookie hosts.

The planned host-only session cookie `frame_session` is HttpOnly, SameSite=Lax, Path=/ and Secure in production. A 256-bit random base64url token is represented only by its SHA-256 digest in PostgreSQL. Sessions expire after a fixed seven days, without sliding renewal, JWTs or refresh tokens. Logout deletes the session and cookie. Each private request must check expiry and soft-deleted users. Schedule expired-session cleanup separately; scheduling is unresolved.

Unsafe browser requests require an exact configured canonical Origin and CSRF defenses, including JSON and a custom client header. Do not derive the origin from Host or trust arbitrary forwarded headers. Authenticated responses and errors require `Cache-Control: private, no-store`; cookies and private data must bypass shared caches. Public catalog requests remain cookie-free. Browser requests receive Set-Cookie through same-origin ingress; server-side private reads forward only the session cookie to the fixed trusted API origin, without shared caching.

Registration and login normalize email by trimming and lowercasing; canonical email is at most 254 characters and must satisfy the shared email format. Display name is trimmed and 1–100 UTF-16 code units. Registration passwords retain whitespace and contain 12–128 UTF-16 code units; login accepts 1–128. Both reject invalid Unicode and exceed 512 UTF-8 bytes. No provider-specific email rewriting or composition rule applies. A duplicate registration is planned as 409 and can reveal account existence. No password hashing is implemented in A1.

Production release is blocked on actual ingress configuration and bypass protection, trustworthy client-IP attribution, a distributed throttling design appropriate to deployment, end-to-end HTTPS/cookie and CSRF tests, a decision on email verification and recovery, and session cleanup scheduling. API routing, expiry enforcement, password hashing, guard, revocation and cookie behavior belong to A2; frontend belongs to A3. Google identity, linking and profile work are deferred.
