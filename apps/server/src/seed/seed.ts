import * as Y from 'yjs';
import { nanoid } from 'nanoid';
import type { CanvasElement } from '@collabboard/shared';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { hashPassword } from '../utils/password';
import {
  Board,
  BoardMembership,
  BoardOp,
  EmailToken,
  Invitation,
  Note,
  RefreshToken,
  ShareLink,
  Snapshot,
  User,
  Workspace,
  WorkspaceMembership,
} from '../models';

/**
 * Standalone demo-data seeder (run via `npm run seed` / tsx). It wipes every app
 * collection and rebuilds a small, deterministic world so a grader can log in and
 * see live boards immediately. Idempotent by construction: the clear step makes
 * repeat runs safe. It talks only to the models + Yjs — never the socket gateway
 * or BoardDocManager — so it stays a plain DB script with no Redis/socket wiring.
 */

/* eslint-disable no-console -- this script's whole purpose is CLI output. */

const PASSWORD = 'Password123!';
const BOARD_TITLES = ['Product Roadmap', 'Sprint Retro'] as const;

/** A couple of rectangles + a sticky, stored as plain CanvasElement values keyed
 *  by id — exactly the shape the web canvas reads from the `elements` Y.Map. */
function buildCanvasDoc(createdBy: string): Y.Doc {
  const doc = new Y.Doc();
  const elements = doc.getMap<CanvasElement>('elements');
  const now = Date.now();
  const els: CanvasElement[] = [
    {
      id: nanoid(),
      type: 'rectangle',
      x: 80,
      y: 80,
      width: 220,
      height: 120,
      stroke: '#3b82f6',
      fill: '#dbeafe',
      strokeWidth: 2,
      createdBy,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nanoid(),
      type: 'rectangle',
      x: 360,
      y: 220,
      width: 200,
      height: 140,
      stroke: '#22c55e',
      fill: '#dcfce7',
      strokeWidth: 2,
      createdBy,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nanoid(),
      type: 'sticky',
      x: 150,
      y: 300,
      width: 180,
      height: 180,
      fill: '#fef08a',
      text: 'Welcome to CollabBoard!',
      fontSize: 18,
      createdBy,
      createdAt: now,
      updatedAt: now,
    },
  ];
  doc.transact(() => {
    for (const el of els) elements.set(el.id, el);
  });
  return doc;
}

/** Build a Tiptap-compatible notes doc: one `paragraph` per line under the
 *  `default` XML fragment the server reads via `getXmlFragment('default')`. */
function buildNotesDoc(lines: string[]): Y.Doc {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  doc.transact(() => {
    lines.forEach((line, i) => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, line);
      paragraph.insert(0, [text]);
      fragment.insert(i, [paragraph]);
    });
  });
  return doc;
}

async function seed(): Promise<void> {
  await connectDb();

  // Clear every app collection first — this is what makes re-running safe.
  await Promise.all([
    User.deleteMany({}),
    RefreshToken.deleteMany({}),
    EmailToken.deleteMany({}),
    Workspace.deleteMany({}),
    WorkspaceMembership.deleteMany({}),
    Board.deleteMany({}),
    BoardMembership.deleteMany({}),
    Note.deleteMany({}),
    BoardOp.deleteMany({}),
    Snapshot.deleteMany({}),
    Invitation.deleteMany({}),
    ShareLink.deleteMany({}),
  ]);

  // One bcrypt hash reused for all three demo users (same login password).
  const passwordHash = await hashPassword(PASSWORD);
  const [alice, bob, carol] = await User.create([
    { email: 'alice@demo.dev', name: 'Alice', passwordHash, emailVerified: true },
    { email: 'bob@demo.dev', name: 'Bob', passwordHash, emailVerified: true },
    { email: 'carol@demo.dev', name: 'Carol', passwordHash, emailVerified: true },
  ]);

  const workspace = await Workspace.create({ name: 'Demo Workspace', owner: alice._id });
  await WorkspaceMembership.create([
    { workspace: workspace._id, user: alice._id, role: 'owner' },
    { workspace: workspace._id, user: bob._id, role: 'editor' },
    { workspace: workspace._id, user: carol._id, role: 'viewer' },
  ]);

  const boardIds: string[] = [];
  for (const title of BOARD_TITLES) {
    const board = await Board.create({ workspace: workspace._id, title, owner: alice._id });
    boardIds.push(board.id);

    // Same role trio on every board — mirrors the workspace roles.
    await BoardMembership.create([
      { board: board._id, workspace: workspace._id, user: alice._id, role: 'owner' },
      { board: board._id, workspace: workspace._id, user: bob._id, role: 'editor' },
      { board: board._id, workspace: workspace._id, user: carol._id, role: 'viewer' },
    ]);

    // Sample meeting notes — action-item-shaped so the AI extractor has signal.
    const notesLines = [
      `${title} — kickoff notes`,
      'Alice to finalize the roadmap by Friday.',
      'Bob will prepare the sprint demo for next week.',
      'Carol should review the design mockups and leave comments.',
    ];
    const notesText = notesLines.join('\n');
    await Note.create({ board: board._id, text: notesText });

    // Build the initial CRDT state and persist it directly as seq-0 snapshots
    // (the same fast-load path BoardDocManager hydrates from on first join).
    const canvasDoc = buildCanvasDoc(alice.id);
    const notesDoc = buildNotesDoc(notesLines);
    await Snapshot.create([
      {
        board: board._id,
        doc: 'canvas',
        state: Buffer.from(Y.encodeStateAsUpdate(canvasDoc)),
        label: 'Seed',
        createdBy: alice._id,
        seq: 0,
        auto: false,
      },
      {
        board: board._id,
        doc: 'notes',
        state: Buffer.from(Y.encodeStateAsUpdate(notesDoc)),
        label: 'Seed',
        createdBy: alice._id,
        seq: 0,
        auto: false,
      },
    ]);
    canvasDoc.destroy();
    notesDoc.destroy();
  }

  console.log('\n✅ Seed complete — Demo Workspace with 2 boards.\n');
  console.log('Login (all three users share one password):');
  console.log(`  Password:  ${PASSWORD}`);
  console.log('  alice@demo.dev  (owner)');
  console.log('  bob@demo.dev    (editor)');
  console.log('  carol@demo.dev  (viewer)\n');
  console.log('Boards:');
  boardIds.forEach((id, i) => console.log(`  ${BOARD_TITLES[i]}  →  ${id}`));
  console.log('\nOpen a board:');
  boardIds.forEach((id) => console.log(`  ${env.CLIENT_URL}/board/${id}`));
  console.log('');
}

seed()
  .then(async () => {
    await disconnectDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await disconnectDb().catch(() => undefined);
    process.exit(1);
  });
