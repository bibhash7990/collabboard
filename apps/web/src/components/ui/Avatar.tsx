import clsx from 'clsx';

interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}

/** Initials avatar tinted by the user's presence color. */
export function Avatar({ name, color = '#6366f1', size = 32, className, ring }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      title={name}
      className={clsx(
        'inline-flex items-center justify-center rounded-full font-semibold text-white',
        ring && 'ring-2 ring-white',
        className,
      )}
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </span>
  );
}
