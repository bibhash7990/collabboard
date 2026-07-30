# BUILD_SPEC — authoritative contract for implementers

> Every agent/file MUST conform to this document and to the type contract in
> `packages/shared/src`. When in doubt, the **shared types win**. Do not invent
> new socket events, endpoint shapes, or model fields — extend the shared package
> if something is genuinely missing and note it.

## 0. Mission

CollabBoard — a Miro-style real-time collaborative whiteboard + meeting-notes
platform. Monorepo (npm workspaces): `packages/shared`, `apps/server`, `apps/web`.

## 1. Ground rules

- **TypeScript, ESM, strict.** No `any` unless unavoidable (then comment why).
- Imports: relative **extensionless** inside an app (`./foo`), `@collabboard/shared`
  for shared types, `@/…` alias on the web app. Shared package uses `.js` suffixes.
- Server handlers: wrap in `asyncHandler`, validate input with `validate(schema, 'body'|'query'|'params')`,
  throw `ApiError.*`, never `res.status(500)` by hand. Return shapes EXACTLY as the
  web `api/*` modules expect (they are the client contract — see §3).
- Authorization: **always** go through `services/access` (`requireBoardRole`,
  `requireWorkspaceRole`, `getBoardRole`). Never hand-roll a role check.
- Mongoose docs serialize via `.toJSON()` → `{ id, … }` (no `_id`, no secrets).
  Map documents to the shared DTO types when responding.
- When a board membership role changes or is removed, call `emitRoleChanged` /
  `emitKicked` from `realtime/gateway` so live sockets update immediately.
- Comments: explain **why**, match the density of the already-written foundation
  files. No decorative banners beyond the section style already in use.

## 2. What already exists (DO NOT recreate)

- `packages/shared/**` — all domain types, DTOs, socket protocol, zod schemas, constants.
- Server foundation: `config/*`, `utils/*`, `middleware/*`, `models/*`,
  `services/access.ts`, `realtime/*` (gateway, BoardDocManager, manager singleton),
  `app.ts`, `index.ts`, `routes/index.ts` (barrel — already imports every module router).
- Web foundation: `lib/*` (apiClient, socket, yjsBoard, base64, env), `api/*`,
  `stores/*` (authStore, boardStore), `hooks/useAuthBootstrap`, `components/ui/*`,
  `components/ProtectedRoute`, `App.tsx`, `main.tsx`, `styles/index.css`.

The routes barrel imports these exact router exports — create them with these names:
`authRouter` (`modules/auth/auth.routes.ts`), `workspacesRouter`
(`modules/workspaces/workspaces.routes.ts`), `invitationsRouter`
(`modules/invitations/invitations.routes.ts`), `boardsRouter`
(`modules/boards/boards.routes.ts`), `publicRouter` (`modules/public/public.routes.ts`).

## 3. REST endpoint contract (must match `apps/web/src/api/*`)

All under `/api`. Auth = requires `requireAuth`. Roles are board/workspace roles.

### auth (`/auth`) — authRouter
- `POST /register` {email,password,name} → 201 `{ user: Me, accessToken }` + set refresh cookie. Creates a default workspace ("<name>'s Workspace") + owner membership, sends verification email (dev = console).
- `POST /login` {email,password} → `{ user: Me, accessToken }` + refresh cookie.
- `POST /refresh` → `{ accessToken }`. Reads refresh cookie, verifies + rotates (revoke old jti, issue new), resets cookie. 401 if missing/invalid.
- `POST /logout` → 204, revoke refresh token + clear cookie.
- `GET /me` (auth) → `{ user: Me }`.
- `POST /verify-email` {token} → `{ user: Me }` (marks emailVerified).
- `POST /resend-verification` (auth) → 200 `{ ok: true }`.

Cookie: name `env.COOKIE_NAME`, httpOnly, sameSite 'lax', secure `env.COOKIE_SECURE`,
path '/', maxAge from `durationToMs(env.JWT_REFRESH_TTL)`. Use `tokens.ts` helpers +
`RefreshToken` model (store `sha256(token)` + jti). Password via `utils/password`.

