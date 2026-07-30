import clsx from 'clsx';
import type { Role } from '@collabboard/shared';

const roleStyles: Record<Role, string> = {
  owner: 'bg-amber-100 text-amber-700',
  editor: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-slate-100 text-slate-600',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        roleStyles[role],
      )}
    >
      {role}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600',
        className,
      )}
    >
      {children}
    </span>
  );
}
