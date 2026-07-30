# REST API reference

Base URL: **`{VITE_API_URL}/api`** (default `http://localhost:4000/api`). JSON in, JSON out.

- **Auth:** send the access token as `Authorization: Bearer <token>`. `POST /auth/refresh` and
  `POST /auth/logout` instead read the `httpOnly` refresh cookie. Endpoints marked _public_
  need no token; _optional_ reads the token if present.
- **Roles** (minimum required) are `viewer < editor < owner`, enforced by `services/access`.
  See the full [authorization matrix](SECURITY.md#authorization-matrix).
- **Errors** use one envelope: `{ "error": { "code", "message", "details"? } }`. Common codes:
  `VALIDATION_ERROR` (400), `UNAUTHORIZED`/`TOKEN_EXPIRED` (401), `FORBIDDEN` (403),
  `*_NOT_FOUND` (404), `DUPLICATE_KEY` (409), `RATE_LIMITED` (429), `INTERNAL` (500).
- Types (`Me`, `Board`, `Workspace`, …) are the shared DTOs in
  [`packages/shared/src/types`](../packages/shared/src/types); these are the exact shapes the
  web `api/*` clients consume.

Jump to: [Auth](#auth-auth) · [Workspaces](#workspaces-workspaces) · [Invitations](#invitations-invitations)
· [Boards](#boards-boards) · [Members](#board-members) · [Version history](#version-history)
· [AI](#ai) · [Export](#export) · [Share links](#share-links) · [Public](#public-public)

---

## Auth (`/auth`)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{ email, password, name }` | `201 { user: Me, accessToken }` + sets refresh cookie |
| POST | `/auth/login` | public | `{ email, password }` | `200 { user: Me, accessToken }` + sets refresh cookie |
| POST | `/auth/refresh` | cookie | — | `200 { accessToken }` (rotates the refresh cookie) |
| POST | `/auth/logout` | cookie | — | `204` (revokes refresh token, clears cookie) |
| GET | `/auth/me` | auth | — | `200 { user: Me }` |
| POST | `/auth/verify-email` | public | `{ token }` | `200 { user: Me }` |
| POST | `/auth/resend-verification` | auth | — | `200 { ok: true }` |

`register` also creates a default workspace (`"<name>'s Workspace"`) with the user as owner and
sends a verification email (dev = console). `refresh` returns `401` if the cookie is
missing/invalid.

---

## Workspaces (`/workspaces`)

All require auth.

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/workspaces` | member | — | `200 { workspaces: Workspace[] }` (with populated `members`) |
| POST | `/workspaces` | auth | `{ name }` | `201 { workspace }` (caller becomes owner) |
| GET | `/workspaces/:id` | viewer | — | `200 { workspace }` |
| PATCH | `/workspaces/:id` | owner | `{ name? }` | `200 { workspace }` |
| DELETE | `/workspaces/:id` | owner | — | `204` (cascades memberships + boards) |
| GET | `/workspaces/:id/members` | viewer | — | `200 { members: WorkspaceMember[] }` |
| POST | `/workspaces/:id/invitations` | editor | `{ email, role, boardId? }` | `201 { invitation }` |
| PATCH | `/workspaces/:id/members` | owner | `{ userId, role }` | `200 { member }` |
| DELETE | `/workspaces/:id/members/:userId` | owner | — | `204` (can't remove the last owner) |

Invitations email a link to `${CLIENT_URL}/accept-invite/<token>`.

---

## Invitations (`/invitations`)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/invitations/:token` | optional | — | `200 { invitation }` preview; `404` if not pending/expired |
| POST | `/invitations/accept` | auth | `{ token }` | `200 { workspaceId, boardId }` (`boardId` null for workspace-wide) |

Accept adds a `WorkspaceMembership` (and a `BoardMembership` when the invitation targets a
board) with the invitation's role and marks it `accepted`. The caller's email must match the
invitation, else `403`.

---

## Boards (`/boards`)

All require auth.

### List

`GET /boards` — returns `200 ListBoardsResponse` = `{ boards: Board[], total, page, limit }`.
Query params (validated + coerced):

| Param | Type | Default | Notes |
|---|---|---|---|
| `workspaceId` | string | — | scope to one workspace |
| `q` | string | — | case-insensitive search on **title and owner name** |
| `starred` | boolean | — | only starred boards |
| `sort` | `lastOpened \| created \| updated \| title` | `lastOpened` | |
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `20` | |

Built from the caller's `BoardMembership` (their access list) via a single aggregation — no
N+1. Each board carries per-user `starred`, `lastOpenedAt`, and `myRole`.

### CRUD

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/boards` | workspace editor | `{ workspaceId, title }` | `201 { board }` (`myRole: 'owner'`) |
| GET | `/boards/:id` | viewer | — | `200 { board }` (populated `members`, `myRole`, `starred`, `lastOpenedAt`; bumps `lastOpenedAt`) |
| PATCH | `/boards/:id` | editor | `{ title?, isArchived?, thumbnail? }` | `200 { board }` |
| DELETE | `/boards/:id` | owner | — | `204` (cascades memberships, note, ops, snapshots, share links) |
| POST | `/boards/:id/star` | viewer | `{ starred }` | `200 { starred }` (updates caller's membership) |

Creating a board also creates an owner `BoardMembership` for the creator, an owner membership
for the workspace owner (if different), and an empty `Note`.

### Board members

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/boards/:id/members` | viewer | — | `200 { members: BoardMember[] }` |
| POST | `/boards/:id/invitations` | editor | `{ email, role }` | `201 { invitation }` (board-scoped) |
| PATCH | `/boards/:id/members` | owner | `{ userId, role }` | `200 { member }` → emits `board:role-changed` |
| DELETE | `/boards/:id/members/:userId` | owner | — | `204` → emits `board:kicked` |

### Version history

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/boards/:id/snapshots` | viewer | — | `200 { snapshots: Snapshot[] }` (both docs, newest first; `size` = state bytes) |
| POST | `/boards/:id/snapshots` | editor | `{ label? }` | `201 { snapshotId }` (snapshots canvas + notes) |
| POST | `/boards/:id/snapshots/restore` | editor | `{ snapshotId }` | `200` (diff fans out to all clients live) |

### AI

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/boards/:id/ai/action-items` | viewer | `{ text? }` | `200 GenerateActionItemsResponse` = `{ items: ActionItem[], model, generatedAt }` |

`text` defaults to the board's current notes text. Uses `AI_SERVICE_URL` if configured, else
the in-process mock (`model: "mock-llm-v1"`).

### Export

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/boards/:id/export/pdf` | viewer | `{ canvasPng?, actionItems? }` | `200` PDF stream (`Content-Type: application/pdf`, `Content-Disposition: attachment`) |

Generated with PDFKit: title, generated date, members, notes text, action items, and the
embedded canvas PNG if provided.

### Share links

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/boards/:id/share` | editor | — | `200 { links: ShareLink[] }` |
| POST | `/boards/:id/share` | editor | `{ ttlDays? }` | `201 { link, url }` (`url = ${CLIENT_URL}/share/<token>`) |
| DELETE | `/boards/:id/share/:linkId` | editor | — | `204` (marks revoked) |

`ttlDays` is capped at 30 (`LIMITS.SHARE_LINK_MAX_TTL_DAYS`); omit/null for no expiry. The raw
token is returned **once** at creation; the DB stores only its `sha256`.

---

## Public (`/public`)

No authentication — the share token is the capability.

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/public/boards/:token` | public | `200 PublicBoardResponse` = `{ board: {id,title}, canvasState (base64), notesText, expiresAt }` |

Resolves the `ShareLink` by `sha256(token)` and rejects revoked/expired links (`404`).

---

## Health

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `200 { status: 'ok', service: 'collabboard-server', ts }` (note: **not** under `/api`) |
