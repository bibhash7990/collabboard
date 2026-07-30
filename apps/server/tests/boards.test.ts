import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Board } from '@collabboard/shared';
import { bearer, makeApp, registerAndLogin } from './helpers/app';

describe('boards', () => {
  let app: ReturnType<typeof makeApp>;
  let token: string;
  let workspaceId: string;
  const titles = ['Alpha Plan', 'Beta Roadmap', 'Gamma Notes'];
  let boards: Board[];

  async function createBoard(title: string): Promise<Board> {
    const res = await request(app)
      .post('/api/boards')
      .set(...bearer(token))
      .send({ workspaceId, title })
      .expect(201);
    return res.body.board as Board;
  }

  beforeEach(async () => {
    app = makeApp();
    const auth = await registerAndLogin(request.agent(app));
    token = auth.accessToken;

    const ws = await request(app)
      .post('/api/workspaces')
      .set(...bearer(token))
      .send({ name: 'Boards WS' })
      .expect(201);
    workspaceId = ws.body.workspace.id;

    boards = [];
    for (const title of titles) boards.push(await createBoard(title));
  });

  it('lists boards with pagination metadata', async () => {
    const res = await request(app)
      .get('/api/boards')
      .query({ workspaceId })
      .set(...bearer(token))
      .expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.boards).toHaveLength(3);
    // Every board should carry the caller's per-board metadata.
    for (const b of res.body.boards as Board[]) expect(b.myRole).toBe('owner');
  });

  it('searches boards by title (case-insensitive)', async () => {
    const res = await request(app)
      .get('/api/boards')
      .query({ workspaceId, q: 'alpha' })
      .set(...bearer(token))
      .expect(200);

    expect(res.body.boards).toHaveLength(1);
    expect(res.body.boards[0].title).toBe('Alpha Plan');
    expect(res.body.total).toBe(1);
  });

  it('stars a board and filters by starred', async () => {
    const target = boards[1]; // Beta Roadmap
    const star = await request(app)
      .post(`/api/boards/${target.id}/star`)
      .set(...bearer(token))
      .send({ starred: true })
      .expect(200);
    expect(star.body.starred).toBe(true);

    const res = await request(app)
      .get('/api/boards')
      .query({ workspaceId, starred: true })
      .set(...bearer(token))
      .expect(200);

    expect(res.body.boards).toHaveLength(1);
    expect(res.body.boards[0].id).toBe(target.id);
    expect(res.body.boards[0].starred).toBe(true);
  });

  it('sorts boards by title ascending', async () => {
    const res = await request(app)
      .get('/api/boards')
      .query({ workspaceId, sort: 'title' })
      .set(...bearer(token))
      .expect(200);

    const got = (res.body.boards as Board[]).map((b) => b.title);
    expect(got).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it('paginates with page and limit', async () => {
    const first = await request(app)
      .get('/api/boards')
      .query({ workspaceId, sort: 'title', page: 1, limit: 2 })
      .set(...bearer(token))
      .expect(200);
    expect(first.body.total).toBe(3);
    expect(first.body.page).toBe(1);
    expect(first.body.limit).toBe(2);
    expect(first.body.boards).toHaveLength(2);

    const second = await request(app)
      .get('/api/boards')
      .query({ workspaceId, sort: 'title', page: 2, limit: 2 })
      .set(...bearer(token))
      .expect(200);
    expect(second.body.page).toBe(2);
    expect(second.body.boards).toHaveLength(1);
  });

  it('gets a board with the caller marked as owner', async () => {
    const res = await request(app)
      .get(`/api/boards/${boards[0].id}`)
      .set(...bearer(token))
      .expect(200);

    expect(res.body.board.id).toBe(boards[0].id);
    expect(res.body.board.myRole).toBe('owner');
    expect(Array.isArray(res.body.board.members)).toBe(true);
    expect(res.body.board.members.length).toBeGreaterThanOrEqual(1);
  });

  it('updates a board title', async () => {
    const res = await request(app)
      .patch(`/api/boards/${boards[0].id}`)
      .set(...bearer(token))
      .send({ title: 'Alpha Plan v2' })
      .expect(200);
    expect(res.body.board.title).toBe('Alpha Plan v2');
  });

  it('deletes a board', async () => {
    await request(app)
      .delete(`/api/boards/${boards[2].id}`)
      .set(...bearer(token))
      .expect(204);

    // Gone → the owner can no longer read it (404, existence not leaked).
    await request(app)
      .get(`/api/boards/${boards[2].id}`)
      .set(...bearer(token))
      .expect(404);
  });
});
