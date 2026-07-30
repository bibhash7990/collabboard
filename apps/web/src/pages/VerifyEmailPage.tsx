import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Shapes, XCircle } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import { Spinner } from '../components/ui/Spinner';
import type { NormalizedError } from '../lib/apiClient';

type Status = 'loading' | 'success' | 'error';

/** Consumes the `?token=` link from the verification email and confirms the address. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const setUser = useAuthStore((s) => s.setUser);

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  // Guard against React 18 StrictMode double-invoke: the token is single-use.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }

    authApi
      .verifyEmail(token)
      .then((me) => {
        // Keep the signed-in profile in sync so the UI reflects the verified state.
        if (useAuthStore.getState().user?.id === me.id) setUser(me);
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setMessage((err as NormalizedError).message);
      });
  }, [token, setUser]);

  const signedIn = !!useAuthStore.getState().user;

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <Shapes className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">CollabBoard</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Spinner />
              <p className="text-sm text-slate-500">Verifying your email…</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h1 className="text-xl font-semibold text-slate-900">Email verified</h1>
              <p className="text-sm text-slate-500">
                Your address is confirmed. You&apos;re all set to collaborate.
              </p>
              <Link
                to={signedIn ? '/app' : '/login'}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                {signedIn ? 'Go to dashboard' : 'Continue to sign in'}
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <XCircle className="h-7 w-7" />
              </span>
              <h1 className="text-xl font-semibold text-slate-900">Verification failed</h1>
              <p className="text-sm text-slate-500">
                {message || 'This link may have expired or already been used.'}
              </p>
              <Link
                to={signedIn ? '/app' : '/login'}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {signedIn ? 'Back to dashboard' : 'Back to sign in'}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
