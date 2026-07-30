import { useMemo } from 'react';
import { colorForId } from '@collabboard/shared';
import { Avatar } from '../ui/Avatar';
import { useBoardStore } from '../../stores/boardStore';
import { useAuthStore } from '../../stores/authStore';

interface PresenceAvatarsProps {
  /** Max avatars before collapsing into a "+N" chip. */
  max?: number;
}

/** Overlapping avatar stack of everyone on the board — self first, then peers. */
export function PresenceAvatars({ max = 5 }: PresenceAvatarsProps) {
  const presence = useBoardStore((s) => s.presence);
  const self = useAuthStore((s) => s.user);

  // Collapse a user's many sockets into one avatar; keep self at the front.
  const people = useMemo(() => {
    const byUser = new Map<string, { id: string; name: string; color: string }>();
    if (self)
      byUser.set(self.id, { id: self.id, name: `${self.name} (you)`, color: self.avatarColor });
    for (const p of Object.values(presence)) {
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, {
          id: p.userId,
          name: p.name,
          color: p.color || colorForId(p.userId),
        });
      }
    }
    return Array.from(byUser.values());
  }, [presence, self]);

  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
          <Avatar name={p.name} color={p.color} size={30} ring />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="ml-[-8px] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white"
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
