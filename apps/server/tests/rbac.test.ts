import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardMembership, WorkspaceMembership } from '../src/models';
import { bearer, makeApp, registerAndLogin, type RegisteredUser } from './helpers/app';

describe('rbac', () => {
  let app: ReturnType<typeof makeApp>;
  let owner: RegisteredUser;
  let viewer: RegisteredUser;
  let outsider: RegisteredUser;
  let workspaceId: string;
  let boardId: string;

  beforeEach(async () => {
    app = makeApp();
    owner = await registerAndLogin(request.agent(app), { name: 'Owner' });
    viewer = await registerAndLogin(request.agent(app), { name: 'Viewer' });
    outsider = await registerAndLogin(request.agent(app), { name: 'Outsider' });

    const ws = await request(app)
      .post('/api/workspaces')
      .set(...bearer(owner.accessToken))
      .send({ name: 'RBAC WS' })
      .expect(201);
    workspaceId = ws.body.workspace.id;

    const board = await request(app)
      .post('/api/boards')
      .set(...bearer(owner.accessToken))
      .send({ workspaceId, title: 'Locked Board' })
      .expect(201);
    boardId = board.body.board.id;

    // Grant the viewer read-only access directly (the invite/accept flow is covered
    // elsewhere) — access checks only consult BoardMembership, and we add the mirror
    // workspace row so the fixture matches how the app would really shape the data.
    await BoardMembership.create({
      board: boardId,
      workspace: workspaceId,
      user: viewer.user.id,
      role: 'viewer',
    });
    await WorkspaceMembership.create({
      workspace: workspaceId,
      user: viewer.user.id,
      role: 'viewer',
    });
  });

  it('forbids a viewer from editing the board', async () => {
    const res = await request(app)
      .patch(`/api/boards/${boardId}`)
      .set(...bearer(viewer.accessToken))
      .send({ title: 'Hijacked' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids a viewer from creating a snapshot', async () => {
    await request(app)
      .post(`/api/boards/${boardId}/snapshots`)
      .set(...bearer(viewer.accessToken))
      .send({ label: 'nope' })
      .expect(403);
  });

  it('hides a board from a non-member (404, existence not leaked)', async () => {
    const res = await request(app)
      .get(`/api/boards/${boardId}`)
      .set(...bearer(outsider.accessToken))
      .expect(404);
    expect(res.body.error).toBeDefined();

    // …and they certainly cannot mutate it.
    await request(app)
      .patch(`/api/boards/${boardId}`)
      .set(...bearer(outsider.accessToken))
      .send({ title: 'Hijacked' })
      .expect(404);
  });

  it('lets only the owner change member roles', async () => {
    // A viewer trying to hand out roles is rejected before anything mutates.
    await request(app)
      .patch(`/api/boards/${boardId}/members`)
      .set(...bearer(viewer.accessToken))
      .send({ userId: viewer.user.id, role: 'editor' })
      .expect(403);

    // The owner can promote the viewer to editor.
    const promoted = await request(app)
      .patch(`/api/boards/${boardId}/members`)
      .set(...bearer(owner.accessToken))
      .send({ userId: viewer.user.id, role: 'editor' })
      .expect(200);
    expect(promoted.body.member.role).toBe('editor');

    // And the promotion is real: the former viewer can now edit.
    await request(app)
      .patch(`/api/boards/${boardId}`)
      .set(...bearer(viewer.accessToken))
      .send({ title: 'Now editable' })
      .expect(200);
  });
});
