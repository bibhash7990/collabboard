import type {
  Board,
  BoardMember,
  Invitation,
  Me,
  Role,
  ShareLink,
  Snapshot,
  User,
  Workspace,
  WorkspaceMember,
} from '@collabboard/shared';

/**
 * Tolerant document → DTO mappers. They accept either hydrated Mongoose docs or
 * `.lean()` objects (ids as ObjectId or string), so controllers can query however
 * is most efficient and still emit the exact shared DTO shape. This is the single
 * place the wire format is defined — keep controllers free of ad-hoc mapping.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const id = (v: any): string => (v?._id ?? v?.id ?? v)?.toString?.() ?? String(v);
const iso = (v: any): string => (v ? new Date(v).toISOString() : new Date().toISOString());

type UserLike = {
  _id?: any;
  id?: string;
  name: string;
  email: string;
  avatarColor?: string;
  emailVerified?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export function toUser(u: UserLike): User {
  return {
    id: id(u),
    email: u.email,
    name: u.name,
    avatarColor: u.avatarColor ?? '#6366f1',
    emailVerified: Boolean(u.emailVerified),
    createdAt: iso(u.createdAt),
  };
}

export function toMe(u: UserLike): Me {
  return { ...toUser(u), updatedAt: iso(u.updatedAt) };
}

export function toPublicUser(u: UserLike): Pick<User, 'id' | 'name' | 'email' | 'avatarColor'> {
  return { id: id(u), name: u.name, email: u.email, avatarColor: u.avatarColor ?? '#6366f1' };
}

/** A membership row where `user` may be populated or a bare id. */
type MemberLike = { user: any; role: Role };

function toMember(m: MemberLike): BoardMember & WorkspaceMember {
  const populated = m.user && typeof m.user === 'object' && 'name' in m.user;
  return {
    userId: id(m.user),
    role: m.role,
    user: populated ? toPublicUser(m.user) : undefined,
  };
}

export function toBoardMember(m: MemberLike): BoardMember {
  return toMember(m);
}
export function toWorkspaceMember(m: MemberLike): WorkspaceMember {
  return toMember(m);
}

export function toWorkspace(w: any, members: MemberLike[]): Workspace {
  return {
    id: id(w),
    name: w.name,
    ownerId: id(w.owner),
    members: members.map(toWorkspaceMember),
    createdAt: iso(w.createdAt),
    updatedAt: iso(w.updatedAt),
  };
}

export function toBoard(
  b: any,
  extra: {
    members?: MemberLike[];
    myRole?: Role;
    starred?: boolean;
    lastOpenedAt?: Date | string | null;
  } = {},
): Board {
  return {
    id: id(b),
    workspaceId: id(b.workspace),
    title: b.title,
    ownerId: id(b.owner),
    members: (extra.members ?? []).map(toBoardMember),
    isArchived: Boolean(b.isArchived),
    thumbnail: b.thumbnail ?? null,
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
    starred: extra.starred,
    lastOpenedAt: extra.lastOpenedAt
      ? iso(extra.lastOpenedAt)
      : ((extra.lastOpenedAt as null) ?? null),
    myRole: extra.myRole,
  };
}

export function toInvitation(i: any): Invitation {
  return {
    id: id(i),
    workspaceId: id(i.workspace),
    boardId: i.board ? id(i.board) : null,
    email: i.email,
    role: i.role,
    status: i.status,
    invitedBy: id(i.invitedBy),
    expiresAt: iso(i.expiresAt),
    createdAt: iso(i.createdAt),
  };
}

export function toShareLink(s: any, token?: string): ShareLink & { token: string } {
  return {
    id: id(s),
    boardId: id(s.board),
    token: token ?? '',
    mode: 'view',
    expiresAt: s.expiresAt ? iso(s.expiresAt) : null,
    createdBy: id(s.createdBy),
    createdAt: iso(s.createdAt),
    revoked: Boolean(s.revoked),
  };
}

export function toSnapshot(s: any): Snapshot {
  const size = s.size ?? s.state?.length ?? s.state?.byteLength ?? 0;
  return {
    id: id(s),
    boardId: id(s.board),
    doc: s.doc,
    state: '', // full state is fetched on demand, not in list responses
    label: s.label ?? '',
    createdBy: s.createdBy ? id(s.createdBy) : '',
    createdAt: iso(s.createdAt),
    size,
  };
}
