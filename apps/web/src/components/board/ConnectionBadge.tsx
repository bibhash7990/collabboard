import { Loader2, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import type { ConnStatus } from '../../lib/yjsBoard';

const CONFIG: Record<ConnStatus, { label: string; className: string }> = {
  online: { label: 'Connected', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  connecting: { label: 'Connecting…', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  offline: { label: 'Offline', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** Live connection pill; mirrors `BoardConnection.onStatus`. */
export function ConnectionBadge({ status }: { status: ConnStatus }) {
  const { label, className } = CONFIG[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm',
        className,
      )}
    >
      {status === 'online' && <Wifi className="h-3.5 w-3.5" />}
      {status === 'connecting' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === 'offline' && <WifiOff className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}
