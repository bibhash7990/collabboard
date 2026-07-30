import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2 text-slate-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