### workspaces (`/workspaces`) — workspacesRouter (all auth)
- `GET /` → `{ workspaces: Workspace[] }` (where caller is a member; include `members` with populated user).
- `POST /` {name} → 201 `{ workspace }` (caller becomes owner member).
- `GET /:id` → `{ workspace }` (require viewer).
- `PATCH /:id` {name} → `{ workspace }` (require owner).
- `DELETE /:id` → 204 (require owner; cascade memberships + boards? at least block if boards exist OR cascade — cascade and delete boards' memberships).
- `GET /:id/members` → `{ members: WorkspaceMember[] }` (require viewer).
- `POST /:id/invitations` {email,role,boardId?} → 201 `{ invitation }` (require editor; create Invitation + email link `${CLIENT_URL}/accept-invite/<token>`). If the email already belongs to a user, may also directly add membership — but default: always create a pending invitation.
- `PATCH /:id/members` {userId,role} → `{ member }` (require owner).
- `DELETE /:id/members/:userId` → 204 (require owner; can't remove last owner).

### invitations (`/invitations`)
- `GET /:token` (optionalAuth) → `{ invitation }` preview (join workspace/board name). 404 if not pending/expired.
- `POST /accept` (auth) {token} → `{ workspaceId, boardId }`. Adds WorkspaceMembership (and BoardMembership if invitation.board set) with invitation.role; marks accepted. Email must match caller (or allow any authed user — default: match invitation.email to caller email, else 403).

### boards (`/boards`) — boardsRouter (all auth). Owns star/members/snapshots/export/ai/share.
- `GET /` query {workspaceId?,q?,starred?,sort?,page?,limit?} → `ListBoardsResponse`.
  Build from `BoardMembership` of the caller (that is the access list). Support:
  search `q` on title (case-insensitive) **and owner name**; `starred` filter;
  sort by lastOpened|created|updated|title; pagination. Attach per-board
  `starred`, `lastOpenedAt`, `myRole`. This query's efficiency is graded — use an
  aggregation from BoardMembership → lookup Board → lookup owner; avoid N+1.
- `POST /` {workspaceId,title} → 201 `{ board }` (require workspace editor). Creates
  Board + owner BoardMembership for creator + owner BoardMembership for the workspace
  owner (if different) + empty Note. Return board with `myRole:'owner'`.
- `GET /:id` → `{ board }` (require viewer). Include `members` (populated), `myRole`,
  `starred`, `lastOpenedAt`. Also bump the caller's `lastOpenedAt`.
- `PATCH /:id` {title?,isArchived?,thumbnail?} → `{ board }` (require editor).
- `DELETE /:id` → 204 (require owner; cascade memberships, note, ops, snapshots, share links).
- `POST /:id/star` {starred} → `{ starred }` (require viewer; updates caller's BoardMembership).
- `GET /:id/members` → `{ members: BoardMember[] }` (require viewer).
- `POST /:id/invitations` {email,role} → 201 `{ invitation }` (require editor; Invitation with board set).
- `PATCH /:id/members` {userId,role} → `{ member }` (require owner; then `emitRoleChanged(boardId,userId,role)`).
- `DELETE /:id/members/:userId` → 204 (require owner; then `emitKicked(boardId,userId)`).
- `GET /:id/snapshots` → `{ snapshots: Snapshot[] }` (require viewer; from Snapshot model, newest first, both docs, include size = state.length).
- `POST /:id/snapshots` {label?} → 201 `{ snapshotId }` (require editor; `boardDocs.createSnapshot(id,'canvas',{label,createdBy})` and notes).
- `POST /:id/snapshots/restore` {snapshotId} → 200 (require editor; load Snapshot, `boardDocs.restoreSnapshot(...)`; the diff fans out to clients).
- `POST /:id/ai/action-items` {text?} → `GenerateActionItemsResponse` (require viewer;
  text defaults to `boardDocs.getNotesText(id)`; use `services/ai` — external
  `AI_SERVICE_URL` if set else the internal deterministic mock; model name `mock-llm-v1`).
- `POST /:id/export/pdf` {canvasPng?,actionItems?} → PDF stream (require viewer;
  PDFKit; title, generated date, members, notes text, action items, embed canvasPng
  if provided; `Content-Type application/pdf`, `Content-Disposition attachment`).
- `GET /:id/share` → `{ links: ShareLink[] }` (require editor).
- `POST /:id/share` {ttlDays?} → 201 `{ link, url }` (require editor; token via `randomToken`,
  store `sha256`; url `${CLIENT_URL}/share/<token>`).
- `DELETE /:id/share/:linkId` → 204 (require editor; set revoked).

### public (`/public`) — publicRouter (NO auth)
- `GET /boards/:token` → `PublicBoardResponse`. Resolve ShareLink by `sha256(token)`,
  reject if revoked/expired. Return `{ board:{id,title}, canvasState: base64
  (boardDocs.getState), notesText: boardDocs.getNotesText, expiresAt }`.

## 4. Server modules to implement

```
modules/auth/         auth.controller.ts, auth.service.ts, auth.routes.ts, cookies.ts
modules/workspaces/   workspaces.controller.ts, workspaces.routes.ts
modules/invitations/  invitations.controller.ts, invitations.routes.ts, invitations.service.ts
modules/boards/       boards.controller.ts, boards.routes.ts, members.controller.ts,
                      snapshots.controller.ts, share.controller.ts, export.controller.ts,
                      ai.controller.ts
modules/public/       public.controller.ts, public.routes.ts
services/ai.ts        extractActionItems(text): ActionItem[] (deterministic mock + optional fetch)
services/serialize.ts helpers doc→DTO (users, board, workspace, invitation, snapshot, sharelink)
seed/seed.ts          idempotent demo data (see §7)
```

## 5. Web UI to implement

```
pages/LoginPage.tsx, RegisterPage.tsx, VerifyEmailPage.tsx, AcceptInvitePage.tsx,
pages/DashboardPage.tsx, BoardPage.tsx, SharePage.tsx, NotFoundPage.tsx
components/layout/AppHeader.tsx (logo, user menu, logout)
components/board-list/ (BoardGrid.tsx, BoardCard.tsx, BoardListToolbar.tsx, CreateBoardModal.tsx, WorkspaceSwitcher.tsx)
components/canvas/ (CanvasStage.tsx, Toolbar.tsx, ShapeRenderer.tsx, StickyNote.tsx, useCanvasElements.ts)
components/presence/ (PresenceLayer.tsx, PresenceAvatars.tsx)
components/notes/ (NotesPanel.tsx, ActionItemsPanel.tsx)
components/board/ (BoardHeader.tsx, ShareDialog.tsx, MembersDialog.tsx, HistoryDialog.tsx, ConnectionBadge.tsx)
hooks/ (useBoardConnection.ts, usePresence.ts, useToast.ts)
```

### Canvas model (CRDT)
- Elements live in `connection.canvasDoc.getMap<CanvasElement>('elements')`, keyed by
  element `id` (nanoid). **Values are plain `CanvasElement` objects** (shared type).
  Concurrent edits to different elements are conflict-free (distinct keys).
- `useCanvasElements(doc)` subscribes via `map.observe`, returns `{ elements: CanvasElement[],
  upsert(el), remove(id), clear() }`. Mutations must run in `doc.transact(() => …)`.
- `CanvasStage` (react-konva `Stage`/`Layer`): render elements via `ShapeRenderer`
  (pen/line/arrow = `Line`; rectangle = `Rect`; ellipse = `Ellipse`; text = `Text`;
  sticky = `StickyNote` = group of `Rect`+`Text`). Tool + color from `boardStore`.
  Pen: collect points on pointermove, commit element on pointerup. Select tool: drag
  to move (update x/y or point offsets), Delete key removes selected. Editors only
  (`connection.role !== 'viewer'`); viewers get a read-only stage.
- Cursor presence: on stage pointermove throttle (`LIMITS.CURSOR_THROTTLE_MS`) emit
  `PRESENCE_CURSOR {boardId,x,y}` (stage coords). Render peers from `boardStore.presence`
  in `PresenceLayer`.

### Notes (Tiptap + Yjs)
- `useEditor` with `StarterKit.configure({ history:false })`, `Collaboration.configure({
  document: connection.notesDoc, field:'default' })`, `CollaborationCursor.configure({
  provider:{ awareness: connection.awareness }, user:{ name, color } })`, `Placeholder`.
  Field MUST be `'default'` (server reads `getXmlFragment('default')`). Viewers: `editable:false`.
- `ActionItemsPanel`: button → `aiApi.actionItems(boardId)`, list results with confidence.

### Board page wiring (`BoardPage` + `useBoardConnection`)
- `connectSocket()`, create one `BoardConnection(boardId, {id,name,color})`,
  `connection.connect(socket)`. Subscribe to `PRESENCE_STATE/JOIN/LEAVE` → boardStore.
  On `BOARD_ROLE_CHANGED` update local role; on `BOARD_KICKED` toast + navigate to /app.
  Destroy connection + reset presence on unmount. Layout: `BoardHeader` on top,
  canvas (flex-1) left, `NotesPanel` right (resizable/collapsible), `Toolbar` floating,
  `ConnectionBadge` (online/offline/connecting from `connection.onStatus`).
- Export PNG: `stageRef.current.toDataURL()` → download. Export PDF: pass that dataURL
  to `exportApi.pdf(boardId, png, actionItems)` → download blob.

## 6. Docs to write (`docs/` + root `README.md`)
`README.md` (setup, env, quickstart, scripts, feature list, screenshots placeholders),
`ARCHITECTURE.md` (+ mermaid), `DATA_MODEL.md` (collections + indexes + op-vs-snapshot),
`REALTIME.md` (socket protocol table, Yjs flow, presence, scaling), `SECURITY.md`
(authz matrix, JWT/cookie, socket auth), `API.md` (endpoint reference from §3),
`TESTING.md`, `DEPLOYMENT.md` (docker). Keep them accurate to the code.

## 7. Tests, seed, Postman
- `apps/server/tests/`: `helpers/db.ts` (mongodb-memory-server setup/teardown),
  `auth.test.ts` (register/login/refresh/me/verify), `boards.test.ts` (CRUD + list
  search/star/sort + pagination), `rbac.test.ts` (viewer can't edit, forbidden paths),
  `realtime.test.ts` (two socket clients: join, one edits via yjs:update, other
  receives yjs:broadcast; viewer's yjs:update rejected). Use `createApp()` + supertest,
  and a real `http.Server` + `createSocketServer` + `socket.io-client` for realtime.
- `seed/seed.ts`: users alice@demo.dev / bob@demo.dev / carol@demo.dev (password
  `Password123!`, emailVerified true), one workspace, two boards with memberships
  (alice owner, bob editor, carol viewer), seed a note + a couple canvas elements +
  an initial snapshot. Idempotent (clear collections first). Print a summary.
- `postman/CollabBoard.postman_collection.json` + `postman/CollabBoard.postman_environment.json`
  covering the full auth flow (with token capture scripts) + board CRUD + share + ai.
```
