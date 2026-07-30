# Testing

CollabBoard is tested at the level that matters for a realtime app: **integration tests over a
real HTTP + Socket.IO server**, against an in-memory MongoDB, plus web unit tests.

- [Running the tests](#running-the-tests)
- [Server test stack](#server-test-stack)
- [What's covered](#whats-covered)
- [The realtime test approach](#the-realtime-test-approach)
- [Web tests](#web-tests)

---

## Running the tests

```bash
npm test          # server suite (Vitest) — the primary suite
npm run test:web  # web unit tests (Vitest + jsdom)
```

Per-workspace equivalents:

```bash
npm run test -w @collabboard/server
npm run test:watch -w @collabboard/server   # watch mode
npm run test -w @collabboard/web
```

No external services are required — the server suite spins up its own MongoDB in-process, and
Redis is optional (the tests exercise the single-node code paths).

---

## Server test stack

Configured in `apps/server/vitest.config.ts`:

| Concern | Choice |
|---|---|
| Runner | **Vitest** (`environment: 'node'`, globals on) |
| HTTP assertions | **Supertest** against `createApp()` (the same Express app the server runs) |
| Realtime | a real `http.Server` + `createSocketServer` + **`socket.io-client`** peers |
| Database | **`mongodb-memory-server`** — a throwaway MongoDB per run |
| Isolation | `pool: 'forks'` + `singleFork: true` so DB state is serialized, not raced |
| Timeouts | `testTimeout: 30 s`, `hookTimeout: 60 s` (memory-server download/boot) |
| Setup | `tests/helpers/setup.ts` (global lifecycle); DB helpers in `tests/helpers/db.ts` |

`config/env.ts` selects `NODE_ENV=test` behaviour automatically: the logger goes silent and the
rate limiters raise their caps so suites aren't throttled.

Test files (per BUILD_SPEC §7), under `apps/server/tests/`:

```
tests/
├── helpers/
│   ├── setup.ts     global setup/teardown (memory Mongo connect/disconnect, cleanup)
│   └── db.ts        mongodb-memory-server lifecycle + per-test collection reset
├── auth.test.ts     register / login / refresh / me / verify
├── boards.test.ts   board CRUD + list search/star/sort + pagination
├── rbac.test.ts     role enforcement (viewer can't edit; forbidden paths)
└── realtime.test.ts two socket clients: join, edit, broadcast, viewer rejection
```

---

## What's covered

**Auth (`auth.test.ts`)** — registration creates a user + default workspace + owner
membership; login returns an access token and sets the refresh cookie; `/auth/refresh` rotates
and returns a fresh token; `/auth/me` reflects the token; email verification flips
`emailVerified`.

**Boards (`boards.test.ts`)** — create/read/update/delete; the list endpoint's **search by
title and owner name**, **starred** filter, each **sort** option, and **pagination**
(`page`/`limit`, `total`) — the graded query behaviour.

**RBAC (`rbac.test.ts`)** — a **viewer is refused** editor/owner actions (edit, invite, delete,
snapshot) over REST; non-members get `404` (existence not leaked); owners can, viewers can't.
This asserts the single `services/access` gate holds.

**Realtime (`realtime.test.ts`)** — see below.

---

## The realtime test approach

The realtime suite treats the socket layer as a black box and drives it exactly as a browser
would — two independent `socket.io-client` connections against a real Socket.IO server:

1. **Boot** a `http.Server` wrapping `createApp()`, attach `createSocketServer(server)`, and
   listen on an ephemeral port.
2. **Seed** a board with two memberships — one **editor**, one **viewer** — and mint an access
   token for each user.
3. **Connect** two clients, passing each token via `auth: { token }`; both `emit('board:join')`
   and await the ack (`BoardJoinedPayload` with role + base64 state + presence).
4. **Edit → broadcast:** the editor emits `yjs:update` with a real base64 Yjs update; assert the
   other client receives a matching `yjs:broadcast` and that applying it converges its local
   `Y.Doc`.
5. **Authorization:** the **viewer's** `yjs:update` is **rejected** — the ack returns
   `{ ok: false, error: { code: 'FORBIDDEN' } }` and an `error` event fires — proving writes
   are re-authorized server-side, never trusting the client.

Because the assertions ride on the shared protocol types and the real gateway, they catch any
drift between client and server (a renamed event or changed payload would already fail to
compile). Presence (`presence:join`/`presence:leave`) and awareness relay can be asserted the
same way — a second client observing the first's join/leave.

---

## Web tests

`apps/web/vitest.config.ts` runs `src/**/*.test.{ts,tsx}` in a **jsdom** environment with
`@testing-library/react` and `@testing-library/jest-dom` (setup: `src/test/setup.ts`). These
cover pure client logic — store reducers, the CRDT helpers, and component rendering — without a
backend. The `@collabboard/shared` alias resolves to source so tests share the same contract as
the app.

---

## Manual / API testing

A Postman collection lives in `postman/`:

- `CollabBoard.postman_collection.json` — the full auth flow with **token-capture scripts**
  (login stores the access token into an environment variable for subsequent requests), plus
  board CRUD, share links, and AI.
- `CollabBoard.postman_environment.json` — base URL and token variables.

Import both, run **Register/Login** first, then the rest inherit the captured token.
