# Security

How CollabBoard handles authentication, authorization, and the common web threats. The guiding
principle: **one definition of "can this user do X"** (`services/access`) shared by REST and
sockets, and **secrets are never stored or transmitted in a recoverable form**.

- [Authentication](#authentication)
- [Token & cookie details](#token--cookie-details)
- [Authorization model](#authorization-model)
- [Authorization matrix](#authorization-matrix)
- [Socket authentication](#socket-authentication)
- [Rate limiting](#rate-limiting)
- [Input validation](#input-validation)
- [Threat mitigations](#threat-mitigations)

---

## Authentication

Email + password. Passwords are hashed with **bcrypt** (`bcryptjs`, cost **12**) in
`utils/password.ts` — plaintext is never stored. Sessions use a **two-token** scheme:

| Token | Lifetime | Storage (client) | Storage (server) | Signed with |
|---|---|---|---|---|
| **Access** (JWT) | `JWT_ACCESS_TTL` = 15 m | in-memory only (Zustand `authStore`) | stateless | `JWT_ACCESS_SECRET` |
| **Refresh** (JWT) | `JWT_REFRESH_TTL` = 7 d | **httpOnly cookie** `cb_refresh` | `RefreshToken` row (`sha256` + `jti`) | `JWT_REFRESH_SECRET` |

The access token (`{ sub, email, name }`) is sent as a `Bearer` header and verified by
`requireAuth`. It is **kept in memory only** — never `localStorage` — so an XSS payload cannot
read a long-lived credential. On page load the client silently mints a fresh access token from
the refresh cookie (`useAuthBootstrap` → `POST /auth/refresh`).

**Refresh rotation.** `POST /auth/refresh` verifies the cookie's JWT, looks up its `jti` in
`RefreshToken`, **revokes the old token, issues a new one** (new `jti`), and resets the cookie.
The DB stores only `sha256(token)`, so a database leak cannot reconstruct a usable token.
`POST /logout` revokes the current refresh token and clears the cookie. Expired refresh rows
are auto-purged by a MongoDB **TTL index** on `expiresAt`.

**Client 401 handling.** The axios response interceptor performs a **single-flight** refresh on
a `401` (deduping concurrent failures) and retries the original request once; if refresh fails
it clears auth and the UI redirects to login. Auth routes themselves are excluded from the
retry to avoid loops.

**Email verification.** Registration issues a single-use `EmailToken` (`type: 'verify'`, stored
hashed, TTL-indexed) and emails a link. In dev with no `SMTP_*`, the mailer logs the link to the
server console.

---

## Token & cookie details

The refresh cookie is set with (see BUILD_SPEC §3 / `modules/auth/cookies.ts`):

| Attribute | Value |
|---|---|
| name | `env.COOKIE_NAME` (`cb_refresh`) |
| `httpOnly` | `true` — JS cannot read it |
| `sameSite` | `lax` — sent on top-level navigations, mitigates CSRF |
| `secure` | `env.COOKIE_SECURE` (**must be `true` in production/HTTPS**) |
| `path` | `/` |
| `maxAge` | `durationToMs(JWT_REFRESH_TTL)` |
| `domain` | `env.COOKIE_DOMAIN` |

CORS is locked to `env.CLIENT_URL` with `credentials: true`, so the cookie is only ever sent to
and accepted from the known web origin.

---

## Authorization model

Three roles, strictly ordered: **`viewer (0) < editor (1) < owner (2)`** (`ROLE_RANK`,
`hasAtLeastRole`). Access is stored in **normalized membership collections**
(`WorkspaceMembership`, `BoardMembership`) — one row per `(scope, user)` — which are the
authoritative access list.

All checks go through **`services/access`** — controllers and the socket gateway never
hand-roll a role comparison:

- `getWorkspaceRole` / `getBoardRole` — non-throwing role lookup.
- `requireWorkspaceRole(userId, wsId, required)` — throws `403` if under-privileged.
- `requireBoardRole(userId, boardId, required)` — returns `{ board, role }`; throws **`404`
  (not `403`) when the user has no access at all**, so board existence isn't leaked to
  outsiders.

Because REST and sockets share this module, a socket write can never bypass a REST rule.

---

## Authorization matrix

Roles are the **minimum** required. "auth" = any authenticated user.

### Workspace (REST `/workspaces`)

| Action | Endpoint | Required |
|---|---|---|
| List my workspaces | `GET /` | auth (membership-scoped) |
| Create workspace | `POST /` | auth (becomes owner) |
| View workspace | `GET /:id` | **viewer** |
| Rename workspace | `PATCH /:id` | **owner** |
| Delete workspace (cascade) | `DELETE /:id` | **owner** |
| List members | `GET /:id/members` | **viewer** |
| Invite | `POST /:id/invitations` | **editor** |
| Change member role | `PATCH /:id/members` | **owner** |
| Remove member | `DELETE /:id/members/:userId` | **owner** (can't remove last owner) |

### Board (REST `/boards`)

| Action | Endpoint | Required |
|---|---|---|
| List boards | `GET /` | auth (membership-scoped) |
| Create board | `POST /` | workspace **editor** |
| View board | `GET /:id` | **viewer** |
| Update (title/archive/thumb) | `PATCH /:id` | **editor** |
| Delete (cascade) | `DELETE /:id` | **owner** |
| Star / unstar | `POST /:id/star` | **viewer** |
| List members | `GET /:id/members` | **viewer** |
| Invite to board | `POST /:id/invitations` | **editor** |
| Change member role | `PATCH /:id/members` | **owner** → `emitRoleChanged` |
| Remove member | `DELETE /:id/members/:userId` | **owner** → `emitKicked` |
| List snapshots | `GET /:id/snapshots` | **viewer** |
| Create snapshot | `POST /:id/snapshots` | **editor** |
| Restore snapshot | `POST /:id/snapshots/restore` | **editor** |
| AI action-items | `POST /:id/ai/action-items` | **viewer** |
| Export PDF | `POST /:id/export/pdf` | **viewer** |
| List share links | `GET /:id/share` | **editor** |
| Create share link | `POST /:id/share` | **editor** |
| Revoke share link | `DELETE /:id/share/:linkId` | **editor** |

### Socket (`realtime/gateway.ts`)

| Event | Required |
|---|---|
| `board:join`, `presence:cursor`, `yjs:awareness` | **viewer** |
| `yjs:update`, `snapshot:create` | **editor** |

### Public (`/public`, no auth)

`GET /public/boards/:token` resolves a `ShareLink` by `sha256(token)`, rejects
revoked/expired links, and returns a **read-only** view (board id/title, canvas state, notes
text, expiry). No membership required — the token *is* the capability.

---

## Socket authentication

The Socket.IO handshake carries the access token in `auth.token` (fallback `query.token`).
Connection middleware verifies it with `verifyAccessToken`; an invalid/missing token rejects
the connection with `UNAUTHORIZED`. Then **every board-scoped event is re-authorized** via
`services/access`, cached per socket for 20 s to avoid a DB hit per keystroke. The cache is
**busted eagerly** on role change (`emitRoleChanged`) and kick (`emitKicked`), so a demotion
takes effect within one event, never waiting out the TTL. The client refreshes its token and
reconnects automatically when the server reports `UNAUTHORIZED`.

---

## Rate limiting

`express-rate-limit` (`middleware/rateLimit.ts`), behind `trust proxy: 1` so limits key on the
real client IP:

| Limiter | Window | Max (prod) | Applies to |
|---|---|---|---|
| `apiLimiter` | 60 s | 300 req | all of `/api` |
| `authLimiter` | 15 min | 30 req | auth endpoints (brute-force target) |

Both return the shared `{ error: { code: 'RATE_LIMITED', … } }` envelope and set standard
`RateLimit-*` headers. In `test` mode the caps are raised so suites aren't throttled.

---

## Input validation

Every write validates with **Zod** via `validate(schema, 'body'|'query'|'params')`
(`middleware/validate.ts`), which **replaces** the request segment with the parsed/coerced
result (so `?page=2` becomes a number downstream). Failures become a structured `400
VALIDATION_ERROR` with per-field `details`. Schemas live in `packages/shared/src/schemas` and
are the runtime mirror of the DTO types (email normalization, password length, role enums,
board-title/workspace-name limits, share TTL cap, etc.). The central `errorHandler` also maps
stray `ZodError`s and Mongo duplicate-key (`11000`) errors to clean envelopes, and never leaks
stack traces — unknown errors become a generic `500 INTERNAL`.

---

## Threat mitigations

| Threat | Mitigation |
|---|---|
| **XSS stealing sessions** | Access token in memory only; refresh token `httpOnly` — JS can't read either long-lived secret. `helmet` sets security headers. |
| **CSRF** | `sameSite=lax` refresh cookie; state-changing calls need a `Bearer` access token that a cross-site form can't attach; CORS locked to `CLIENT_URL`. |
| **Credential theft from DB** | Passwords bcrypt-hashed (cost 12); refresh & email & share tokens stored as `sha256`, never plaintext. |
| **Token replay after logout / rotation** | Refresh tokens are single-use and rotated (`jti` revoked on use); revoked/expired rows rejected and TTL-purged. |
| **Privilege escalation** | Single `services/access` gate for REST **and** sockets; writes require `editor`, admin actions require `owner`; role cache busted on change. |
| **Board-existence enumeration** | `requireBoardRole` returns `404` (not `403`) for non-members. |
| **Brute force** | `authLimiter` (30/15 min) on auth routes. |
| **Oversized/malicious payloads** | `express.json({ limit: '6mb' })`, socket `maxHttpBufferSize` capped, Zod bounds on all inputs. |
| **Share-link abuse** | Tokens are 32-byte random, stored hashed, revocable, and capped at a 30-day TTL; public view is strictly read-only. |
| **Leaking secrets in API responses** | `toJSON` transform strips `passwordHash`, `tokenHash`, and raw CRDT buffers from every serialized document. |

**Production checklist:** set `COOKIE_SECURE=true`, replace all `*_SECRET` values with long
random strings, terminate TLS in front of the server, and set `CLIENT_URL` to the real origin.
See [DEPLOYMENT.md](DEPLOYMENT.md#production-notes).
