import { Link } from 'react-router-dom';
import { Compass, Shapes } from 'lucide-react';

/** Friendly catch-all for unmatched routes. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <Shapes className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">CollabBoard</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-xl shadow-slate-200/60">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Compass className="h-8 w-8" />
          </span>
          <p className="mt-6 text-5xl font-bold tracking-tight text-slate-900">404</p>
          <h1 className="mt-2 text-lg font-semibold text-slate-700">Page not found</h1>
          <p className="mt-1 text-sm text-slate-500">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
