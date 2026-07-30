import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import clsx from 'clsx';
import { useToastStore, type ToastType } from '../../stores/toastStore';

const icons: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
};
const tones: Record<ToastType, string> = {
  info: 'border-slate-200 text-slate-700',
  success: 'border-emerald-200 text-emerald-700',
  error: 'border-red-200 text-red-700',
};

/** Global toast outlet — mounted once at the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 shadow-lg animate-slide-up',
              tones[t.type],
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
